/**
 * minisign-compatible signatures (GAP.md D1 / F4) — wire-exact with
 * jedisct1/minisign so artifacts interoperate with the real tool:
 *
 *   public key file   : "untrusted comment: …\n" + b64("Ed" ‖ keynum₈ ‖ pk₃₂)
 *   signature file    : "untrusted comment: …\n"
 *                       + b64(SigStruct = ("Ed"|"ED") ‖ keynum₈ ‖ sig₆₄)
 *                       + "trusted comment: …\n"
 *                       + b64(global_sig₆₄)
 *
 * Verification (mirrors minisign.c):
 *   1. "ED" ⇒ message digest is BLAKE2b-512(file bytes); "Ed" ⇒ raw bytes.
 *      Legacy non-prehashed artifacts are accepted only in legacy mode.
 *   2. Ed25519-verify `sig` over that message against the public key.
 *   3. Ed25519-verify `global_sig` over `sig ‖ trusted-comment-bytes`.
 *
 * Secret keys are supported UNENCRYPTED ONLY (kdf_alg "\0\0"), matching
 * `ztron signer --unencrypted`; password-boxed secrets arrive with a later
 * batch (see GAP.md F4 note).
 */
import { blake2b } from "./crypto/blake2b.js";
import {
  publicKeyFromSeed,
  signDetached,
  verifyDetached,
} from "./crypto/ed25519.js";

const PK_MAGIC = "Ed";
const SIG_ALG_PLAIN = "Ed";
const SIG_ALG_PREHASHED = "ED";

