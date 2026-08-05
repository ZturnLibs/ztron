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

/** Creates a directory. */
export function makeDir(path: string): Promise<void> {
  return invoke<void>("plugin:fs|make_dir", { path });
}

export const fs = { readText, writeText, readDir, exists, remove, makeDir };
