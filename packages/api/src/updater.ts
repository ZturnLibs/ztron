/** Updater API — mirrors `plugin:updater|*`. */
import { invoke } from "./core.js";

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  artifactUrl?: string;
  sha256?: string;
}

export function check(url?: string): Promise<UpdateCheck> {
  return invoke<UpdateCheck>("plugin:updater|check", url ? { url } : {});
}

export function download(
  url: string,
  destination: string,
): Promise<{ bytes: number; path: string }> {
  return invoke("plugin:updater|download", { url, destination });
}

export function verify(
  file: string,
  sha256: string,
): Promise<{ ok: boolean; actual: string }> {
  return invoke("plugin:updater|verify", { file, sha256 });
}

/**
 * One-shot update application (Tauri's `downloadAndInstall`): check →
 * download → verify (aborts on sha256 mismatch) → relaunch.
 * `ok: false` means the manifest had no newer version.
 */
export function install(
  url?: string,
): Promise<
  | { ok: false; reason: "no-update" }
  | { ok: true; bytes: number; path: string }
> {
  return invoke("plugin:updater|install", url ? { url } : {});
}

export const updater = { check, download, verify, install };
