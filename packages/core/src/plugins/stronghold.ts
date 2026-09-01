/**
 * `plugin:stronghold|*` — encrypted persistent KV store (GAP E2).
 *
 * Upstream rides Rust IOTA-stronghold; this is the documented TS rewrite:
 * scrypt(password, salt) -> ChaCha20-Poly1305 AEAD snapshot. File layout:
 *   "ZTSH1" | salt(16) | N,r,p u32le | nonce(12) | ciphertext | tag(16)
 * Tampering or wrong passwords fail closed at the Poly1305 tag. Crypto
 * primitives are cross-checked against node:crypto in stronghold.test.ts.
 */
import type { Plugin } from "../plugin.js";
import { scrypt } from "./crypto/scrypt.js";
import {
  chacha20poly1305Encrypt,
  chacha20poly1305Decrypt,
} from "./crypto/chacha20poly1305.js";

const MAGIC = "ZTSH1";
/** libsodium-ish "moderate" defaults (16 MiB, ~0.5s). */
const DEFAULT_N = 1 << 14;
const DEFAULT_R = 8;
const DEFAULT_P = 1;

const enc = new TextEncoder();
const dec = new TextDecoder();

interface Snapshot {
  [key: string]: unknown;
}

interface StrongholdRec {
  path: string;
  salt: Uint8Array;
  params: { n: number; r: number; p: number };
  data: Snapshot;
  dirty: boolean;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g?.getRandomValues) {
    g.getRandomValues(out);
  } else {
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function deriveKey(
  password: string,
  salt: Uint8Array,
  params: { n: number; r: number; p: number },
): Uint8Array {
  return scrypt(
    enc.encode(password),
    salt,
    params.n,
    params.r,
    params.p,
    32,
  );
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function seal(
  password: string,
  salt: Uint8Array,
  params: { n: number; r: number; p: number },
  data: Snapshot,
): Uint8Array {
  const key = deriveKey(password, salt, params);
  const nonce = randomBytes(12);
  const plain = enc.encode(JSON.stringify(data));
  const { ciphertext, tag } = chacha20poly1305Encrypt(key, nonce, plain);
  const head = new Uint8Array(5 + 16 + 12 + 12);
  head.set(enc.encode(MAGIC), 0);
  head.set(salt, 5);
  const dv = new DataView(head.buffer);
  dv.setUint32(21, params.n, true);
  dv.setUint32(25, params.r, true);
  dv.setUint32(29, params.p, true);
  head.set(nonce, 33);
  const out = new Uint8Array(head.length + ciphertext.length + 16);
  out.set(head);
  out.set(ciphertext, head.length);
  out.set(tag, head.length + ciphertext.length);
  return out;
}

function unseal(
  bytes: Uint8Array,
  password: string,
): {
  salt: Uint8Array;
  params: { n: number; r: number; p: number };
  data: Snapshot;
} {
  if (bytes.length < 5 + 16 + 12 + 12 + 16) {
    throw new Error("stronghold: snapshot too short / not a ZTSH file");
  }
  const magic = dec.decode(bytes.subarray(0, 5));
  if (magic !== MAGIC) {
    throw new Error("stronghold: bad magic (not a ZTSH snapshot)");
  }
  const salt = bytes.subarray(5, 21);
  const dv = new DataView(bytes.buffer, bytes.byteOffset);
  const params = {
    n: dv.getUint32(21, true),
    r: dv.getUint32(25, true),
    p: dv.getUint32(29, true),
  };
  const nonce = bytes.subarray(33, 45);
  const bodyEnd = bytes.length - 16;
  const ciphertext = bytes.subarray(45, bodyEnd);
  const tag = bytes.subarray(bodyEnd);
  const key = deriveKey(password, salt, params);
  const plain = chacha20poly1305Decrypt(key, nonce, ciphertext, tag);
  if (!plain) {
    throw new Error("stronghold: wrong password or corrupted snapshot");
  }
  return { salt, params, data: JSON.parse(dec.decode(plain)) as Snapshot };
}

export interface StrongholdPluginOptions {
  /** Default file when load() omits path. */
  path?: string;
  /** scrypt cost; tests use small values. */
  params?: { n: number; r: number; p: number };
}

export function strongholdPlugin(
  options: StrongholdPluginOptions = {},
): Plugin {
  const defaults = { path: options.path ?? `${tjs.tmpDir}/stronghold.bin`, ...options.params };
  const vaults = new Map<string, StrongholdRec>();
  /* password kept per loaded vault (upstream keeps a keyring; a TS runtime
     holds process memory equally). */
  const passwords = new Map<string, string>();

  async function loadVault(
    path: string,
    password: string,
  ): Promise<StrongholdRec> {
    let rec = vaults.get(path);
    if (rec) return rec;
    const params = {
      n: options.params?.n ?? DEFAULT_N,
      r: options.params?.r ?? DEFAULT_R,
      p: options.params?.p ?? DEFAULT_P,
    };
    try {
      const bytes = new Uint8Array(await tjs.readFile(path));
      const opened = unseal(bytes, password);
      rec = { path, salt: opened.salt, params: opened.params, data: opened.data, dirty: false };
    } catch (e) {
      if (String((e as Error).message).includes("stronghold:")) throw e;
      /* missing file -> fresh vault */
      rec = { path, salt: randomBytes(16), params, data: {}, dirty: false };
    }
    vaults.set(path, rec);
    passwords.set(path, password);
    return rec;
  }

  async function persist(rec: StrongholdRec): Promise<void> {
    const password = passwords.get(rec.path);
    if (password === undefined) throw new Error("stronghold: not loaded");
    const sealed = seal(password, rec.salt, rec.params, rec.data);
    await tjs.writeFile(rec.path, sealed);
    rec.dirty = false;
  }

  return {
    name: "stronghold",
    commands: {
      async load(args) {
        const { path = defaults.path, password } = args as {
          path?: string;
          password: string;
        };
        const rec = await loadVault(path, password);
        return { path, entries: Object.keys(rec.data).length };
      },
      async get(args) {
        const { path = defaults.path, key } = args as {
          path?: string;
          key: string;
        };
        const rec = vaults.get(path);
        if (!rec) throw new Error("stronghold: not loaded");
        return rec.data[key] ?? null;
      },
      async set(args) {
        const { path = defaults.path, key, value } = args as {
          path?: string;
          key: string;
          value: unknown;
        };
        const rec = vaults.get(path);
        if (!rec) throw new Error("stronghold: not loaded");
        rec.data[key] = value;
        rec.dirty = true;
      },
      async has(args) {
        const { path = defaults.path, key } = args as { path?: string; key: string };
        const rec = vaults.get(path ?? "");
        return rec ? key in rec.data : false;
      },
      async remove(args) {
        const { path = defaults.path, key } = args as { path?: string; key: string };
        const rec = vaults.get(path);
        if (!rec) throw new Error("stronghold: not loaded");
        delete rec.data[key];
        rec.dirty = true;
      },
      async keys(args) {
        const { path = defaults.path } = args as { path?: string };
        const rec = vaults.get(path);
        return rec ? Object.keys(rec.data) : [];
      },
      async clear(args) {
        const { path = defaults.path } = args as { path?: string };
        const rec = vaults.get(path);
        if (rec) {
          rec.data = {};
          rec.dirty = true;
        }
      },
      /** Persists the sealed snapshot to disk. */
      async save(args) {
        const { path = defaults.path } = args as { path?: string };
        const rec = vaults.get(path);
        if (!rec) throw new Error("stronghold: not loaded");
        await persist(rec);
        return { saved: true, path };
      },
      /** Seals to a different path (keeps the original untouched). */
      async save_to(args) {
        const { path = defaults.path, newPath } = args as {
          path?: string;
          newPath: string;
        };
        const rec = vaults.get(path);
        if (!rec) throw new Error("stronghold: not loaded");
        const password = passwords.get(path);
        if (password === undefined) throw new Error("stronghold: not loaded");
        await tjs.writeFile(newPath, seal(password, rec.salt, rec.params, rec.data));
        return { saved: true, path: newPath };
      },
      /** Flushes if dirty and unloads the instance (password forgotten). */
      async close(args) {
        const { path = defaults.path } = args as { path?: string };
        const rec = vaults.get(path);
        if (!rec) return { closed: false };
        if (rec.dirty) await persist(rec);
        vaults.delete(path);
        passwords.delete(path);
        return { closed: true };
      },
      /** Reloads the snapshot from disk (drops unsaved changes). */
      async reload(args) {
        const { path = defaults.path, password } = args as {
          path?: string;
          password: string;
        };
        vaults.delete(path);
        passwords.delete(path);
        const rec = await loadVault(path, password);
        return { reloaded: true, entries: Object.keys(rec.data).length };
      },
    },
    permissions: [
      { identifier: "stronghold:allow-load", commands: ["plugin:stronghold|load"] },
      { identifier: "stronghold:allow-get", commands: ["plugin:stronghold|get"] },
      { identifier: "stronghold:allow-set", commands: ["plugin:stronghold|set"] },
      { identifier: "stronghold:allow-has", commands: ["plugin:stronghold|has"] },
      { identifier: "stronghold:allow-remove", commands: ["plugin:stronghold|remove"] },
      { identifier: "stronghold:allow-keys", commands: ["plugin:stronghold|keys"] },
      { identifier: "stronghold:allow-clear", commands: ["plugin:stronghold|clear"] },
      { identifier: "stronghold:allow-save", commands: ["plugin:stronghold|save"] },
      { identifier: "stronghold:allow-save-to", commands: ["plugin:stronghold|save_to"] },
      { identifier: "stronghold:allow-close", commands: ["plugin:stronghold|close"] },
      { identifier: "stronghold:allow-reload", commands: ["plugin:stronghold|reload"] },
    ],
    permissionSets: [
      {
        name: "stronghold:default",
        description: "Encrypted vault lifecycle (load/save/close + kv).",
        permissions: [
          "stronghold:allow-load",
          "stronghold:allow-get",
          "stronghold:allow-set",
          "stronghold:allow-has",
          "stronghold:allow-remove",
          "stronghold:allow-keys",
          "stronghold:allow-clear",
          "stronghold:allow-save",
          "stronghold:allow-save-to",
          "stronghold:allow-close",
          "stronghold:allow-reload",
        ],
      },
    ],
  };
}
