/**
 * G3 security chain — pure-TS crypto cross-checked against platform
 * primitives, SemVer precedence table, minisign wire-format round trips and
 * the updater's offline signature gate (`plugin:updater|verify_signature`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createHash,
  createPublicKey,
  generateKeyPairSync,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";
import {
  updaterPlugin,
  verifyMinisig,
  generateKeypair,
  signMinisig,
  parseSecretKeyFile,
  parseSignatureFile,
  dumpSignatureFile,
  compareSemver,
} from "../../packages/core/dist/index.js";
import { sha512 } from "../../packages/core/dist/plugins/crypto/sha512.js";
import { blake2b } from "../../packages/core/dist/plugins/crypto/blake2b.js";
import {
  signDetached,
  verifyDetached,
  publicKeyFromSeed,
} from "../../packages/core/dist/plugins/crypto/ed25519.js";

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Digest primitives

test("sha512 matches node:crypto across block boundaries", () => {
  const sizes = [0, 1, 55, 56, 111, 112, 127, 128, 255, 1000];
  for (const n of sizes) {
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = (i * 37 + 11) & 0xff;
    const ours = hex(sha512(data));
    const ref = createHash("sha512").update(data).digest("hex");
    assert.equal(ours, ref, `sha512 mismatch at ${n} bytes`);
  }
});

test("blake2b matches RFC vectors and node:crypto (blake2b512)", () => {
  // Well-known unkeyed digests of the empty message:
  assert.equal(
    hex(blake2b(new Uint8Array(0), 64)),
    "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce",
  );
  assert.equal(
    hex(blake2b(new Uint8Array(0), 32)),
    "0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8",
  );
  const data = new TextEncoder().encode("hello ztron");
  assert.equal(
    hex(blake2b(data, 64)),
    createHash("blake2b512").update(data).digest("hex"),
  );
});

// ---------------------------------------------------------------------------
// Ed25519 ↔ node:crypto interop

/** Ed25519 SPKI DER prefix (RFC 8410) followed by the raw 32-byte key. */
function pkToKeyObject(rawPk) {
  const prefix = Buffer.from("302a300506032b6570032100", "hex");
  return createPublicKey({
    key: Buffer.concat([prefix, Buffer.from(rawPk)]),
    format: "der",
    type: "spki",
  });
}

test("ed25519: our verifier accepts node-signed messages", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const rawPk = new Uint8Array(der.subarray(der.length - 32));

  const msg = new TextEncoder().encode("interop message");
  const sig = new Uint8Array(nodeSign(null, msg, privateKey));
  assert.equal(verifyDetached(sig, msg, rawPk), true);

  const bad = msg.slice();
  bad[0] ^= 1;
  assert.equal(verifyDetached(sig, bad, rawPk), false);
});

test("ed25519: node verifier accepts our deterministic signatures", () => {
  const seed = new Uint8Array(32);
  for (let i = 0; i < 32; i++) seed[i] = i;
  const pk = publicKeyFromSeed(seed);
  const sk = new Uint8Array(64);
  sk.set(seed, 0);
  sk.set(pk, 32);

  const msg = new TextEncoder().encode("our-side signature");
  const sig = signDetached(msg, sk);
  assert.equal(
    nodeVerify(null, msg, pkToKeyObject(pk), sig),
    true,
    "node rejects our signature",
  );
  assert.equal(verifyDetached(sig, msg, pk), true);
});

// ---------------------------------------------------------------------------
// SemVer precedence

