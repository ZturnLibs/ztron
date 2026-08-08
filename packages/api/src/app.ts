/**
 * App metadata API — a port of `@tauri-apps/api/app`, backed by the built-in
 * `plugin:app|*` commands.
 */
import { invoke } from "./core.js";

/** The configured app name (falls back to the bundle identifier). */
export async function getName(): Promise<string> {
  return invoke("plugin:app|name", {});
}

/** The configured app version. */
export async function getVersion(): Promise<string> {
  return invoke("plugin:app|version", {});
}

/** The Ztron API version (mirrors Tauri's getTauriVersion). */
export async function getTauriVersion(): Promise<string> {
  return invoke("plugin:app|tauri_version", {});
}

export const app = { getName, getVersion, getTauriVersion };
