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

export interface FsPluginOptions {
  scope: PathScopeConfig;
}

export interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

export function fsPlugin(options: FsPluginOptions): Plugin {
  const scope = new PathScope(options.scope);

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
      async read_dir(args) {
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        const entries = await tjs.readDir(canon);
        return entries.map((e): DirEntry => ({
          name: e.name,
          isDirectory: e.isDirectory,
          isFile: e.isFile,
        }));
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
        const { path } = args as { path: string };
        const canon = await scope.check(path);
        await tjs.makeDir(canon);
      },
    },
  };
}
