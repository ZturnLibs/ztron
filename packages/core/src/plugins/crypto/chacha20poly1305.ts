/**
 * ChaCha20-Poly1305 AEAD (RFC 8439) — pure TypeScript. Cross-checked
 * against node:crypto's 'chacha20-poly1305' in tests.
 */

const ROTL = (v: number, n: number) => ((v << n) | (v >>> (32 - n))) >>> 0;

function quarterRound(
  s: Uint32Array,
  a: number, b: number, c: number, d: number,
): void {
  s[a] = (s[a]! + s[b]!) >>> 0; s[d] = ROTL(s[d]! ^ s[a]!, 16);
  s[c] = (s[c]! + s[d]!) >>> 0; s[b] = ROTL(s[b]! ^ s[c]!, 12);
  s[a] = (s[a]! + s[b]!) >>> 0; s[d] = ROTL(s[d]! ^ s[a]!, 8);
  s[c] = (s[c]! + s[d]!) >>> 0; s[b] = ROTL(s[b]! ^ s[c]!, 7);
}

/** One 64-byte ChaCha20 keystream block (counter = word 12). */
function chachaBlock(
  key: Uint32Array,
  counter: number,
  nonce: Uint32Array,
  out: Uint32Array,
): void {
  const s = new Uint32Array(16);
  s.set(key, 4);
  s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
  s[12] = counter;
  s.set(nonce, 13);
  const w = s.slice();
  for (let i = 0; i < 10; i++) {
    quarterRound(w, 0, 4, 8, 12); quarterRound(w, 1, 5, 9, 13);
    quarterRound(w, 2, 6, 10, 14); quarterRound(w, 3, 7, 11, 15);
    quarterRound(w, 0, 5, 10, 15); quarterRound(w, 1, 6, 11, 12);
    quarterRound(w, 2, 7, 8, 13); quarterRound(w, 3, 4, 9, 14);
  }
  for (let i = 0; i < 16; i++) out[i] = (w[i]! + s[i]!) >>> 0;
}

function words32(bytes: Uint8Array): Uint32Array {
  const out = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] =
      (bytes[i * 4]! | (bytes[i * 4 + 1]! << 8) | (bytes[i * 4 + 2]! << 16) |
        (bytes[i * 4 + 3]! << 24)) >>>
      0;
  }
  return out;
}

function xorInto(dst: Uint8Array, src: Uint8Array, ks: Uint32Array): void {
  const kb = new Uint8Array(64);
  new DataView(kb.buffer).setUint32(0, ks[0]!, true);
  for (let i = 0; i < 16; i++) {
    kb[i * 4] = ks[i]! & 0xff;
    kb[i * 4 + 1] = (ks[i]! >>> 8) & 0xff;
    kb[i * 4 + 2] = (ks[i]! >>> 16) & 0xff;
    kb[i * 4 + 3] = (ks[i]! >>> 24) & 0xff;
  }
  for (let i = 0; i < src.length; i++) dst[i] = src[i]! ^ kb[i % 64]!;
}

/** Poly1305 MAC (BigInt accumulator; 32-byte key). Exported for tests. */
export function poly1305(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const P = (1n << 130n) - 5n;
  /* r = little-endian u128 of key[0..16], then the RFC 8439 clamp. */
  let r = 0n;
  for (let i = 15; i >= 0; i--) r = (r << 8n) | BigInt(key[i]!);
  r &= 0x0ffffffc0ffffffc0ffffffc0fffffffn;
  let s = 0n;
  for (let i = 31; i >= 16; i--) s = (s << 8n) | BigInt(key[i]!);
  let acc = 0n;
  for (let off = 0; off < msg.length; off += 16) {
    let n = 0n;
    const len = Math.min(16, msg.length - off);
    for (let i = len - 1; i >= 0; i--) n = (n << 8n) | BigInt(msg[off + i]!);
    n = (n | (1n << BigInt(8 * len))) & ((1n << 130n) - 1n);
    acc = ((acc + n) * r) % P;
  }
  let tag = (acc + s) & ((1n << 128n) - 1n);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    out[i] = Number(tag & 0xffn);
    tag >>= 8n;
  }
  return out;
}

