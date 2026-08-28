/** Store API — persistent KV store, mirrors `plugin:store|*`. */
import { invoke, Channel } from "./core.js";

export function get<T = unknown>(path: string, key: string): Promise<T | null> {
  return invoke<T | null>("plugin:store|get", { path, key });
}
export function set(path: string, key: string, value: unknown): Promise<void> {
  return invoke<void>("plugin:store|set", { path, key, value });
}
export function remove(path: string, key: string): Promise<void> {
  return invoke<void>("plugin:store|delete", { path, key });
}
export function keys(path: string): Promise<string[]> {
  return invoke<string[]>("plugin:store|keys", { path });
}
export function values(path: string): Promise<unknown[]> {
  return invoke<unknown[]>("plugin:store|values", { path });
}
export function entries(path: string): Promise<[string, unknown][]> {
  return invoke<[string, unknown][]>("plugin:store|entries", { path });
}
export function clear(path: string): Promise<void> {
  return invoke<void>("plugin:store|clear", { path });
}

export const store = { get, set, remove, keys, values, entries, clear };

/** Change record pushed over an onChange channel (G9/D2). */
export type StoreChangeEvent =
  | { event: "set" | "delete"; key: string; value?: unknown }
  | { event: "reset"; key: null };

/**
 * Resource-style store instance (upstream `Store` parity): explicit
 * lifecycle, per-instance autoSave and change listeners. The legacy
 * function surface above keeps working against the same files.
 */
export class Store {
  readonly storeId: string;

  private constructor(storeId: string) {
    this.storeId = storeId;
  }

  /** Loads/attaches a store file (autoSave defaults to upstream's true). */
  static async load(
    path: string,
    options: { autoSave?: boolean } = {},
  ): Promise<Store> {
    await invoke("plugin:store|load", { path, autoSave: options.autoSave ?? true });
    return new Store(path);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return invoke<T | null>("plugin:store|get", { path: this.storeId, key });
  }
  async set(key: string, value: unknown): Promise<void> {
    await invoke("plugin:store|set", { path: this.storeId, key, value });
  }
  async has(key: string): Promise<boolean> {
    return invoke<boolean>("plugin:store|has", { path: this.storeId, key });
  }
  async delete(key: string): Promise<void> {
    await invoke("plugin:store|delete", { path: this.storeId, key });
  }
  async keys(): Promise<string[]> {
    return invoke<string[]>("plugin:store|keys", { path: this.storeId });
  }
  async values(): Promise<unknown[]> {
    return invoke<unknown[]>("plugin:store|values", { path: this.storeId });
  }
  async entries(): Promise<Array<[string, unknown]>> {
    return invoke<Array<[string, unknown]>>("plugin:store|entries", {
      path: this.storeId,
    });
  }
  /** Empties the store (persists per autoSave; pushes a reset event). */
  async reset(): Promise<void> {
    await invoke("plugin:store|reset", { path: this.storeId });
  }
  /** Persists now regardless of autoSave. */
  async save(): Promise<void> {
    await invoke("plugin:store|save", { path: this.storeId });
  }
  /** Persists this store's JSON under another path. */
  async saveTo(newPath: string): Promise<void> {
    await invoke("plugin:store|save_to", { path: this.storeId, newPath });
  }
  async setAutoSave(autoSave: boolean): Promise<void> {
    await invoke("plugin:store|set_auto_save", { path: this.storeId, autoSave });
  }
  /** Subscribes to set/delete/reset changes; returns an unlisten fn. */
  async onChange(
    handler: (e: StoreChangeEvent) => void,
  ): Promise<() => Promise<void>> {
    const channel = new Channel<StoreChangeEvent>((msg) => handler(msg));
    await invoke("plugin:store|on_change", { path: this.storeId, ch: channel });
    return async () => {
      /* upstream has no per-listener unsubscribe; re-close semantics apply */
    };
  }
  /** Flushes (autoSave) and unloads the instance. */
  async close(): Promise<void> {
    await invoke("plugin:store|close", { path: this.storeId });
  }
}
