/**
 * E2 — stronghold: primitive cross-checks vs node:crypto, vault lifecycle
 * round trips, wrong-password/tamper fail-closed behavior.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, pbkdf2Sync, scryptSync, createCipheriv } from "node:crypto";
import {
  sha256,
  hmacSha256,
  pbkdf2Sha256,
} from "../../packages/core/dist/plugins/crypto/sha256.js";
import { scrypt, salsa20_8 } from "../../packages/core/dist/plugins/crypto/scrypt.js";
import {
  chacha20poly1305Encrypt,
  chacha20poly1305Decrypt,
  poly1305,
} from "../../packages/core/dist/plugins/crypto/chacha20poly1305.js";
import { buildApp } from "../helpers/buildApp.ts";

const eq = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
const te = (s: string) => new TextEncoder().encode(s);

test("stronghold primitives: sha256/hmac/pbkdf2 vs node:crypto", () => {
  assert.ok(eq(sha256(te("abc")), createHash("sha256").update("abc").digest()));
  assert.ok(
    eq(hmacSha256(te("k"), te("data")), createHmac("sha256", "k").update("data").digest()),
  );
  assert.ok(eq(pbkdf2Sha256(te("p"), te("s"), 3, 96), pbkdf2Sync("p", "s", 3, 96, "sha256")));
});

test("stronghold primitives: poly1305 RFC 8439 vector", () => {
  const key = Uint8Array.from(Buffer.from(
    "85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b", "hex"));
  const tag = poly1305(key, te("Cryptographic Forum Research Group"));
  assert.equal(Buffer.from(tag).toString("hex"), "a8061dc1305136c6c22b8baf0c0127a9");
});

test("stronghold primitives: scrypt matrix vs node + RFC empty vector", () => {
  for (const [N, r, p] of [[2, 1, 1], [16, 1, 1], [16, 2, 1], [2, 1, 2], [64, 2, 1]] as const) {
    assert.ok(
      eq(scrypt(te("pw"), te("salt"), N, r, p, 32), scryptSync("pw", "salt", 32, { N, r, p })),
      `scrypt N=${N} r=${r} p=${p} mismatch`,
    );
  }
  /* Salsa20/8 core RFC 7914 §8. */
  const inp = Buffer.from(
    "7e879a214f3ec9867ca940e641718f26baee555b8c61c1b50df846116dcd3b1d" +
    "ee24f319df9b3d8514121e4b5ac5aa3276021d2909c74829edebc68db8b8c25e", "hex");
  const w = new Uint32Array(16);
  for (let i = 0; i < 16; i++) {
    w[i] = (inp[i * 4]! | (inp[i * 4 + 1]! << 8) | (inp[i * 4 + 2]! << 16) |
      (inp[i * 4 + 3]! << 24)) >>> 0;
  }
  salsa20_8(w);
  const out = Buffer.alloc(64);
  for (let i = 0; i < 16; i++) {
    out[i * 4] = w[i]! & 0xff;
    out[i * 4 + 1] = (w[i]! >>> 8) & 0xff;
    out[i * 4 + 2] = (w[i]! >>> 16) & 0xff;
    out[i * 4 + 3] = (w[i]! >>> 24) & 0xff;
  }
  assert.equal(out.toString("hex"),
    "a41f859c6608cc993b81cacb020cef05044b2181a2fd337dfd7b1c6396682f29" +
    "b4393168e3c9e6bcfe6bc5b7a06d96bae424cc102c91745c24ad673dc7618f81");

  /* RFC 7914 §12 empty-input vector. */
  const expect =
    "77d6576238657b203b19ca42c18a0497f16b4844e3074ae8dfdffa3fede21442" +
    "fcd0069ded0948f8326a753a0fc81f17e8d3e0fb2e0d3628cf35e20c38d18906";
  assert.equal(
    Buffer.from(scrypt(new Uint8Array(0), new Uint8Array(0), 16, 1, 1, 64)).toString("hex"),
    expect,
  );
});