test("semver: prerelease/build-metadata precedence per spec §11", () => {
  const lessThan = [
    ["1.0.0-alpha", "1.0.0"],
    ["1.0.0-alpha", "1.0.0-alpha.1"],
    ["1.0.0-alpha.1", "1.0.0-alpha.beta"],
    ["1.0.0-alpha.beta", "1.0.0-beta"],
    ["1.0.0-beta", "1.0.0-beta.2"],
    ["1.0.0-beta.2", "1.0.0-beta.11"],
    ["1.0.0-beta.11", "1.0.0-rc.1"],
    ["1.0.0-rc.1", "1.0.0"],
    ["1.0.0-beta+build.7", "1.0.0"],
    ["2.0.0", "10.0.0"],
    ["1.9.0", "1.10.0"],
  ];
  for (const [lo, hi] of lessThan) {
    assert.equal(compareSemver(lo, hi), -1, `${lo} < ${hi}`);
    assert.equal(compareSemver(hi, lo), 1, `${hi} > ${lo}`);
  }
  assert.equal(compareSemver("1.0.0+x", "1.0.0+y"), 0);
  assert.equal(compareSemver("1.0.0-a+b", "1.0.0-a"), 0); // build meta ignored
  assert.throws(() => compareSemver("abc", "1.0.0"));
});

// ---------------------------------------------------------------------------
// minisign wire format

test("minisign: keypair checksum + sign→verify round trip (prehashed ED)", () => {
  const { publicKeyText, secretKeyText, secret } = generateKeypair();
  const secretRe = parseSecretKeyFile(secretKeyText); // throws on bad chk
  assert.deepEqual([...secretRe.keynum], [...secret.keynum]);

  const data = new TextEncoder().encode("update artifact payload");
  const sigText = signMinisig(data, secret, { trustedComment: "release 42" });
  const res = verifyMinisig(data, sigText, publicKeyText);
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.trustedComment, "release 42");
  assert.equal(res.alg, "ED");

  // Serialization is exactly stable through parse→dump.
  assert.equal(dumpSignatureFile(parseSignatureFile(sigText)), sigText);
});

test("minisign: tampering fails closed on both signatures", () => {
  const { publicKeyText, secret } = generateKeypair();
  const data = new TextEncoder().encode("payload");
  let sigText = signMinisig(data, secret, { trustedComment: "t" });

  const mutated = data.slice();
  mutated[0] ^= 1;
  const r1 = verifyMinisig(mutated, sigText, publicKeyText);
  assert.equal(r1.ok, false);
  assert.equal(r1.error, "message-signature");

  const sig = parseSignatureFile(sigText);
  sig.trustedComment = "evil";
  sigText = dumpSignatureFile(sig, "signature from ztron signer");
  const r2 = verifyMinisig(data, sigText, publicKeyText);
  assert.equal(r2.ok, false);
  assert.equal(r2.error, "global-signature");

  const other = generateKeypair();
  const sigOther = signMinisig(data, other.secret, {});
  const r3 = verifyMinisig(data, sigOther, publicKeyText);
  assert.equal(r3.ok, false);
  assert.equal(r3.error, "keyid-mismatch");

  const r4 = verifyMinisig(data, "untrusted comment: x\ngarbage!!\n", publicKeyText);
  assert.equal(r4.ok, false);
  assert.equal(r4.error, "format");
});

test("updater: verify_signature routes the offline gate end-to-end", async () => {
  const { publicKeyText, secret } = generateKeypair();
  const plugin = updaterPlugin({
    currentVersion: "1.0.0",
    pubkey: publicKeyText,
  });
  const data = new TextEncoder().encode("offline gate");
  const good = signMinisig(data, secret, {});
  const okRes = await plugin.commands["verify_signature"](
    { data: Buffer.from(data).toString("base64"), signature: good, pubkey: publicKeyText },
    undefined,
  );
  assert.equal(okRes.ok, true, JSON.stringify(okRes));

  const evil = data.slice();
  evil[3] ^= 0xff;
  const badRes = await plugin.commands["verify_signature"](
    { data: Buffer.from(evil).toString("base64"), signature: good, pubkey: publicKeyText },
    undefined,
  );
  assert.equal(badRes.ok, false);
  assert.equal(badRes.error, "message-signature");
});
