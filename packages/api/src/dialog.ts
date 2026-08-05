/**
 * Native dialog API — a port of `@tauri-apps/plugin-dialog`, backed by the
 * built-in `plugin:dialog|*` commands.
 *
 * Dialogs are modal and require user interaction.
 */
import { invoke } from "./core.js";
import type { InvokeArgs } from "./core.js";

export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultName?: string;
}

export interface MessageDialogOptions {
  title: string;
  message?: string;
}

/** Shows a native open-file (or directory) dialog; null if cancelled. */
export async function open(
  options: OpenDialogOptions = {},
): Promise<string | null> {
  return invoke<string | null>("plugin:dialog|open", options as InvokeArgs);
}

/** Shows a native save dialog; null if cancelled. */
export async function save(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  return invoke<string | null>("plugin:dialog|save", options as InvokeArgs);
}

/** Shows a native message/alert dialog; returns the clicked button index. */
export async function message(options: MessageDialogOptions): Promise<number> {
  return invoke<number>(
    "plugin:dialog|message",
    options as unknown as InvokeArgs,
  );
}

export const dialog = { open, save, message };