function b64encode(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64decode(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function ascii(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export interface MinisignPublicKey {
  keynum: Uint8Array;
  pk: Uint8Array;
}

/** Parses the textual contents of a `.pub` file. */
export function parsePublicKeyFile(text: string): MinisignPublicKey {
  const blob = firstBase64Line(text);
  if (blob.length !== 42 || ascii(blob.slice(0, 2)) !== PK_MAGIC) {
    throw new Error("minisign: invalid public key file");
  }
  return { keynum: blob.slice(2, 10), pk: blob.slice(10, 42) };
}

/** Serializes back to the public-key file text form. */
export function dumpPublicKeyFile(
  key: MinisignPublicKey,
  comment = "ztron signer public key",
): string {
  const blob = new Uint8Array(42);
  blob.set(utf8(PK_MAGIC), 0);
  blob.set(key.keynum, 2);
  blob.set(key.pk, 10);
  return `${untrustedComment(comment)}${b64encode(blob)}\n`;
}

export interface MinisignSignature {
  /** "Ed" (legacy) or "ED" (prehashed with BLAKE2b-512). */
  alg: string;
  keynum: Uint8Array;
  /** The 64-byte Ed25519 signature over the (possibly digested) message. */
  sig: Uint8Array;
  trustedComment: string;
  globalSig: Uint8Array;
}

/** Parses the textual contents of a `.minisig` file. */
export function parseSignatureFile(text: string): MinisignSignature {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.length > 0);
  // Shape: [any] b64 SigStruct ["trusted comment: x"] b64 global_sig
  const b64Lines = lines.filter((l) => !l.startsWith("trusted comment:") && !l.startsWith("untrusted comment:"));
  if (b64Lines.length < 2) {
    throw new Error("minisign: invalid signature file");
  }
  const blob = b64decode(b64Lines[0]!);
  if (blob.length !== 74) {
    throw new Error("minisign: invalid signature blob");
  }
  const alg = ascii(blob.slice(0, 2));
  if (alg !== SIG_ALG_PLAIN && alg !== SIG_ALG_PREHASHED) {
    throw new Error(`minisign: unknown signature algorithm ${JSON.stringify(alg)}`);
  }
  const trustedLine = lines.find((l) =>
    l.startsWith("trusted comment:"),
  );
  return {
    alg,
    keynum: blob.slice(2, 10),
    sig: blob.slice(10, 74),
    trustedComment: trustedLine
      ? trustedLine.slice("trusted comment:".length + 1)
      : "",
    globalSig: b64decode(b64Lines[1]!),
  };
}

/** Serializes a parsed signature back into `.minisig` text form. */
export function dumpSignatureFile(
  sig: MinisignSignature,
  headerComment = "signature from ztron signer",
): string {
  const blob = new Uint8Array(74);
  blob.set(utf8(sig.alg), 0);
  blob.set(sig.keynum, 2);
  blob.set(sig.sig, 10);
  return (
    `${untrustedComment(headerComment)}${b64encode(blob)}\n` +
    `${sig.trustedComment ? `trusted comment: ${sig.trustedComment}\n` : ""}` +
    `${b64encode(sig.globalSig)}\n`
  );
}

export interface VerifyResult {
  ok: boolean;
  /** Failure detail when ok=false (interop-debuggable). */
  error?: "format" | "keyid-mismatch" | "message-signature" | "global-signature";
  trustedComment?: string;
  alg?: string;
}

/**
 * Full minisign verification: content signature AND the trusted-comment
 * global signature must both hold under the same public key.
 */
export function verifyMinisig(
  message: Uint8Array,
  signatureText: string,
  publicKeyText: string,
  opts: { allowLegacyPlain?: boolean } = {},
): VerifyResult {
  let pub: MinisignPublicKey;
  let sig: MinisignSignature;
  try {
    pub = parsePublicKeyFile(publicKeyText);
    sig = parseSignatureFile(signatureText);
  } catch (e) {
    void e;
    return { ok: false, error: "format" };
  }
  if (!keysMatch(pub.keynum, sig.keynum)) {
    return { ok: false, error: "keyid-mismatch", alg: sig.alg };
  }
  const signed =
    sig.alg === SIG_ALG_PREHASHED ? blake2b(message, 64) : message;
  if (sig.alg === SIG_ALG_PLAIN && !opts.allowLegacyPlain) {
    return { ok: false, error: "format", alg: sig.alg };
  }
  if (!verifyDetached(sig.sig, signed, pub.pk)) {
    return { ok: false, error: "message-signature", alg: sig.alg };
  }
  const combined = new Uint8Array(64 + utf8(sig.trustedComment).length);
  combined.set(sig.sig, 0);
  combined.set(utf8(sig.trustedComment), 64);
  if (!verifyDetached(sig.globalSig, combined, pub.pk)) {
    return {
      ok: false,
      error: "global-signature",
      trustedComment: sig.trustedComment,
      alg: sig.alg,
    };
  }
  return { ok: true, trustedComment: sig.trustedComment, alg: sig.alg };
}

function keysMatch(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Keypair generation + signing (unencrypted secret keys)

export interface UnencryptedSecretKey {
  keynum: Uint8Array;
  /** 64-byte libsodium layout: seed(32) ‖ pk(32). */
  sk64: Uint8Array;
}

/** Generates an unencrypted keypair; returned texts are minisign-compatible. */
export function generateKeypair(comment = "ztron signer"): {
  publicKeyText: string;
  secretKeyText: string;
  secret: UnencryptedSecretKey;
} {
  const rng = (
    globalThis as unknown as {
      crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    }
  ).crypto;
  if (!rng?.getRandomValues) {
    throw new Error("minisign: no secure RNG available on this runtime");
  }
  const seed = new Uint8Array(32);
  rng.getRandomValues(seed);
  const pk = publicKeyFromSeed(seed);
  const keynum = new Uint8Array(8);
  rng.getRandomValues(keynum);

  const sk64 = new Uint8Array(64);
  sk64.set(seed, 0);
  sk64.set(pk, 32);

  const secret: UnencryptedSecretKey = { keynum, sk64 };
  return {
    publicKeyText: dumpPublicKeyFile({ keynum, pk }, comment),
    secretKeyText: dumpSecretKeyFile(secret),
    secret,
  };
}

/** SeckeyStruct: "Ed"‖"\0\0"‖"B2"‖salt₃₂(0)‖ops₈(0)‖mem₈(0)‖keynum₈‖sk₆₄‖chk₃₂ */
function dumpSecretKeyFile(secret: UnencryptedSecretKey): string {
  const body = new Uint8Array(
    2 + 2 + 2 + 32 + 8 + 8 + 8 + 64 + 32,
  );
  let off = 0;
  body.set(utf8(PK_MAGIC), off); off += 2;
  off += 2; // kdf_alg KDFNONE = \0\0 (already zero)
  body.set(utf8("B2"), off); off += 2;
  off += 48; // salt(32) + opslimit(8) + memlimit(8), zeros for no-KDF
  body.set(secret.keynum, off); off += 8;
  body.set(secret.sk64, off); off += 64;
  // checksum: BLAKE2b-256 over (sig_alg ‖ keynum ‖ sk) — seckey_compute_chk()
  const chkInput = new Uint8Array(2 + 8 + 64);
  chkInput.set(utf8(PK_MAGIC), 0);
  chkInput.set(secret.keynum, 2);
  chkInput.set(secret.sk64, 10);
  body.set(blake2b(chkInput, 32), off);
  return `${untrustedComment("minisign encrypted secret key")}${b64encode(body)}\n`;
}

/** Loads an unencrypted secret key from its file text.
    Layout: alg₂‖kdf₂‖chk₂‖salt₃₂‖ops₈‖mem₈‖keynum₈‖sk₆₄‖chk₃₂ (=158B). */
export function parseSecretKeyFile(text: string): UnencryptedSecretKey {
  const blob = firstBase64Line(text);
  if (blob.length !== 158 || ascii(blob.slice(0, 2)) !== PK_MAGIC) {
    throw new Error("minisign: unsupported secret key (need unencrypted)");
  }
  const kdfAlg = ascii(blob.slice(2, 4));
  if (kdfAlg !== "\x00\x00") {
    throw new Error("minisign: password-protected secret keys not supported");
  }
  const keynum = blob.slice(54, 62);
  const sk64 = blob.slice(62, 126);
  const expectedChk = blob.slice(126, 158);
  const chkInput = new Uint8Array(2 + 8 + 64);
  chkInput.set(utf8(PK_MAGIC), 0);
  chkInput.set(keynum, 2);
  chkInput.set(sk64, 10);
  const actual = blake2b(chkInput, 32);
  for (let i = 0; i < 32; i++) {
    if (actual[i] !== expectedChk[i]) {
      throw new Error("minisign: secret key checksum mismatch");
    }
  }
  return { keynum, sk64 };
}

/** Produces a complete `.minisig` text over `data`, minisign-style. */
export function signMinisig(
  data: Uint8Array,
  secret: UnencryptedSecretKey,
  opts: { trustedComment?: string; untrustedComment?: string } = {},
): string {
  const digest = blake2b(data, 64);
  const msgSig = signDetached(digest, secret.sk64);
  const trustedComment =
    opts.trustedComment ?? `timestamp:${new Date().toISOString()}`;
  const combined = new Uint8Array(64 + utf8(trustedComment).length);
  combined.set(msgSig, 0);
  combined.set(utf8(trustedComment), 64);
  const globalSig = signDetached(combined, secret.sk64);

  const blob = new Uint8Array(74);
  blob.set(utf8(SIG_ALG_PREHASHED), 0);
  blob.set(secret.keynum, 2);
  blob.set(msgSig, 10);
  return (
    untrustedComment(opts.untrustedComment ?? "signature from ztron signer") +
    `${b64encode(blob)}\n` +
    `trusted comment: ${trustedComment}\n` +
    `${b64encode(globalSig)}\n`
  );
}

function untrustedComment(text: string): string {
  return `untrusted comment: ${text}\n`;
}

function firstBase64Line(text: string): Uint8Array {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (
      line.startsWith("untrusted comment:") ||
      line.startsWith("trusted comment:")
    ) {
      continue;
    }
    return b64decode(line);
  }
  throw new Error("minisign: no base64 payload found");
}
