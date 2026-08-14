/**
 * Opener API — a port of `@tauri-apps/plugin-opener`'s JS bindings
 * (the successor of `shell.open`).
 */
import { invoke } from "./core.js";

/** Opens a URL with the default (or the given) application. */
export function openUrl(url: string, openWith?: string): Promise<void> {
  return invoke("plugin:opener|open_url", {
    url,
    open_with: openWith,
  });
}

/** Opens a path (file/directory) with the default (or the given) application. */
export function openPath(path: string, openWith?: string): Promise<void> {
  return invoke("plugin:opener|open_path", {
    path,
    open_with: openWith,
  });
}

/** Reveals a path in the file manager with the item selected. */
export function revealItemInDir(path: string): Promise<void> {
  return invoke("plugin:opener|reveal_item_in_dir", { path });
}
