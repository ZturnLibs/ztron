/**
 * Notification API — a port of Tauri's `tauri-plugin-notification`, backed by
 * the built-in `plugin:notification|send` command.
 */
import { invoke } from "./core.js";

export interface NotificationOptions {
  title: string;
  body?: string;
}

/** Sends a native notification (title + optional body). */
export async function sendNotification(
  options: NotificationOptions,
): Promise<void> {
  await invoke("plugin:notification|send", {
    title: options.title,
    body: options.body ?? "",
  });
}

export const notification = { send: sendNotification };
