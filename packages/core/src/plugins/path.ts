/**
 * `plugin:path|*` — stateless path utilities wrapping `tjs:path`.
 * No scope needed (pure string operations).
 */
import pathMod from "tjs:path";
import type { Plugin } from "../plugin.js";

export function pathPlugin(): Plugin {
  return {
    name: "path",
    commands: {
      join: (args) =>
        pathMod.join(...((args as { parts?: string[] }).parts ?? [])),
      resolve: (args) => pathMod.resolve((args as { path: string }).path),
      normalize: (args) => pathMod.normalize((args as { path: string }).path),
      is_absolute: (args) =>
        pathMod.isAbsolute((args as { path: string }).path),
      basename: (args) =>
        pathMod.basename(
          (args as { path: string; ext?: string }).path,
          (args as { ext?: string }).ext,
        ),
      dirname: (args) => pathMod.dirname((args as { path: string }).path),
      extname: (args) => pathMod.extname((args as { path: string }).path),
      sep: () => pathMod.sep,
    },
  };
}