test("stronghold primitives: chacha20-poly1305 vs node:crypto (ct+tag)", () => {
  const key = Buffer.from("808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f", "hex");
  const nonce = Buffer.from("070000004041424344454647", "hex");
  const pt = te(
    "Ladies and Gentlemen of the class of '99: If I could offer you only one tip for the future, sunscreen would be it.",
  );
  const ours = chacha20poly1305Encrypt(key, nonce, pt);
  const c = createCipheriv("chacha20-poly1305", key, nonce);
  const ct = c.update(pt);
  c.final();
  assert.ok(eq(ours.ciphertext, ct));
  assert.ok(eq(ours.tag, c.getAuthTag()));
  /* decrypt of node's framing round-trips */
  assert.ok(eq(chacha20poly1305Decrypt(key, nonce, ct, c.getAuthTag())!, pt));
  /* tag tamper -> null */
  const badTag = new Uint8Array(c.getAuthTag());
  badTag[0]! ^= 1;
  assert.equal(chacha20poly1305Decrypt(key, nonce, ct, badTag), null);
});

test("stronghold vault: lifecycle round trip + wrong password + tamper", async () => {
  const { mock, tjs } = buildApp();
  const path = "/tmp/ztron-test/stronghold-e2e.bin";
  await tjs.remove(path).catch(() => {});

  const loaded = (await mock.main.invoke("plugin:stronghold|load", {
    path,
    password: "hunter2",
  })) as { entries: number };
  assert.equal(loaded.entries, 0);

  await mock.main.invoke("plugin:stronghold|set", { path, key: "secret", value: { v: 42 } });
  await mock.main.invoke("plugin:stronghold|set", { path, key: "tok", value: "abc" });
  assert.equal(
    await mock.main.invoke("plugin:stronghold|has", { path, key: "secret" }),
    true,
  );
  assert.deepEqual(await mock.main.invoke("plugin:stronghold|keys", { path }), [
    "secret",
    "tok",
  ]);

  /* persisted snapshot is opaque (no plaintext) */
  await mock.main.invoke("plugin:stronghold|save", { path });
  const raw = Buffer.from(await tjs.readFile(path));
  assert.ok(!raw.includes("secret") && !raw.includes("abc"));
  assert.equal(raw.subarray(0, 5).toString("utf8"), "ZTSH1");

  /* close forgets; wrong password on the sealed file fails closed */
  await mock.main.invoke("plugin:stronghold|close", { path });
  await assert.rejects(
    () => mock.main.invoke("plugin:stronghold|load", { path, password: "nope" }),
    (e: unknown) =>
      String((e as { error?: string }).error ?? e).includes("wrong password"),
  );

  /* correct password reopens from disk with data intact */
  const reopened = (await mock.main.invoke("plugin:stronghold|load", {
    path,
    password: "hunter2",
  })) as { entries: number };
  assert.equal(reopened.entries, 2);
  assert.deepEqual(await mock.main.invoke("plugin:stronghold|get", { path, key: "secret" }), {
    v: 42,
  });

  /* ciphertext tamper fails closed at the Poly1305 tag */
  await mock.main.invoke("plugin:stronghold|close", { path });
  raw[raw.length - 20] ^= 0xff;
  await tjs.writeFile(path, raw);
  await assert.rejects(
    () => mock.main.invoke("plugin:stronghold|load", { path, password: "hunter2" }),
    (e: unknown) =>
      String((e as { error?: string }).error ?? e).includes("wrong password"),
  );
});

test("signer encrypted secret key: round trip + wrong password (F4 tail)", async () => {
  const core = await import("../../packages/core/dist/index.js");
  const { publicKeyText, secret } = core.generateKeypair();

  const encText = core.dumpEncryptedSecretKeyFile(secret, "hunter2", { n: 1024, r: 8 });
  assert.ok(encText.includes("untrusted comment:"));
  /* the b64 blob must not contain the raw key bytes */
  assert.ok(!encText.includes(Buffer.from(secret.sk64).toString("base64").slice(0, 24)));

  /* wrong password -> checksum gate */
  assert.throws(
    () => core.parseSecretKeyFile(encText, "wrong"),
    /wrong password/,
  );
  /* no password on encrypted key -> explicit error */
  assert.throws(() => core.parseSecretKeyFile(encText), /password required/);

  /* correct password -> identical key material, signs verifiably */
  const sk = core.parseSecretKeyFile(encText, "hunter2");
  assert.deepEqual([...sk.keynum], [...secret.keynum]);
  assert.deepEqual([...sk.sk64], [...secret.sk64]);
  const data = te("encrypted-key payload");
  const sig = core.signMinisig(data, sk, {});
  assert.equal(core.verifyMinisig(data, sig, publicKeyText).ok, true);

  /* unencrypted files still parse without a password */
  const plain = core.generateKeypair();
  const parsed = core.parseSecretKeyFile(plain.secretKeyText);
  assert.deepEqual([...parsed.sk64], [...plain.secret.sk64]);
});
