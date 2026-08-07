/**
 * Deep-link API — a port of Tauri's `tauri-plugin-deep-link`, backed by the
 * built-in `plugin:deep-link|*` commands and the `tauri://deep-link` event.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

/** The most recent deep-link URL (null when the app was launched normally). */
export async function getCurrentUrl(): Promise<string | null> {
  return invoke<string | null>("plugin:deep-link|get_last_url", {});
}

/**
 * Listens for deep-link URLs opened while the app is running. The handler
 * receives the full `ztron://...` URL.
 */
export async function onDeepLink(
  handler: (url: string) => void,
): Promise<() => Promise<void>> {
  return listen<{ url: string }>("tauri://deep-link", (e) =>
    handler(e.payload.url),
  );
}

export const deepLink = {
  getCurrentUrl,
  onDeepLink,
};
