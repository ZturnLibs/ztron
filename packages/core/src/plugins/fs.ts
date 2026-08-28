/**
 * `plugin:fs|*` — scoped filesystem capability.
 *
 * All commands are gated by a {@link PathScope}: paths are resolved,
 * canonicalized and checked against the allowlist before touching the disk.
 * Translated conceptually from Tauri's `tauri-plugin-fs` (scope + commands).
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";
import { RawResponse } from "../ipc/raw.js";

const dec = new TextDecoder();

/** Base64 <-> bytes (binary fs payloads cross the JSON wire as base64). */
export function bytesToB64(bytes: Uint8Array): string {
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

export interface FsPluginOptions {
  /** A PathScope instance or config (instances may be grown by persisted-scope). */
  scope: PathScopeConfig | PathScope;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export interface FileMeta {
  size: number;
  isDirectory: boolean;
  isFile: boolean;
  modifiedAt: string | null;
}

function modeIsDir(mode: number): boolean {
  return (mode & 0o170000) === 0o040000;
}

export function fsPlugin(options: FsPluginOptions): Plugin {
  const scope =
    options.scope instanceof PathScope
      ? options.scope
      : new PathScope(options.scope);

  const fsCommands = {
    read_text: "plugin:fs|read_text",
    write_text: "plugin:fs|write_text",
    read_file: "plugin:fs|read_file",
    write_file: "plugin:fs|write_file",
    read_dir: "plugin:fs|read_dir",
    exists: "plugin:fs|exists",
    remove: "plugin:fs|remove",
    make_dir: "plugin:fs|make_dir",
    copy: "plugin:fs|copy",
    rename: "plugin:fs|rename",
    stat: "plugin:fs|stat",
    watch: "plugin:fs|watch",
    unwatch: "plugin:fs|unwatch",
    open: "plugin:fs|open",
    read: "plugin:fs|read",
    seek: "plugin:fs|seek",
    write: "plugin:fs|write",
    flush: "plugin:fs|flush",
    close: "plugin:fs|close",
    truncate: "plugin:fs|truncate",
    lstat: "plugin:fs|lstat",
    read_link: "plugin:fs|read_link",
    chmod: "plugin:fs|chmod",
  } as const;

  /* ---- G9/D3: handle-style IO (cursor over whole-file primitives) ----
     Real tjs exposes no portable streaming file object across versions, so
     handles buffer the file and persist on flush/close. Upstream command
     surface preserved; large-file streaming stays ledger-noted. */
  interface FileHandleRec {
    path: string;
    bytes: Uint8Array;
    pos: number;
    write: boolean;
    append: boolean;
    dirty: boolean;
  }
  const handles = new Map<number, FileHandleRec>();
  let nextHandleId = 1;

  function b64Encode(bytes: Uint8Array): string {
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }
  function b64Decode(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function persistHandle(h: FileHandleRec): Promise<void> {
    if (!h.write) throw new Error("fs: handle not opened for writing");
    await scope.check(h.path);
    await tjs.writeFile(h.path, h.bytes);
    h.dirty = false;
  }

  /* Live watchers (id -> tjs FileWatcher); closed by unwatch or app exit. */
  const watchers = new Map<string, { close(): void }>();

  return {
    name: "fs",
    commands: {
      async read_text(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        return dec.decode(await tjs.readFile(canon));
      },
      async write_text(args) {
        const { path, contents } = args as { path: string; contents: string };
        const canon = await scope.check(path);
        await tjs.writeFile(canon, contents);
      },
      async read_file(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        const bytes = await tjs.readFile(canon);
        // Raw IPC response: the frontend invoke resolves with Uint8Array
        // (InvokeResponseBody::Raw semantics — see ipc/raw.ts).
        return new RawResponse(
          bytesToB64(
            new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          ),
        );
      },
      async write_file(args) {
        const { path, base64 } = args as { path: string; base64: string };
        const canon = await scope.check(path);
        await tjs.writeFile(canon, b64ToBytes(base64));
      },
      async read_dir(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        const iter = await tjs.readDir(canon);
        const out: DirEntry[] = [];
        for await (const e of iter as unknown as AsyncIterable<DirEntry>) {
          out.push({
            name: e.name,
            isDirectory: e.isDirectory,
            isFile: e.isFile,
          });
        }
        return out;
      },
      async exists(args) {
        const { path } = args as { path: string };
        const canon = await scope.tryCheck(path);
        if (canon === null) {
          return false;
        }
        try {
          await tjs.stat(canon);
          return true;
        } catch {
          return false;
        }
      },
      async remove(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        await tjs.remove(canon);
      },
      async make_dir(args) {
        const { path, recursive } = args as {
          path: string;
          recursive?: boolean;
        };
        const canon = await scope.check(path);
        await tjs.makeDir(canon, recursive ? { recursive: true } : undefined);
      },
      async copy(args) {
        const { path, dest } = args as { path: string; dest: string };
        const [src, dst] = await Promise.all([
          scope.check(path),
          scope.check(dest),
        ]);
        await tjs.copyFile(src, dst);
      },
      async rename(args) {
        const { path, newPath } = args as { path: string; newPath: string };
        const [src, dst] = await Promise.all([
          scope.check(path),
          scope.check(newPath),
        ]);
        await tjs.rename(src, dst);
      },
      async open(args) {
        const { path, write = false, append = false, create = false } = args as {
          path: string;
          write?: boolean;
          append?: boolean;
          create?: boolean;
        };
        const canon = await scope.check(path);
        let bytes = new Uint8Array();
        try {
          bytes = new Uint8Array(await tjs.readFile(canon));
        } catch (e) {
          if (!create) throw e;
        }
        const id = nextHandleId++;
        handles.set(id, {
          path: canon,
          bytes,
          pos: append ? bytes.length : 0,
          write: write || append,
          append,
          dirty: false,
        });
        return { id };
      },
      async read(args) {
        const { id, length } = args as { id: number; length: number };
        const h = handles.get(Number(id));
        if (!h) throw new Error("fs: unknown handle");
        const slice = h.bytes.subarray(h.pos, h.pos + Math.max(0, length));
        h.pos += slice.length;
        return { data: b64Encode(slice), read: slice.length };
      },
      async seek(args) {
        const { id, offset, whence = "start" } = args as {
          id: number;
          offset: number;
          whence?: "start" | "current" | "end";
        };
        const h = handles.get(Number(id));
        if (!h) throw new Error("fs: unknown handle");
        const base =
          whence === "end"
            ? h.bytes.length
            : whence === "current"
              ? h.pos
              : 0;
        h.pos = Math.min(Math.max(0, base + Number(offset)), h.bytes.length);
        return { pos: h.pos };
      },
      async write(args) {
        const { id, data } = args as { id: number; data: string };
        const h = handles.get(Number(id));
        if (!h) throw new Error("fs: unknown handle");
        if (!h.write) throw new Error("fs: handle not opened for writing");
        const chunk = b64Decode(data);
        if (h.pos >= h.bytes.length) {
          const merged = new Uint8Array(h.pos + chunk.length);
          merged.set(h.bytes);
          merged.set(chunk, h.pos);
          h.bytes = merged;
        } else {
          h.bytes.set(chunk, h.pos);
        }
        h.pos += chunk.length;
        h.dirty = true;
        await persistHandle(h);
        return { written: chunk.length };
      },
      async flush(args) {
        const { id } = args as { id: number };
        const h = handles.get(Number(id));
        if (!h) throw new Error("fs: unknown handle");
        if (h.dirty) await persistHandle(h);
        return { flushed: true };
      },
      async close(args) {
        const { id } = args as { id: number };
        const h = handles.get(Number(id));
        if (!h) return { closed: false };
        if (h.dirty) await persistHandle(h);
        handles.delete(Number(id));
        return { closed: true };
      },
      async truncate(args) {
        const { path, length } = args as { path: string; length: number };
        const canon = await scope.check(path);
        if (!tjs.truncate) {
          throw new Error("fs: truncate unsupported on this tjs runtime");
        }
        await tjs.truncate(canon, Number(length));
        return { truncated: true };
      },
      async lstat(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        if (!tjs.lstat) {
          throw new Error("fs: lstat unsupported on this tjs runtime");
        }
        const st = (await tjs.lstat(canon)) as {
          size: number;
          mode: number;
          isSymlink?: boolean;
        };
        return {
          size: st.size,
          mode: st.mode,
          isSymlink: st.isSymlink ?? false,
        };
      },
      async read_link(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        if (!tjs.readLink) {
          throw new Error("fs: readLink unsupported on this tjs runtime");
        }
        return { target: await tjs.readLink(canon) };
      },
      async chmod(args) {
        const { path, mode } = args as { path: string; mode: number };
        const canon = await scope.check(path);
        if (!tjs.chmod) {
          throw new Error("fs: chmod unsupported on this tjs runtime");
        }
        await tjs.chmod(canon, Number(mode));
        return { mode: Number(mode) };
      },
      async watch(args, ctx) {
        const { path, id, ch, recursive } = args as {
          path: string;
          id: string;
          ch?: { kind: "channel"; id: number };
          recursive?: boolean;
        };
        if (recursive) {
          /* libuv fs_event has no portable recursive mode (upstream uses the
             notify crate); refuse instead of silently flattening. */
          throw new Error(
            "fs.watch: recursive watching is not supported by this platform watcher",
          );
        }
        const canon = await scope.check(path);
        const channel = ch ? ctx.getChannel(ch.id) : undefined;
        if (!channel) throw new Error("fs.watch requires a channel");
        const w = tjs.watch(canon, (filename, event) => {
          channel.send({
            type: event === "rename" ? "rename" : "modify",
            path: filename,
          });
        });
        watchers.set(id, w);
        return { watching: canon };
      },
      async unwatch(args) {
        const { id } = args as { id: string };
        watchers.get(id)?.close();
        watchers.delete(id);
        return { closed: true };
      },
      async stat(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        const s = (await tjs.stat(canon)) as unknown as {
          size: number;
          mode: number;
          mtime?: string;
        };
        return {
          size: s.size ?? 0,
          isDirectory: modeIsDir(s.mode),
          isFile: !modeIsDir(s.mode),
          modifiedAt: s.mtime ?? null,
        } satisfies FileMeta;
      },
    },

    permissions: [
      {
        identifier: "fs:allow-open",
        commands: [fsCommands.open, fsCommands.close, fsCommands.flush,
                   fsCommands.read, fsCommands.seek, fsCommands.write],
      },
      {
        identifier: "fs:allow-truncate",
        commands: [fsCommands.truncate],
      },
      {
        identifier: "fs:allow-lstat",
        commands: [fsCommands.lstat],
      },
      {
        identifier: "fs:allow-read-link",
        commands: [fsCommands.read_link],
      },
      {
        identifier: "fs:allow-chmod",
        commands: [fsCommands.chmod],
      },
      {
        identifier: "fs:allow-read-file",
        description: "Allows reading binary files via plugin:fs|read_file.",
        commands: [fsCommands.read_file],
      },
      {
        identifier: "fs:allow-write-file",
        description: "Allows writing binary files via plugin:fs|write_file.",
        commands: [fsCommands.write_file],
      },
      {
        identifier: "fs:allow-read-text-file",
        description: "Allows reading text files via plugin:fs|read_text.",
        commands: [fsCommands.read_text],
      },
      {
        identifier: "fs:allow-write-text-file",
        description: "Allows writing text files via plugin:fs|write_text.",
        commands: [fsCommands.write_text],
      },
      {
        identifier: "fs:allow-watch",
        description: "Allows watching paths for changes via plugin:fs|watch.",
        commands: [fsCommands.watch, fsCommands.unwatch],
      },
      {
        identifier: "fs:allow-read-dir",
        commands: [fsCommands.read_dir],
      },
      {
        identifier: "fs:allow-exists",
        commands: [fsCommands.exists],
      },
      {
        identifier: "fs:allow-remove",
        commands: [fsCommands.remove],
      },
      {
        identifier: "fs:allow-make-dir",
        commands: [fsCommands.make_dir],
      },
      {
        identifier: "fs:allow-copy",
        commands: [fsCommands.copy],
      },
      {
        identifier: "fs:allow-rename",
        commands: [fsCommands.rename],
      },
      {
        identifier: "fs:allow-stat",
        commands: [fsCommands.stat],
      },
      {
        identifier: "fs:deny-write-text-file",
        description: "Explicitly denies writing text files (overrides allow).",
        commands: [`!${fsCommands.write_text}`],
      },
    ],
    permissionSets: [
      {
        name: "fs:default",
        description:
          "Allows read-only filesystem access (read_text, read_dir, exists).",
        permissions: [
          "fs:allow-read-text-file",
          "fs:allow-read-dir",
          "fs:allow-exists",
        ],
      },
      {
        name: "fs:write-default",
        description:
          "Allows read + write, but not remove (safer default for apps).",
        permissions: ["fs:default", "fs:allow-write-text-file"],
      },
      {
        name: "fs:full",
        description: "All filesystem operations including remove/copy/rename.",
        permissions: [
          "fs:default",
          "fs:allow-write-text-file",
          "fs:allow-remove",
          "fs:allow-copy",
          "fs:allow-rename",
          "fs:allow-stat",
        ],
      },
    ],
  };
}
