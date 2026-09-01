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
  multiple?: boolean;
  /** Allowed extensions, e.g. ["png","jpg"]. */
  filters?: string[];
  /** Max selectable files (>1 enables multi-select; result becomes an array). */
  maxFiles?: number;
  canCreateDirectories?: boolean;
}

export interface SaveDialogOptions {
  title?: string;
  defaultName?: string;
}

export interface MessageDialogOptions {
  title?: string;
  /** Alert severity: "info" (default) | "warning" | "error". */
  kind?: "info" | "warning" | "error";
}

export interface MessageDialogOptionsFull extends MessageDialogOptions {
  message?: string;
}

/** Shows a native open-file (or directory) dialog; null if cancelled. */
export async function open(
  options: OpenDialogOptions = {},
): Promise<string | string[] | null> {
  /* maxFiles>1 / multiple may return an array (upstream shape). */
  const multi = (options.maxFiles ?? (options.multiple ? 2 : 1)) > 1;
  const r = await invoke<unknown>("plugin:dialog|open", options as InvokeArgs);
  if (r == null) return null;
  if (typeof r === "string") {
    if (!multi) return r;
    return r.startsWith("[") ? (JSON.parse(r) as string[]) : r;
  }
  return r as string[];
}

/** Shows a native save dialog; null if cancelled. */
export async function save(
  options: SaveDialogOptions = {},
): Promise<string | null> {
  return invoke<string | null>("plugin:dialog|save", options as InvokeArgs);
}

/** Shows a native message/alert dialog; returns the clicked button index. */
export async function message(
  messageOrOptions: string | (MessageDialogOptionsFull & { message?: string }),
  options: MessageDialogOptions = {},
): Promise<number> {
  const opts =
    typeof messageOrOptions === "string"
      ? { message: messageOrOptions, ...options }
      : messageOrOptions;
  return invoke<number>("plugin:dialog|message", {
    title: opts.title ?? "",
    message: opts.message ?? "",
    kind: opts.kind,
  });
}

/** Shows an OK/Cancel question dialog; resolves true when confirmed. */
export async function ask(
  messageOrOptions: string | (MessageDialogOptionsFull & { message?: string }),
  options: MessageDialogOptions = {},
): Promise<boolean> {
  const opts =
    typeof messageOrOptions === "string"
      ? { message: messageOrOptions, ...options }
      : messageOrOptions;
  return invoke<boolean>("plugin:dialog|ask", {
    title: opts.title ?? "",
    message: opts.message ?? "",
    kind: opts.kind,
  });
}

/** Shows an OK/Cancel confirmation; resolves true when confirmed. */
export async function confirm(
  messageOrOptions: string | (MessageDialogOptionsFull & { message?: string }),
  options: MessageDialogOptions = {},
): Promise<boolean> {
  const opts =
    typeof messageOrOptions === "string"
      ? { message: messageOrOptions, ...options }
      : messageOrOptions;
  return invoke<boolean>("plugin:dialog|confirm", {
    title: opts.title ?? "",
    message: opts.message ?? "",
    kind: opts.kind,
  });
}

export const dialog = { open, save, message, ask, confirm };
