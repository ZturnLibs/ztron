/**
 * App metadata API — a port of `@tauri-apps/api/app`, backed by the built-in
 * `plugin:app|*` commands.
 */
import { invoke } from "./core.js";

/** The configured app name (falls back to the bundle identifier). */
export async function getName(): Promise<string> {
  return invoke("plugin:app|name", {});
}

/** The configured app version. */
export async function getVersion(): Promise<string> {
  return invoke("plugin:app|version", {});
}

/** The Ztron API version (mirrors Tauri's getTauriVersion). */
export async function getTauriVersion(): Promise<string> {
  return invoke("plugin:app|tauri_version", {});
}

export interface AppInfo {
  identifier: string;
  appName?: string;
  version?: string;
}

/** The app configuration (identifier/name/version; secrets are stripped). */
export async function getConfig(): Promise<AppInfo & Record<string, unknown>> {
  return invoke("plugin:app|get_config", {});
}

/** The configured bundle identifier (e.g. `com.example.app`). */
export async function getIdentifier(): Promise<string> {
  return invoke("plugin:app|identifier", {});
}

/**
 * Installer format of the current distribution — mirrors Tauri's
 * `BundleType` (`App` when running inside an .app bundle or in dev).
 */
export enum BundleType {
  Nsis = "Nsis",
  Msi = "Msi",
  Deb = "Deb",
  Rpm = "Rpm",
  AppImage = "AppImage",
  App = "App",
}

/** The distribution format this build was packaged into. */
export async function getBundleType(): Promise<string> {
  return invoke("plugin:app|bundle_type", {});
}

/** Whether the runtime supports creating further windows at run time. */
export async function supportsMultipleWindows(): Promise<boolean> {
  return invoke("plugin:app|supports_multiple_windows", {});
}

/** Shows the whole application (macOS: unhide + activate). */
export async function showApplication(): Promise<void> {
  await invoke("plugin:app|show", {});
}

/** Hides the whole application and all its windows (macOS NSApp hide:). */
export async function hideApplication(): Promise<void> {
  await invoke("plugin:app|hide", {});
}

/** The registered default window icon (null when none set). */
export async function defaultWindowIcon(): Promise<null> {
  return invoke("plugin:app|default_window_icon", {});
}

/** Android-only upstream: known data-store identifiers (empty on desktop). */
export async function fetchDataStoreIdentifiers(): Promise<string[]> {
  return invoke("plugin:app|fetch_data_store_identifiers", {});
}

/** Android-only upstream: removes one data store (no-op on desktop). */
export async function removeDataStore(id: string): Promise<{ removed: boolean }> {
  return invoke("plugin:app|remove_data_store", { id });
}

/** Toggles the macOS Dock icon for the running application. */
export async function setDockVisibility(visible: boolean): Promise<void> {
  await invoke("plugin:app|set_dock_visibility", { visible });
}

export const app = {
  getName,
  getVersion,
  getTauriVersion,
  getConfig,
  getIdentifier,
  getBundleType,
  supportsMultipleWindows,
  show: showApplication,
  hide: hideApplication,
  setDockVisibility,
  defaultWindowIcon,
  fetchDataStoreIdentifiers,
  removeDataStore,
};
