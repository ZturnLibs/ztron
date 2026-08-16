/**
 * `plugin:fs|*` — scoped filesystem capability.
 *
 * All commands are gated by a {@link PathScope}: paths are resolved,
 * canonicalized and checked against the allowlist before touching the disk.
 * Translated conceptually from Tauri's `tauri-plugin-fs` (scope + commands).
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";

const dec = new TextDecoder();

/** Base64 <-> bytes (binary fs payloads cross the JSON wire as base64). */
function bytesToB64(bytes: Uint8Array): string {
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
  } as const;

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
        return { base64: bytesToB64(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)) };
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
      async watch(args, ctx) {
        const { path, id, ch } = args as {
          path: string;
          id: string;
          ch?: { kind: "channel"; id: number };
        };
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
