/**
 * Single-instance API — a port of Tauri's `tauri-plugin-single-instance`,
 * backed by the `plugin:single-instance|*` commands.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

/** Whether this process is the primary (first-launched) instance. */
export async function isPrimaryInstance(): Promise<boolean> {
  return invoke<boolean>("plugin:single-instance|is_primary", {});
}

/**
 * Listens for a second instance attempting to launch. The handler runs on the
 * primary instance with the second instance's argv/cwd (argv is currently
 * always empty).
 */
export async function onSecondInstance(
  handler: (event: { argv: string[]; cwd: string }) => void,
): Promise<() => Promise<void>> {
  return listen<{ argv: string[]; cwd: string }>(
    "ztron://single-instance",
    (e) => handler(e.payload),
  );
}

export const singleInstance = {
  isPrimary: isPrimaryInstance,
  onSecondInstance,
};
