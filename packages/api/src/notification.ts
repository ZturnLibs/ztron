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

/** Whether the OS has authorized notifications for this app. */
export async function isPermissionGranted(): Promise<boolean> {
  return invoke<boolean>("plugin:notification|is_permission_granted", {});
}

/** Prompts the user for notification authorization (resolves the grant). */
export async function requestPermission(): Promise<boolean> {
  return invoke<boolean>("plugin:notification|request_permission", {});
}

export const notification = {
  send: sendNotification,
  isPermissionGranted,
  requestPermission,
};
