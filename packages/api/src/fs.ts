/**
 * Scoped filesystem API — mirrors `plugin:fs|*` commands from `@zturnlibs/core`.
 * Every path is checked against the app's configured scope in the backend.
 */
import { invoke } from "./core.js";
import { resolveBaseDirectory, type BaseDirectory } from "./path.js";

/** Optional trailing options accepted by the v1 fs functions. */
export interface FsPathOptions {
  /** Resolve a relative path against this base directory first. */
  baseDir?: BaseDirectory | string;
}

async function withBase(
  path: string,
  options?: FsPathOptions,
): Promise<string> {
  if (!options?.baseDir) return path;
  if (path.startsWith("/")) return path;
  const base = await resolveBaseDirectory(options.baseDir);
  return `${base.replace(/\/$/, "")}/${path}`;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

/** Reads a text file (decoded as UTF-8). */
export function readText(
  path: string,
  options?: FsPathOptions,
): Promise<string> {
  return withBase(path, options).then((p) =>
    invoke<string>("plugin:fs|read_text", { path: p }),
  );
}

/** Writes a text file. */
export function writeText(
  path: string,
  contents: string,
  options?: FsPathOptions,
): Promise<void> {
  return withBase(path, options).then((p) =>
    invoke<void>("plugin:fs|write_text", { path: p, contents }),
  );
}

/** Lists a directory. */
export function readDir(
  path: string,
  options?: FsPathOptions,
): Promise<DirEntry[]> {
  return withBase(path, options).then((p) =>
    invoke<DirEntry[]>("plugin:fs|read_dir", { path: p }),
  );
}

/** Checks whether a path exists (out-of-scope paths report false). */
export function exists(
  path: string,
  options?: FsPathOptions,
): Promise<boolean> {
  return withBase(path, options).then((p) =>
    invoke<boolean>("plugin:fs|exists", { path: p }),
  );
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
/** Reads a binary file; resolves with its raw bytes (raw IPC response —
 * the injected invoke already unwraps the backend envelope). */
export async function readFile(path: string): Promise<Uint8Array> {
  return invoke<Uint8Array>("plugin:fs|read_file", { path });
}

/** Writes a binary file from raw bytes (or a base64 string directly). */
export async function writeFile(
  path: string,
  data: Uint8Array | string,
): Promise<void> {
  let base64: string;
  if (typeof data === "string") {
    base64 = data;
  } else {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < data.length; i += chunk) {
      bin += String.fromCharCode(...data.subarray(i, i + chunk));
    }
    base64 = btoa(bin);
  }
  await invoke("plugin:fs|write_file", { path, base64 });
}

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
  readFile,
  writeFile,
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

/* ---- G9/D3: handle-style IO + extended stat family ---- */

/** Options for {@linkcode open}. */
export interface OpenOptions {
  read?: boolean;
  write?: boolean;
  /** Position writes at EOF (implies write). */
  append?: boolean;
  /** Create the file when missing (with write/append). */
  create?: boolean;
  /** Base directory for relative paths. */
  baseDir?: BaseDirectory | string;
}

/**
 * A scoped file handle (upstream `FileHandle` parity): reads/writes advance
 * an internal cursor; close() flushes buffered writes.
 */
export class FileHandle {
  readonly id: number;
  readonly path: string;

  /** @internal — create via {@linkcode open}. */
  constructor(id: number, path: string) {
    this.id = id;
    this.path = path;
  }

  /** Reads up to `length` bytes from the cursor (base64 on the wire). */
  async read(length: number): Promise<Uint8Array> {
    const res = await invoke<{ data: string }>("plugin:fs|read", {
      id: this.id,
      length,
    });
    return b64ToBytes(res.data);
  }

  /** Writes bytes at the cursor (advances it). */
  async write(data: Uint8Array | ArrayBuffer): Promise<number> {
    const bytes =
      data instanceof Uint8Array ? data : new Uint8Array(data);
    return invoke<number>("plugin:fs|write", {
      id: this.id,
      data: toB64(bytes),
    });
  }

  /** whence: "start" (default) | "current" | "end". */
  async seek(
    offset: number,
    whence: "start" | "current" | "end" = "start",
  ): Promise<number> {
    return invoke<number>("plugin:fs|seek", {
      id: this.id,
      offset,
      whence,
    });
  }

  /** Flushes buffered writes to disk. */
  async flush(): Promise<void> {
    await invoke("plugin:fs|flush", { id: this.id });
  }

  /** Flushes and releases the handle. */
  async close(): Promise<void> {
    await invoke("plugin:fs|close", { id: this.id });
  }
}

function toB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Opens a scoped file handle. */
export async function open(
  path: string,
  options: OpenOptions = {},
): Promise<FileHandle> {
  const abs = await withBase(path, options);
  const { id } = await invoke<{ id: number }>("plugin:fs|open", {
    path: abs,
    write: options.write ?? options.append ?? false,
    append: options.append ?? false,
    create: options.create ?? false,
  });
  return new FileHandle(id, abs);
}

/** stat without following symlinks. */
export function lstat(
  path: string,
  options?: FsPathOptions,
): Promise<{ size: number; mode: number; isSymlink: boolean }> {
  return withBase(path, options).then((p) =>
    invoke("plugin:fs|lstat", { path: p }),
  );
}

/** Reads a symlink target. */
export function readLink(
  path: string,
  options?: FsPathOptions,
): Promise<string> {
  return withBase(path, options).then((p) =>
    invoke<string>("plugin:fs|read_link", { path: p }),
  );
}

/** Truncates (or zero-extends) a file to `length` bytes. */
export function truncate(
  path: string,
  length: number,
  options?: FsPathOptions,
): Promise<void> {
  return withBase(path, options).then((p) =>
    invoke("plugin:fs|truncate", { path: p, length }),
  );
}

/** Changes file permission bits (unix mode). */
export function chmod(
  path: string,
  mode: number,
  options?: FsPathOptions,
): Promise<void> {
  return withBase(path, options).then((p) =>
    invoke("plugin:fs|chmod", { path: p, mode }),
  );
}
