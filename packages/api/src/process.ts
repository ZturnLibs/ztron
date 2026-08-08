/**
 * Process API — a port of `@tauri-apps/api/process`, backed by the built-in
 * `plugin:process|*` commands.
 */
import { invoke } from "./core.js";

/** Terminates the app with an optional exit code. */
export async function exit(code = 0): Promise<void> {
  await invoke("plugin:process|exit", { code });
}

/**
 * Restarts the app. Best-effort: the host respawns itself detached and the
 * current process terminates (in a packaged app the launcher respawns the
 * full host + backend pair).
 */
export async function relaunch(): Promise<void> {
  await invoke("plugin:process|relaunch", {});
}

export const process = { exit, relaunch };
