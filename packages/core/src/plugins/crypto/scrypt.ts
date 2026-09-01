/**
 * scrypt (RFC 7914) — pure TypeScript on Uint32Array.
 * Structure ported from the widely-deployed ricmoo/scrypt-js (scratch-buffer
 * blockmix), cross-checked against node:crypto's scryptSync across a
 * parameter matrix in tests (DESIGN 122).
 */
import { pbkdf2Sha256 } from "./sha256.js";

/** Salsa20/8 core in place on 16 words (exported for vector tests). */
export function salsa20_8(B: Uint32Array): void {
  const x = new Uint32Array(16);
  x.set(B);
  const R = (v: number, n: number) => ((v << n) | (v >>> (32 - n))) >>> 0;
  const qr = (
    a: number, b: number, c: number, d: number,
  ) => {
    x[b] = ((x[b]! ^ R((x[a]! + x[d]!) >>> 0, 7)) >>> 0);
    x[c] = ((x[c]! ^ R((x[b]! + x[a]!) >>> 0, 9)) >>> 0);
    x[d] = ((x[d]! ^ R((x[c]! + x[b]!) >>> 0, 13)) >>> 0);
    x[a] = ((x[a]! ^ R((x[d]! + x[c]!) >>> 0, 18)) >>> 0);
  };
  for (let i = 0; i < 4; i++) {
    qr(0, 4, 8, 12); qr(5, 9, 13, 1); qr(10, 14, 2, 6); qr(15, 3, 7, 11);
    qr(0, 1, 2, 3); qr(5, 6, 7, 4); qr(10, 11, 8, 9); qr(15, 12, 13, 14);
  }
  for (let i = 0; i < 16; ++i) B[i] = (B[i]! + x[i]!) >>> 0;
}

function copy(
  src: Uint32Array,
  srcPos: number,
  dest: Uint32Array,
  destPos: number,
  length: number,
): void {
  for (let i = 0; i < length; i++) dest[destPos + i] = src[srcPos + i]!;
}

function xorIn(
  src: Uint32Array,
  srcPos: number,
  dest: Uint32Array,
  length: number,
): void {
  for (let i = 0; i < length; i++) {
    dest[i] = (dest[i]! ^ src[srcPos + i]!) >>> 0;
  }
}

/** blockmix: results land back in B[0..32r); Y uses a separate scratch. */
function blockMix(
  B: Uint32Array,
  r: number,
  X: Uint32Array,
  Y: Uint32Array,
): void {
  copy(B, (2 * r - 1) * 16, X, 0, 16);
  for (let i = 0; i < 2 * r; i++) {
    xorIn(B, i * 16, X, 16);
    salsa20_8(X);
    copy(X, 0, Y, i * 16, 16);
  }
  for (let i = 0; i < r; i++) {
    copy(Y, i * 2 * 16, B, i * 16, 16);
  }
  for (let i = 0; i < r; i++) {
    copy(Y, (i * 2 + 1) * 16, B, (i + r) * 16, 16);
  }
}

function roMix(
  B: Uint32Array,
  Bi: number,
  r: number,
  N: number,
  V: Uint32Array,
): void {
  const Yi = 32 * r;
  const X = new Uint32Array(Yi);
  const Xs = new Uint32Array(16);
  const Y = new Uint32Array(Yi);

  copy(B, Bi, X, 0, Yi);
  for (let i = 0; i < N; i++) {
    copy(X, 0, V, i * Yi, Yi);
    blockMix(X, r, Xs, Y);
  }
  for (let i = 0; i < N; i++) {
    /* Integerify: first word of the LAST block, & (N-1) — exact for
       power-of-two N <= 2^32. */
    const j = X[(2 * r - 1) * 16]! & (N - 1);
    xorIn(V, j * Yi, X, Yi);
    blockMix(X, r, Xs, Y);
  }
  copy(X, 0, B, Bi, Yi);
}

function bytesToWords(bytes: Uint8Array): Uint32Array {
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] =
      (bytes[i * 4]! | (bytes[i * 4 + 1]! << 8) | (bytes[i * 4 + 2]! << 16) |
        (bytes[i * 4 + 3]! << 24)) >>>
      0;
  }
  return out;
}

function wordsToBytes(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(words.length * 4);
  for (let i = 0; i < words.length; i++) {
    out[i * 4] = words[i]! & 0xff;
    out[i * 4 + 1] = (words[i]! >>> 8) & 0xff;
    out[i * 4 + 2] = (words[i]! >>> 16) & 0xff;
    out[i * 4 + 3] = (words[i]! >>> 24) & 0xff;
  }
  return out;
}

/** scrypt KDF; dkLen bytes derived from passphrase + salt (N power of two). */
export function scrypt(
  password: Uint8Array,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  dkLen: number,
): Uint8Array {
  const B = bytesToWords(pbkdf2Sha256(password, salt, 1, p * 128 * r));
  const V = new Uint32Array(32 * r * N);
  for (let i = 0; i < p; i++) {
    roMix(B, i * 32 * r, r, N, V);
  }
  return pbkdf2Sha256(password, wordsToBytes(B), 1, dkLen);
}
