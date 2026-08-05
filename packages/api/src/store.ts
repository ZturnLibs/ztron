/** Store API — persistent KV store, mirrors `plugin:store|*`. */
import { invoke } from "./core.js";

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
