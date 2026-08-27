/**
 * Ed25519 (RFC 8032) — pure TypeScript, BigInt-based.
 *
 * Pure-TS because the tjs WebCrypto surface lacks Ed25519 while the updater
 * must verify minisign update signatures offline (GAP.md D1). Signatures use
 * regular-form scalars exactly like libsodium's `crypto_sign_*`, so key and
 * signature artifacts are byte-interoperable with real minisign / signify.
 *
 * Cross-checked against Node's `crypto` Ed25519 in the unit suite.
 */
import { sha512 } from "./sha512.js";

/** Field prime: 2^255 − 19. */
const P = (1n << 255n) - 19n;
/** Group order L (RFC 8032 §5.1). */
export const ORDER_L = 2n ** 252n + 27742317777372353535851937790883648493n;

type Fe = bigint; // always reduced: 0 <= x < P

function mod(x: bigint): Fe {
  const r = x % P;
  return r < 0n ? r + P : r;
}

/** Modular inverse via Fermat: x^(p−2). */
function invert(x: Fe): bigint {
  let acc = 1n;
  let b = mod(x);
  let e = P - 2n;
  while (e > 0n) {
    if (e & 1n) acc = (acc * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return acc;
}

const feAdd = (a: bigint, b: bigint): bigint => mod(a + b);
const feSub = (a: bigint, b: bigint): bigint => mod(a - b);
const feMul = (a: bigint, b: bigint): bigint => mod(a * b);

/** Modular exponentiation. */
function pow(base: bigint, exp: bigint): bigint {
  let acc = 1n;
  let b = base;
  while (exp > 0n) {
    if (exp & 1n) acc = feMul(acc, b);
    b = feMul(b, b);
    exp >>= 1n;
  }
  return acc;
}

/** Twisted-Edwards curve constant d = −121665/121666 (mod p). */
const D = mod(-121665n * invert(121666n));

interface Point {
  X: bigint;
  Y: bigint;
  Z: bigint;
  T: bigint;
}

const ZERO_POINT: Point = { X: 0n, Y: 1n, Z: 1n, T: 0n };

/**
 * Unified addition — RFC 8032 §5.1.4 extended coordinates (valid for
 * doubling too, so scalarMult needs no separate doubling routine).
 */
function addPoints(p: Point, q: Point): Point {
  // A=(Y1−X1)(Y2−X2) B=(Y1+X1)(Y2+X2) C=2·d·T1·T2 Dd=2·Z1·Z2
  const a = feMul(feSub(p.Y, p.X), feSub(q.Y, q.X));
  const b = feMul(feAdd(p.Y, p.X), feAdd(q.Y, q.X));
  const c = feMul(2n * D, feMul(p.T, q.T));
  const dd = feMul(2n * p.Z, q.Z);
  const e = feSub(b, a);
  const f = feSub(dd, c);
  const g = feAdd(dd, c);
  const h = feAdd(b, a);
  return { X: feMul(e, f), Y: feMul(g, h), T: feMul(e, h), Z: feMul(f, g) };
}

/** Base point recovered from its canonical compressed encoding (y=4/5). */
function decodeBase(): Point {
  const enc = new Uint8Array(32);
  enc[0] = 0x58;
  enc.fill(0x66, 1); // 0x58 || 0x66 × 31
  const p = decodePoint(enc);
  if (!p) throw new Error("ed25519: base point failed to decode");
  return p;
}

const BASE: Point = decodeBase();

function scalarMult(k: bigint, p: Point): Point {
  let acc = ZERO_POINT;
  let cur = p;
  let n = k;
  while (n > 0n) {
    if (n & 1n) acc = addPoints(acc, cur);
    cur = addPoints(cur, cur);
    n >>= 1n;
  }
  return acc;
}

function encodeFe32(f: bigint): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = Number((f >> BigInt(i * 8)) & 0xffn);
  return out;
}

/** Little-endian integer over ANY byte length (hash outputs are 64B). */
function decodeScalarLE(bytes: Uint8Array): bigint {
  let v = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) {
    const b = bytes[i];
    if (b !== undefined) v = (v << 8n) | BigInt(b);
    else v <<= 8n;
  }
  return v;
}

function decodeScalar32(bytes: Uint8Array): bigint {
  return decodeScalarLE(bytes.subarray(0, 32));
}

