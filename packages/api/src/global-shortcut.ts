/**
 * Global shortcut API — a port of Tauri's `tauri-plugin-global-shortcut`,
 * backed by the built-in `plugin:global-shortcut|*` commands.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

/**
 * Registers a global hotkey. Accelerator format: `Cmd+Shift+K`, `Ctrl+Alt+1`,
 * `F5`, etc. Returns whether the OS accepted the registration.
 */
export async function registerShortcut(
  id: string,
  accelerator: string,
): Promise<boolean> {
  return invoke("plugin:global-shortcut|register", { id, accelerator });
}

/** Unregisters a previously registered hotkey by id. */
export async function unregisterShortcut(id: string): Promise<boolean> {
  return invoke("plugin:global-shortcut|unregister", { id });
}

/**
 * Listens to global shortcut activations. The handler receives the shortcut
 * id registered via {@linkcode registerShortcut}.
 */
export async function onShortcut(
  handler: (event: { shortcutId: string }) => void,
): Promise<() => Promise<void>> {
  return listen<{ shortcutId: string }>("tauri://global-shortcut", (e) =>
    handler(e.payload),
  );
}

export const globalShortcut = {
  register: registerShortcut,
  unregister: unregisterShortcut,
  onShortcut,
};
