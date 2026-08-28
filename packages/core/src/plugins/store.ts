/**
 * `plugin:store|*` — persistent key-value store backed by JSON files.
 * G9 (GAP D2) resource model, translated from `tauri-plugin-store` v2:
 * per-store autoSave, change listeners (Channel), reset/close/saveTo, and
 * explicit save — while the v1 path-keyed commands stay byte-compatible.
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";
import type { CommandContext } from "../commands/index.js";
import type { ChannelHandle } from "../ipc/channel.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

interface StoreData {
  [key: string]: unknown;
}

interface StoreRecord {
  path: string;
  data: StoreData;
  autoSave: boolean;
  listeners: Set<ChannelHandle>;
}

export interface StorePluginOptions {
  /** Path scope for store files (e.g. { allow: ["$APPDATA/**"] }). */
  scope?: PathScopeConfig;
  /** Default directory for stores without absolute paths. */
  baseDir?: string;
}

export function storePlugin(options: StorePluginOptions = {}): Plugin {
  const baseDir = options.baseDir ?? tjs.tmpDir;
  const scope = new PathScope(options.scope ?? { allow: ["**"] });

  const stores = new Map<string, StoreRecord>();

  function absPath(path: string): string {
    return path.startsWith("/") ? path : `${baseDir}/${path}`;
  }

  async function readFromDisk(path: string): Promise<StoreData> {
    const abs = absPath(path);
    if (!scope.check(abs)) {
      throw new Error(`store scope denied: ${abs}`);
    }
    try {
      const bytes = await tjs.readFile(abs);
      return JSON.parse(dec.decode(bytes));
    } catch {
      return {};
    }
  }

  async function writeToDisk(path: string, data: StoreData): Promise<void> {
    const abs = absPath(path);
    if (!scope.check(abs)) {
      throw new Error(`store scope denied: ${abs}`);
    }
    const json = JSON.stringify(data, null, 2);
    await tjs.writeFile(abs, enc.encode(json));
  }

  async function getRecord(
    path: string,
    autoSave = true,
  ): Promise<StoreRecord> {
    let rec = stores.get(path);
    if (!rec) {
      rec = { path, data: await readFromDisk(path), autoSave, listeners: new Set() };
      stores.set(path, rec);
    }
    return rec;
  }

  function emit(
    rec: StoreRecord,
    event: "set" | "delete" | "reset",
    key: string | null,
    value?: unknown,
  ): void {
    for (const ch of rec.listeners) {
      try {
        ch.send({ event, key, value });
      } catch {
        /* dead channel — dropped, close() cleans up */
      }
    }
  }

  async function persistIfAuto(rec: StoreRecord): Promise<void> {
    if (rec.autoSave) await writeToDisk(rec.path, rec.data);
  }

  return {
    name: "store",
    commands: {
      /* ---- v1 path-keyed surface (kept for compatibility) ---- */
      async get(args) {
        const { path, key } = args as { path: string; key: string };
        const rec = await getRecord(path);
        return rec.data[key] ?? null;
      },
      async set(args) {
        const { path, key, value } = args as {
          path: string;
          key: string;
          value: unknown;
        };
        const rec = await getRecord(path);
        rec.data[key] = value;
        await persistIfAuto(rec);
        emit(rec, "set", key, value);
      },
      async has(args) {
        const { path, key } = args as { path: string; key: string };
        const rec = await getRecord(path);
        return key in rec.data;
      },
      async delete(args) {
        const { path, key } = args as { path: string; key: string };
        const rec = await getRecord(path);
        delete rec.data[key];
        await persistIfAuto(rec);
        emit(rec, "delete", key);
      },
      async keys(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        return Object.keys(rec.data);
      },
      async values(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        return Object.values(rec.data);
      },
      async entries(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        return Object.entries(rec.data);
      },
      async clear(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        rec.data = {};
      },
      async save_store(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        await writeToDisk(path, rec.data);
      },

      /* ---- G9 resource surface (upstream store v2 parity) ---- */
      /** Loads (or attaches) a store instance. */
      async load(args) {
        const { path, autoSave = true } = args as {
          path: string;
          autoSave?: boolean;
        };
        const rec = await getRecord(path, autoSave);
        rec.autoSave = autoSave;
        return { storeId: path, entries: Object.keys(rec.data).length };
      },
      /** Persists now regardless of autoSave. */
      async save(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        await writeToDisk(path, rec.data);
      },
      /** Persists the store's JSON under another path. */
      async save_to(args) {
        const { path, newPath } = args as { path: string; newPath: string };
        const rec = await getRecord(path);
        await writeToDisk(newPath, rec.data);
      },
      /** Empties the store (persists per autoSave). */
      async reset(args) {
        const { path } = args as { path: string };
        const rec = await getRecord(path);
        rec.data = {};
        emit(rec, "reset", null);
        await persistIfAuto(rec);
      },
      /** Flushes (if autoSave) and unloads the instance + listeners. */
      async close(args) {
        const { path } = args as { path: string };
        const rec = stores.get(path);
        if (!rec) return { closed: false };
        if (rec.autoSave) await writeToDisk(path, rec.data);
        for (const ch of rec.listeners) {
          try {
            ch.end();
          } catch {
            /* already ended */
          }
        }
        stores.delete(path);
        return { closed: true };
      },
      /** Toggles per-store autoSave. */
      async set_auto_save(args) {
        const { path, autoSave } = args as {
          path: string;
          autoSave: boolean;
        };
        const rec = await getRecord(path, autoSave);
        rec.autoSave = autoSave;
        return { autoSave };
      },
      /** Registers a change listener channel (set/delete/reset events). */
      async on_change(args, ctx: CommandContext) {
        const { path, ch } = args as {
          path: string;
          ch?: { kind: "channel"; id: number };
        };
        const channel = ch ? ctx.getChannel(ch.id) : undefined;
        if (!channel) throw new Error("store.on_change requires a channel");
        const rec = await getRecord(path);
        rec.listeners.add(channel);
        return { listening: true };
      },
    },
    permissions: [
      { identifier: "store:allow-get", commands: ["plugin:store|get"] },
      { identifier: "store:allow-set", commands: ["plugin:store|set"] },
      { identifier: "store:allow-has", commands: ["plugin:store|has"] },
      { identifier: "store:allow-delete", commands: ["plugin:store|delete"] },
      { identifier: "store:allow-keys", commands: ["plugin:store|keys"] },
      { identifier: "store:allow-values", commands: ["plugin:store|values"] },
      {
        identifier: "store:allow-entries",
        commands: ["plugin:store|entries"],
      },
      { identifier: "store:allow-clear", commands: ["plugin:store|clear"] },
      {
        identifier: "store:allow-save-store",
        commands: ["plugin:store|save_store"],
      },
      { identifier: "store:allow-load", commands: ["plugin:store|load"] },
      { identifier: "store:allow-save", commands: ["plugin:store|save"] },
      { identifier: "store:allow-save-to", commands: ["plugin:store|save_to"] },
      { identifier: "store:allow-reset", commands: ["plugin:store|reset"] },
      { identifier: "store:allow-close", commands: ["plugin:store|close"] },
      {
        identifier: "store:allow-set-auto-save",
        commands: ["plugin:store|set_auto_save"],
      },
      {
        identifier: "store:allow-on-change",
        commands: ["plugin:store|on_change"],
      },
    ],
    permissionSets: [
      {
        name: "store:read",
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
          "store:read",
          "store:allow-set",
          "store:allow-delete",
          "store:allow-clear",
          "store:allow-save-store",
        ],
      },
      {
        name: "store:default",
        description: "Store resource lifecycle + v1 kv surface.",
        permissions: [
          "store:read",
          "store:allow-set",
          "store:allow-delete",
          "store:allow-clear",
          "store:allow-save-store",
          "store:allow-load",
          "store:allow-save",
          "store:allow-save-to",
          "store:allow-reset",
          "store:allow-close",
          "store:allow-set-auto-save",
        ],
      },
    ],
  };
}
