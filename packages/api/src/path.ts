/**
 * Path utilities — mirrors `plugin:path|*` commands from `@ztron/core`.
 * Pure string operations, no scope needed.
 */
import { invoke } from "./core.js";

export function join(...parts: string[]): Promise<string> {
  return invoke<string>("plugin:path|join", { parts });
}

export function resolve(path: string): Promise<string> {
  return invoke<string>("plugin:path|resolve", { path });
}

export function normalize(path: string): Promise<string> {
  return invoke<string>("plugin:path|normalize", { path });
}

export function isAbsolute(path: string): Promise<boolean> {
  return invoke<boolean>("plugin:path|is_absolute", { path });
}

export function basename(path: string, ext?: string): Promise<string> {
  return invoke<string>("plugin:path|basename", { path, ext });
}

export function dirname(path: string): Promise<string> {
  return invoke<string>("plugin:path|dirname", { path });
}

export function extname(path: string): Promise<string> {
  return invoke<string>("plugin:path|extname", { path });
}

/** The user's home directory. */
export function homeDir(): Promise<string> {
  return invoke<string>("plugin:path|home_dir", {});
}

/** The system temporary directory. */
export function tempDir(): Promise<string> {
  return invoke<string>("plugin:path|temp_dir", {});
}

/** The current working directory. */
export function cwd(): Promise<string> {
  return invoke<string>("plugin:path|cwd", {});
}

export const path = {
  join,
  resolve,
  normalize,
  isAbsolute,
  basename,
  dirname,
  extname,
  homeDir,
  tempDir,
  cwd,
};
