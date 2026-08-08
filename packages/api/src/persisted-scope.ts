/**
 * Persisted-scope API — a port of Tauri's `tauri-plugin-persisted-scope`,
 * backed by the `plugin:persisted-scope|*` commands.
 */
import { invoke } from "./core.js";

/** The merged filesystem allowlist (base + persisted entries). */
export async function getPersistedScope(): Promise<{ allow: string[] }> {
  return invoke<{ allow: string[] }>("plugin:persisted-scope|get", {});
}

/** Writes the merged allowlist to the persistence file. */
export async function savePersistedScope(): Promise<{ saved: boolean }> {
  return invoke<{ saved: boolean }>("plugin:persisted-scope|save", {});
}

export const persistedScope = {
  get: getPersistedScope,
  save: savePersistedScope,
};
