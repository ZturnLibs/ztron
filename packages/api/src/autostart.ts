/** Autostart API — mirrors `plugin:autostart|*`. */
import { invoke } from "./core.js";

export async function enableAutostart(): Promise<void> {
  await invoke("plugin:autostart|enable", {});
}
export async function disableAutostart(): Promise<void> {
  await invoke("plugin:autostart|disable", {});
}
export async function isAutostartEnabled(): Promise<boolean> {
  return invoke<boolean>("plugin:autostart|is_enabled", {});
}

export const autostart = {
  enable: enableAutostart,
  disable: disableAutostart,
  isEnabled: isAutostartEnabled,
};
