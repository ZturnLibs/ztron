/**
 * Scoped filesystem API — mirrors `plugin:fs|*` commands from `@ztron/core`.
 * Every path is checked against the app's configured scope in the backend.
 */
import { invoke } from "./core.js";

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

/** Reads a text file (decoded as UTF-8). */
export function readText(path: string): Promise<string> {
  return invoke<string>("plugin:fs|read_text", { path });
}

/** Writes a text file. */
export function writeText(path: string, contents: string): Promise<void> {
  return invoke<void>("plugin:fs|write_text", { path, contents });
}

/** Lists a directory. */
export function readDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>("plugin:fs|read_dir", { path });
}

/** Checks whether a path exists (out-of-scope paths report false). */
export function exists(path: string): Promise<boolean> {
  return invoke<boolean>("plugin:fs|exists", { path });
}

/** Removes a file (or empty directory). */
export function remove(path: string): Promise<void> {
  return invoke<void>("plugin:fs|remove", { path });
}

/** Options for {@linkcode makeDir}. */
export interface MakeDirOptions {
  /** Create parent directories as needed; no error if the dir exists. */
  recursive?: boolean;
}

/** Creates a directory. */
export function makeDir(
  path: string,
  options?: MakeDirOptions,
): Promise<void> {
  return invoke<void>("plugin:fs|make_dir", { path, ...options });
}

export interface FileMeta {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modifiedAt: string | null;
}

/** Copies a file (both source and destination must be in scope). */
export function copyFile(path: string, dest: string): Promise<void> {
  return invoke<void>("plugin:fs|copy", { path, dest });
}

/** Renames/moves a file (both paths must be in scope). */
export function renameFile(path: string, newPath: string): Promise<void> {
  return invoke<void>("plugin:fs|rename", { path, newPath });
}

/** Stats a file, returning size/type/last-modified. */
export function stat(path: string): Promise<FileMeta> {
  return invoke<FileMeta>("plugin:fs|stat", { path });
}

/** A filesystem watch event (aligned with Tauri's watchEvent). */
export interface WatchEvent {
  /** "modify" (content change) | "rename" (create/delete/move). */
  type: "modify" | "rename";
  /** Path of the changed entry (relative to the watched dir when the dir was
   *  watched; the file itself when a file was watched). */
  path: string;
}

/**
 * Watches a path for changes. Resolves with an unwatch function once the
 * backend watcher is armed; events stream through `handler` afterwards.
 * The path must be inside the app's fs scope (like every fs API).
 */
export async function watch(
  path: string,
  handler: (event: WatchEvent) => void,
): Promise<() => Promise<void>> {
  const { Channel } = await import("./core.js");
  const channel = new Channel<WatchEvent>((msg: WatchEvent) => handler(msg));
  const id = `fs-watch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await invoke("plugin:fs|watch", { path, id, ch: channel });
  return async () => {
    await invoke("plugin:fs|unwatch", { id });
  };
}

export const fs = {
  watch,
  readText,
  writeText,
  readDir,
  exists,
  remove,
  makeDir,
  copyFile,
  renameFile,
  stat,
};
