/**
 * `plugin:store|*` — persistent key-value store backed by JSON files.
 * Translated from Tauri's `tauri-plugin-store` (simplified).
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

interface StoreData {
  [key: string]: unknown;
}

export interface StorePluginOptions {
  /** Path scope for store files (e.g. { allow: ["$APPDATA/**"] }). */
  scope?: PathScopeConfig;
  /** Default directory for stores without absolute paths. */
  baseDir?: string;
}

export function storePlugin(options: StorePluginOptions = {}): Plugin {
  const baseDir = options.baseDir ?? tjs.tmpDir;

  async function load(path: string): Promise<StoreData> {
    const abs = path.startsWith("/") ? path : `${baseDir}/${path}`;
    try {
      const bytes = await tjs.readFile(abs);
      return JSON.parse(dec.decode(bytes));
    } catch {
      return {};
    }
  }

  async function save(path: string, data: StoreData): Promise<void> {
    const abs = path.startsWith("/") ? path : `${baseDir}/${path}`;
    const json = JSON.stringify(data, null, 2);
    await tjs.writeFile(abs, enc.encode(json));
  }

  const cache = new Map<string, StoreData>();

  async function getStore(path: string): Promise<StoreData> {
    if (!cache.has(path)) {
      cache.set(path, await load(path));
    }
    return cache.get(path)!;
  }

  return {
    name: "store",
    commands: {
      async get(args) {
        const { path, key } = args as { path: string; key: string };
        const store = await getStore(path);
        return store[key] ?? null;
      },
      async set(args) {
        const { path, key, value } = args as {
          path: string;
          key: string;
          value: unknown;
        };
        const store = await getStore(path);
        store[key] = value;
        await save(path, store);
      },
      async delete(args) {
        const { path, key } = args as { path: string; key: string };
        const store = await getStore(path);
        delete store[key];
        await save(path, store);
      },
      async keys(args) {
        const { path } = args as { path: string };
        const store = await getStore(path);
        return Object.keys(store);
      },
      async values(args) {
        const { path } = args as { path: string };
        const store = await getStore(path);
        return Object.values(store);
      },
      async entries(args) {
        const { path } = args as { path: string };
        const store = await getStore(path);
        return Object.entries(store);
      },
      async clear(args) {
        const { path } = args as { path: string };
        const data: StoreData = {};
        cache.set(path, data);
        // Don't immediately write — the file may not exist yet; let the next
        // set() call create it.
      },
      async save_store(args) {
        const { path } = args as { path: string };
        const store = await getStore(path);
        await save(path, store);
      },
    },
    permissions: [
      {
        identifier: "store:allow-get",
        commands: ["plugin:store|get"],
      },
      {
        identifier: "store:allow-set",
        commands: ["plugin:store|set"],
      },
      {
        identifier: "store:allow-delete",
        commands: ["plugin:store|delete"],
      },
      {
        identifier: "store:allow-keys",
        commands: ["plugin:store|keys"],
      },
      {
        identifier: "store:allow-values",
        commands: ["plugin:store|values"],
      },
      {
        identifier: "store:allow-entries",
        commands: ["plugin:store|entries"],
      },
      {
        identifier: "store:allow-clear",
        commands: ["plugin:store|clear"],
      },
      {
        identifier: "store:allow-save",
        commands: ["plugin:store|save_store"],
      },
    ],
    permissionSets: [
      {
        name: "store:default",
        description: "Read-only store access.",
        permissions: [
          "store:allow-get",
          "store:allow-keys",
          "store:allow-values",
          "store:allow-entries",
        ],
      },
      {
        name: "store:write",
        description: "Read + write store access (including delete/clear/save).",
        permissions: [
          "store:default",
          "store:allow-set",
          "store:allow-delete",
          "store:allow-clear",
          "store:allow-save",
        ],
      },
    ],
  };
}