function encodePoint(p: Point): Uint8Array {
  const zi = invert(p.Z)!;
  const x = feMul(p.X, zi);
  const y = feMul(p.Y, zi);
  const out = encodeFe32(y);
  out[31]! |= Number(x & 1n) << 7;
  return out;
}

/** §5.1.3 compressed-point decoding; null when off-curve/non-canonical. */
function decodePoint(bytes: Uint8Array): Point | null {
  if (bytes.length !== 32) return null;
  const yb = bytes.slice();
  const xSign = (yb[31]! >> 7) & 1;
  yb[31]! &= 0x7f;
  const y = decodeScalar32(yb);
  if (y >= P) return null;

  // x² = u/v, u = y²−1, v = d·y²+1; recover via (u·v³)(u·v⁷)^((p−5)/8).
  const yy = feMul(y, y);
  const u = feSub(yy, 1n);
  const v = feAdd(feMul(D, yy), 1n);
  const v3 = feMul(v, feMul(v, v));
  const v7 = feMul(v3, feMul(v3, v));
  let x = feMul(feMul(u, v3), pow(feMul(u, v7), (P - 5n) >> 3n));
  const vx2 = feMul(v, feMul(x, x));
  if (vx2 === u) {
    /* candidate good */
  } else if (vx2 === mod(-u)) {
    x = feMul(x, pow(2n, (P - 1n) >> 2n)); // multiply by √−1
    if (feMul(v, feMul(x, x)) !== u) return null;
  } else {
    return null;
  }
  if (Number(x & 1n) !== xSign) x = P - x;
  return { X: x, Y: y, Z: 1n, T: feMul(x, y) };
}

/** Clamps SHA-512(seed)[0..32] into the secret scalar (§5.1.5). */
function clamp(h: Uint8Array): bigint {
  const a = h.slice(0, 32);
  a[0]! &= 248;
  a[31] = (a[31]! & 63) | 64;
  return decodeScalar32(a);
}

function sha512b(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const part of parts) len += part.length;
  const buf = new Uint8Array(len);
  let off = 0;
  for (const part of parts) {
    buf.set(part, off);
    off += part.length;
  }
  return sha512(buf);
}

/** Derives the public key from a 32-byte seed (`sk[0..32]`). */
export function publicKeyFromSeed(seed: Uint8Array): Uint8Array {
  const a = clamp(sha512(seed));
  return encodePoint(scalarMult(a, BASE));
}

/** Deterministic detached signature over `message` (libsodium-compatible). */
export function signDetached(
  message: Uint8Array,
  secretKey64: Uint8Array,
): Uint8Array {
  const seed = secretKey64.slice(0, 32);
  const pk = secretKey64.slice(32, 64);
  const prefix = sha512(seed).slice(32);
  const a = clamp(sha512(seed));

  const r = decodeScalarLE(sha512b(prefix, message)) % ORDER_L;
  const rEnc = encodePoint(scalarMult(r, BASE));
  const k = decodeScalarLE(sha512b(rEnc, pk, message)) % ORDER_L;
  const s = (r + ((k * a) % ORDER_L)) % ORDER_L;
  const sig = new Uint8Array(64);
  sig.set(rEnc);
  sig.set(encodeFe32(s), 32);
  return sig;
}

/** Verifies a detached signature (libsodium group-check form). */
export function verifyDetached(
  signature: Uint8Array,
  message: Uint8Array,
  publicKey: Uint8Array,
): boolean {
  if (signature.length !== 64 || publicKey.length !== 32) return false;
  const s = decodeScalar32(signature.slice(32));
  if (s >= ORDER_L) return false;
  const aPoint = decodePoint(publicKey);
  if (!aPoint) return false;
  const rEnc = signature.slice(0, 32);
  const rPoint = decodePoint(rEnc);
  if (!rPoint) return false;
  const k = decodeScalarLE(sha512b(rEnc, publicKey, message)) % ORDER_L;

  // Group check: [s]B == R + [k]A (libsodium's cofactor-free form).
  const lhs = scalarMult(s, BASE);
  const rhs = addPoints(rPoint, scalarMult(k, aPoint));
  return (
    feMul(lhs.X, rhs.Z) === feMul(rhs.X, lhs.Z) &&
    feMul(lhs.Y, rhs.Z) === feMul(rhs.Y, lhs.Z)
  );
}

