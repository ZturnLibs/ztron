/**
 * `plugin:opener|*` — open URLs / paths / reveal in file manager.
 * Translated from Tauri's `tauri-plugin-opener` (successor of the shell
 * plugin's open): `open_url` (default browser), `open_path` (default app)
 * and `reveal_item_in_dir` (Finder/Explorer/file manager, item selected).
 */
import type { Plugin } from "../plugin.js";

export interface OpenerPluginOptions {
  /** URL schemes allowed by `open_url` (default: http/https/mailto). */
  urlSchemes?: string[];
}

function platform(): "darwin" | "windows" | "linux" {
  const p = (
    (globalThis as { navigator?: { platform?: string } }).navigator
      ?.platform ?? ""
  ).toLowerCase();
  if (p.includes("win")) return "windows";
  if (p.includes("linux")) return "linux";
  return "darwin";
}

/** Resolves the launcher argv for a URL/path open on this platform. */
function openArgv(target: string): string[] {
  switch (platform()) {
    case "darwin":
      return ["open", target];
    case "windows":
      return ["cmd", "/c", "start", "", target];
    default:
      return ["xdg-open", target];
  }
}

function revealArgv(path: string): string[] {
  switch (platform()) {
    case "darwin":
      return ["open", "-R", path];
    case "windows":
      return ["explorer", `/select,${path}`];
    default: {
      // xdg-open can't select items; reveal the containing directory.
      const dir = path.split("/").slice(0, -1).join("/") || "/";
      return ["xdg-open", dir];
    }
  }
}

function schemeAllowed(url: string, schemes: string[]): boolean {
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!m) return false;
  return schemes.includes(m[1]!.toLowerCase());
}

export function openerPlugin(options: OpenerPluginOptions = {}): Plugin {
  const schemes = (options.urlSchemes ?? ["http", "https", "mailto"]).map(
    (s) => s.toLowerCase(),
  );
  return {
    name: "opener",
    commands: {
      async open_url(args) {
        const { url, open_with } = args as { url: string; open_with?: string };
        if (!schemeAllowed(url, schemes)) {
          throw new Error(`opener: URL scheme not allowed: ${url}`);
        }
        const argv = open_with
          ? platform() === "darwin"
            ? ["open", "-a", open_with, url]
            : [open_with, url]
          : openArgv(url);
        const proc = tjs.spawn(argv, { stdout: "ignore", stderr: "ignore" });
        await proc.wait();
        return { opened: true };
      },
      async open_path(args) {
        const { path, open_with } = args as { path: string; open_with?: string };
        if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) {
          throw new Error(`opener: expected an absolute path: ${path}`);
        }
        const argv = open_with
          ? platform() === "darwin"
            ? ["open", "-a", open_with, path]
            : [open_with, path]
          : openArgv(path);
        const proc = tjs.spawn(argv, { stdout: "ignore", stderr: "ignore" });
        await proc.wait();
        return { opened: true };
      },
      async reveal_item_in_dir(args) {
        const { path } = args as { path: string };
        const proc = tjs.spawn(revealArgv(path), {
          stdout: "ignore",
          stderr: "ignore",
        });
        await proc.wait();
        return { revealed: true };
      },
    },
    permissions: [
      {
        identifier: "opener:allow-open-url",
        commands: ["plugin:opener|open_url"],
      },
      {
        identifier: "opener:allow-open-path",
        commands: ["plugin:opener|open_path"],
      },
      {
        identifier: "opener:allow-reveal-item-in-dir",
        commands: ["plugin:opener|reveal_item_in_dir"],
      },
      {
        identifier: "opener:deny-open-url",
        commands: ["!plugin:opener|open_url"],
      },
    ],
    permissionSets: [
      {
        name: "opener:default",
        description: "Allows opening URLs and paths with system defaults.",
        permissions: [
          "opener:allow-open-url",
          "opener:allow-open-path",
          "opener:allow-reveal-item-in-dir",
        ],
      },
    ],
  };
}
