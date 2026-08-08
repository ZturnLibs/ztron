/**
 * Window-state API — persist/restore the current window geometry via the
 * `plugin:window-state|*` commands.
 */
import { invoke } from "./core.js";

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
  alwaysOnTop: boolean;
}

export interface WindowStateOptions {
  /** Absolute path of the state JSON file. */
  file?: string;
}

/** Reads the persisted window geometry (null when none is saved). */
export async function getWindowState(
  options: WindowStateOptions = {},
): Promise<WindowState | null> {
  return invoke<WindowState | null>("plugin:window-state|get", {
    ...options,
  });
}

/** Persists the current window geometry and returns what was saved. */
export async function saveWindowState(
  options: WindowStateOptions = {},
): Promise<WindowState> {
  return invoke<WindowState>("plugin:window-state|save", { ...options });
}

/** Restores the persisted window geometry (no-op when none is saved). */
export async function restoreWindowState(
  options: WindowStateOptions = {},
): Promise<WindowState | null> {
  return invoke<WindowState | null>("plugin:window-state|restore", {
    ...options,
  });
}

export const windowState = {
  get: getWindowState,
  save: saveWindowState,
  restore: restoreWindowState,
};