export interface AeadResult {
  ciphertext: Uint8Array;
  tag: Uint8Array;
}

/** Encrypts with ChaCha20-Poly1305 (12-byte nonce, empty AAD via aad arg). */
export function chacha20poly1305Encrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  plaintext: Uint8Array,
  aad: Uint8Array = new Uint8Array(0),
): AeadResult {
  const kw = words32(key);
  const nw = words32(nonce);
  const polyKeyBlock = new Uint32Array(16);
  chachaBlock(kw, 0, nw, polyKeyBlock);
  const polyKey = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    polyKey[i * 4] = polyKeyBlock[i]! & 0xff;
    polyKey[i * 4 + 1] = (polyKeyBlock[i]! >>> 8) & 0xff;
    polyKey[i * 4 + 2] = (polyKeyBlock[i]! >>> 16) & 0xff;
    polyKey[i * 4 + 3] = (polyKeyBlock[i]! >>> 24) & 0xff;
  }

  const ciphertext = new Uint8Array(plaintext.length);
  const ks = new Uint32Array(16);
  for (let off = 0; off < plaintext.length; off += 64) {
    chachaBlock(kw, 1 + off / 64, nw, ks);
    const end = Math.min(64, plaintext.length - off);
    xorInto(
      ciphertext.subarray(off),
      plaintext.subarray(off, off + end) as Uint8Array,
      ks,
    );
  }

  /* MAC data: aad || pad16 || ct || pad16 || len(aad)le64 || len(ct)le64 */
  const pad = (n: number) => (16 - (n % 16)) % 16;
  const mac = new Uint8Array(
    aad.length + pad(aad.length) + ciphertext.length + pad(ciphertext.length) + 16,
  );
  mac.set(aad);
  mac.set(ciphertext, aad.length + pad(aad.length));
  const dv = new DataView(mac.buffer);
  const lenOff = mac.length - 16;
  dv.setUint32(lenOff, aad.length, true);
  dv.setUint32(lenOff + 4, 0, true);
  dv.setUint32(lenOff + 8, ciphertext.length, true);
  dv.setUint32(lenOff + 12, 0, true);
  return { ciphertext, tag: poly1305(polyKey, mac) };
}

/** Decrypts; returns null on tag mismatch (tamper/wrong key). */
export function chacha20poly1305Decrypt(
  key: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  tag: Uint8Array,
  aad: Uint8Array = new Uint8Array(0),
): Uint8Array | null {
  /* Recompute the tag over the received ciphertext. */
  const kw = words32(key);
  const nw = words32(nonce);
  const pk = new Uint32Array(16);
  chachaBlock(kw, 0, nw, pk);
  const polyKey = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    polyKey[i * 4] = pk[i]! & 0xff;
    polyKey[i * 4 + 1] = (pk[i]! >>> 8) & 0xff;
    polyKey[i * 4 + 2] = (pk[i]! >>> 16) & 0xff;
    polyKey[i * 4 + 3] = (pk[i]! >>> 24) & 0xff;
  }
  const pad = (n: number) => (16 - (n % 16)) % 16;
  const mac = new Uint8Array(
    aad.length + pad(aad.length) + ciphertext.length + pad(ciphertext.length) + 16,
  );
  mac.set(aad);
  mac.set(ciphertext, aad.length + pad(aad.length));
  const dv = new DataView(mac.buffer);
  const lenOff = mac.length - 16;
  dv.setUint32(lenOff, aad.length, true);
  dv.setUint32(lenOff + 4, 0, true);
  dv.setUint32(lenOff + 8, ciphertext.length, true);
  dv.setUint32(lenOff + 12, 0, true);
  const actual = poly1305(polyKey, mac);
  for (let i = 0; i < 16; i++) {
    if (actual[i] !== tag[i]) return null;
  }

  const plaintext = new Uint8Array(ciphertext.length);
  const ks = new Uint32Array(16);
  for (let off = 0; off < ciphertext.length; off += 64) {
    chachaBlock(kw, 1 + off / 64, nw, ks);
    xorInto(
      plaintext.subarray(off),
      ciphertext.subarray(off, off + Math.min(64, ciphertext.length - off)) as Uint8Array,
      ks,
    );
  }
  return plaintext;
}
