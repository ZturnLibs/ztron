/**
 * `plugin:path|*` — stateless path utilities wrapping `tjs:path`.
 * No scope needed (pure string operations).
 *
 * `tjs:path` is loaded lazily so the module can be imported under Node
 * (for MockRuntime tests) without failing on the tjs-only specifier.
 */
import type { Plugin } from "../plugin.js";

interface PathLike {
  join(...p: string[]): string;
  resolve(...p: string[]): string;
  normalize(p: string): string;
  isAbsolute(p: string): boolean;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
  extname(p: string): string;
  sep: string;
}

let pathMod: PathLike | null = null;

async function path(): Promise<PathLike> {
  if (!pathMod) {
    const mod = (await import("tjs:path")) as {
      default: PathLike;
    };
    pathMod = mod.default ?? mod;
  }
  return pathMod;
}

export function pathPlugin(): Plugin {
  const cmds = [
    "join",
    "resolve",
    "normalize",
    "is_absolute",
    "basename",
    "dirname",
    "extname",
    "sep",
  ] as const;
  return {
    name: "path",
    commands: {
      join: async (args) =>
        (await path()).join(...((args as { parts?: string[] }).parts ?? [])),
      resolve: async (args) =>
        (await path()).resolve((args as { path: string }).path),
      normalize: async (args) =>
        (await path()).normalize((args as { path: string }).path),
      is_absolute: async (args) =>
        (await path()).isAbsolute((args as { path: string }).path),
      basename: async (args) =>
        (await path()).basename(
          (args as { path: string; ext?: string }).path,
          (args as { ext?: string }).ext,
        ),
      dirname: async (args) =>
        (await path()).dirname((args as { path: string }).path),
      extname: async (args) =>
        (await path()).extname((args as { path: string }).path),
      sep: async () => (await path()).sep,
    },
    permissions: cmds.map((c) => ({
      identifier: `path:allow-${c.replace(/_/g, "-")}`,
      commands: [`plugin:path|${c}`],
    })),
    permissionSets: [
      {
        name: "path:default",
        description: "All path utilities (pure string operations, no scope).",
        permissions: cmds.map((c) => `path:allow-${c.replace(/_/g, "-")}`),
      },
    ],
  };
}
