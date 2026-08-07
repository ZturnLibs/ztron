/**
 * Positioner API — a port of Tauri's `tauri-plugin-positioner` for the
 * current window, backed by the built-in `plugin:window|*` commands.
 */
import { invoke } from "./core.js";

/** The current window's origin (top-left of the frame). */
export async function getPosition(): Promise<{ x: number; y: number }> {
  return invoke("plugin:window|get_position", {});
}

/** Moves the current window so its top-left corner is at (x, y). */
export async function setPosition(x: number, y: number): Promise<void> {
  await invoke("plugin:window|set_position", { x, y });
}

/** The current window's inner size (width × height). */
export async function getSize(): Promise<{ width: number; height: number }> {
  const frame = await getFrame();
  if (!frame) {
    return { width: 0, height: 0 };
  }
  return { width: frame.width, height: frame.height };
}

/** The current window's full frame (position + size). */
export async function getFrame(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  return invoke("plugin:window|get_frame", {});
}

export const positioner = {
  getPosition,
  setPosition,
  getSize,
  getFrame,
};
