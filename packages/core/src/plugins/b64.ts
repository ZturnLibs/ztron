/**
 * Base64 <-> Uint8Array helpers that work in BOTH tjs and Node (no Buffer
 * global — txiki.js does not provide it).
 */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Reads a little-endian uint32 at `off`. */
export function readU32LE(bytes: Uint8Array, off: number): number {
  return (
    (bytes[off] ?? 0) |
    ((bytes[off + 1] ?? 0) << 8) |
    ((bytes[off + 2] ?? 0) << 16) |
    ((bytes[off + 3] ?? 0) << 24)
  );
}
