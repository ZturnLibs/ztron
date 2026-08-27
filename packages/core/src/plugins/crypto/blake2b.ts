/**
 * BLAKE2b — pure TypeScript (RFC 7693). Two users in this codebase, both
 * minisign-compat (GAP.md D1):
 *   - outlen 64 → prehashed-message digest for "ED" signatures
 *   - outlen 32 → SeckeyStruct integrity checksum ("B2")
 *
 * Cross-checked against Node's createHash("blake2b512") in unit tests.
 */

const IV: bigint[] = [
  0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n, 0x510e527fade682d1n, 0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
];

const SIGMA: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
  [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
  [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
  [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
  [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
  [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
  [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
  [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
  [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];

const MASK64 = 0xffffffffffffffffn;

function rotr64(x: bigint, n: number): bigint {
  return ((x >> BigInt(n)) | (x << BigInt(64 - n))) & MASK64;
}

/**
 * Full BLAKE2b G over four state lanes a/b/c/d with message words x,y
 * (RFC 7693 §3.1: rotations 32/24 then 16/63).
 */
function G(
  v: bigint[],
  a: number,
  b: number,
  c: number,
  d: number,
  x: bigint,
  y: bigint,
): void {
  const va = v[a]!, vb = v[b]!, vc = v[c]!, vd = v[d]!;
  let A = (va + vb + x) & MASK64;
  let D = rotr64(vd ^ A, 32);
  let C = (vc + D) & MASK64;
  let B = rotr64(vb ^ C, 24);
  A = (A + B + y) & MASK64;
  D = rotr64(D ^ A, 16);
  C = (C + D) & MASK64;
  B = rotr64(B ^ C, 63);
  v[a] = A; v[b] = B; v[c] = C; v[d] = D;
}

function le64(buf: Uint8Array, off: number): bigint {
  return (
    BigInt(buf[off]!) |
    (BigInt(buf[off + 1]!) << 8n) |
    (BigInt(buf[off + 2]!) << 16n) |
    (BigInt(buf[off + 3]!) << 24n) |
    (BigInt(buf[off + 4]!) << 32n) |
    (BigInt(buf[off + 5]!) << 40n) |
    (BigInt(buf[off + 6]!) << 48n) |
    (BigInt(buf[off + 7]!) << 56n)
  );
}

function compress(
  h: bigint[],
  block: Uint8Array,
  offset: number,
  t: bigint,
  last: boolean,
): void {
  const m = new Array<bigint>(16);
  for (let i = 0; i < 16; i++) {
    m[i] = le64(block, offset + i * 8);
  }

  const iv = IV.map((x) => x);
  const v: bigint[] = [...h.slice(), ...iv];
  v[12] = v[12]! ^ t;
  v[13] = v[13]! ^ (t >> 64n);
  if (last) v[14] = ~v[14]! & MASK64;

  for (let r = 0; r < 12; r++) {
    const row = SIGMA[r]!;
    const M = (i: number): bigint => m[row[i]!]!;
    G(v, 0, 4, 8, 12, M(0), M(1));
    G(v, 1, 5, 9, 13, M(2), M(3));
    G(v, 2, 6, 10, 14, M(4), M(5));
    G(v, 3, 7, 11, 15, M(6), M(7));
    G(v, 0, 5, 10, 15, M(8), M(9));
    G(v, 1, 6, 11, 12, M(10), M(11));
    G(v, 2, 7, 8, 13, M(12), M(13));
    G(v, 3, 4, 9, 14, M(14), M(15));
  }

  for (let i = 0; i < 8; i++) {
    h[i] = (h[i]! ^ v[i]! ^ v[i + 8]!) & MASK64;
  }
}

/** Computes the BLAKE2b digest of `data` with an unkeyed hash. */
export function blake2b(data: Uint8Array, outlen: 32 | 64): Uint8Array {
  const h = IV.slice();
  // Parameter block: keylen=0, fanout=1, depth=1, outlen packed into h[0].
  h[0] = h[0]! ^ (0x01010000n | BigInt(outlen));

  const nn = data.length;
  if (nn === 0) {
    compress(h, new Uint8Array(128), 0, 0n, true);
  } else {
    let off = 0;
    let remaining = nn;
    while (remaining > 128) {
      compress(h, data, off, BigInt(off + 128), false);
      off += 128;
      remaining -= 128;
    }
    const tail = new Uint8Array(128);
    tail.set(data.subarray(off));
    compress(h, tail, 0, BigInt(nn), true);
  }

  const out = new Uint8Array(outlen);
  for (let i = 0; i < outlen; i++) {
    out[i] = Number((h[i >> 3]! >> BigInt((i & 7) * 8)) & 0xffn);
  }
  return out;
}
