/**
 * Path utilities — mirrors `plugin:path|*` commands from `@ztron/core`.
 * Pure string operations, no scope needed.
 */
import { invoke } from "./core.js";

export function join(...parts: string[]): Promise<string> {
  return invoke<string>("plugin:path|join", { parts });
}

export function resolve(path: string): Promise<string> {
  return invoke<string>("plugin:path|resolve", { path });
}

export function normalize(path: string): Promise<string> {
  return invoke<string>("plugin:path|normalize", { path });
}

export function isAbsolute(path: string): Promise<boolean> {
  return invoke<boolean>("plugin:path|is_absolute", { path });
}

export function basename(path: string, ext?: string): Promise<string> {
  return invoke<string>("plugin:path|basename", { path, ext });
}

export function dirname(path: string): Promise<string> {
  return invoke<string>("plugin:path|dirname", { path });
}

export function extname(path: string): Promise<string> {
  return invoke<string>("plugin:path|extname", { path });
}

/** The user's home directory. */
export function homeDir(): Promise<string> {
  return invoke<string>("plugin:path|home_dir", {});
}

/** The system temporary directory. */
export function tempDir(): Promise<string> {
  return invoke<string>("plugin:path|temp_dir", {});
}

/** The current working directory. */
export function cwd(): Promise<string> {
  return invoke<string>("plugin:path|cwd", {});
}

/** App-specific data directory. */
export function appDataDir(): Promise<string> {
  return invoke<string>("plugin:path|app_data_dir", {});
}
export function appConfigDir(): Promise<string> {
  return invoke<string>("plugin:path|app_config_dir", {});
}
export function appCacheDir(): Promise<string> {
  return invoke<string>("plugin:path|app_cache_dir", {});
}
export function appLocalDataDir(): Promise<string> {
  return invoke<string>("plugin:path|app_local_data_dir", {});
}
export function appLogDir(): Promise<string> {
  return invoke<string>("plugin:path|app_log_dir", {});
}
export function baselineDir(): Promise<string> {
  return invoke<string>("plugin:path|baseline_dir", {});
}
export function dataDir(): Promise<string> {
  return invoke<string>("plugin:path|data_dir", {});
}
export function configDir(): Promise<string> {
  return invoke<string>("plugin:path|config_dir", {});
}
export function cacheDir(): Promise<string> {
  return invoke<string>("plugin:path|cache_dir", {});
}
export function fontDir(): Promise<string> {
  return invoke<string>("plugin:path|font_dir", {});
}
export function desktopDir(): Promise<string> {
  return invoke<string>("plugin:path|desktop_dir", {});
}
export function documentDir(): Promise<string> {
  return invoke<string>("plugin:path|document_dir", {});
}
export function downloadDir(): Promise<string> {
  return invoke<string>("plugin:path|download_dir", {});
}
export function pictureDir(): Promise<string> {
  return invoke<string>("plugin:path|picture_dir", {});
}
export function audioDir(): Promise<string> {
  return invoke<string>("plugin:path|audio_dir", {});
}
export function videoDir(): Promise<string> {
  return invoke<string>("plugin:path|video_dir", {});
}
export function publicDir(): Promise<string> {
  return invoke<string>("plugin:path|public_dir", {});
}
export function templateDir(): Promise<string> {
  return invoke<string>("plugin:path|template_dir", {});
}
export function runtimeDir(): Promise<string> {
  return invoke<string>("plugin:path|runtime_dir", {});
}
export function executableDir(): Promise<string> {
  return invoke<string>("plugin:path|executable_dir", {});
}
export function resourceDir(): Promise<string> {
  return invoke<string>("plugin:path|resource_dir", {});
}

/**
 * Resolves a bundled asset path against the resource directory — the
 * Tauri v2 `resolveResource(resourcePath, base?)` (formerly
 * `resolveResource`). Absolute paths pass through unchanged.
 */
export async function resolveResource(
  resourcePath: string,
): Promise<string> {
  if (await isAbsolute(resourcePath)) return resourcePath;
  const dir = await resourceDir();
  return invoke<string>("plugin:path|join", { parts: [dir, resourcePath] });
}

/** Path fragment separator: `/` on POSIX, `\\` on Windows. */
export const sep = "/";

/** Path list separator in PATH-style variables: `:` on POSIX, `;` on Windows. */
export const delimiter = ":";

/**
 * Tauri v2 name for {@linkcode appLocalDataDir} (kept as an alias — Tauri's
 * own JS API exposes both).
 */
export function localDataDir(): Promise<string> {
  return appLocalDataDir();
}

export const path = {
  join,
  resolve,
  resolveResource,
  normalize,
  isAbsolute,
  basename,
  dirname,
  extname,
  sep,
  delimiter,
  localDataDir,
  homeDir,
  tempDir,
  cwd,
  appDataDir,
  appConfigDir,
  appCacheDir,
  appLocalDataDir,
  appLogDir,
  baselineDir,
  dataDir,
  configDir,
  cacheDir,
  fontDir,
  desktopDir,
  documentDir,
  downloadDir,
  pictureDir,
  audioDir,
  videoDir,
  publicDir,
  templateDir,
  runtimeDir,
  executableDir,
  resourceDir,
};

/**
 * Upstream BaseDirectory names (23) — pass to fs/path fns as
 * `options.baseDir`; values resolve against the directory getters in this
 * module (Tauri strings, e.g. `BaseDirectory.AppConfig === "AppConfig"`).
 */
export const BaseDirectory = {
  Audio: "Audio",
  Cache: "Cache",
  Config: "Config",
  Data: "Data",
  LocalData: "LocalData",
  Document: "Document",
  Download: "Download",
  Picture: "Picture",
  Public: "Public",
  Video: "Video",
  Resource: "Resource",
  Temp: "Temp",
  AppConfig: "AppConfig",
  AppData: "AppData",
  AppLocalData: "AppLocalData",
  AppCache: "AppCache",
  AppLog: "AppLog",
  Desktop: "Desktop",
  Executable: "Executable",
  Font: "Font",
  Home: "Home",
  Runtime: "Runtime",
  Template: "Template",
} as const;
export type BaseDirectory = (typeof BaseDirectory)[keyof typeof BaseDirectory];

/** Resolves a BaseDirectory name to its absolute path. */
export async function resolveBaseDirectory(
  base: BaseDirectory | string,
): Promise<string> {
  switch (base) {
    case "Audio": return audioDir();
    case "Cache": return cacheDir();
    case "Config": return configDir();
    case "Data": return dataDir();
    case "LocalData": return localDataDir();
    case "Document": return documentDir();
    case "Download": return downloadDir();
    case "Picture": return pictureDir();
    case "Public": return publicDir();
    case "Video": return videoDir();
    case "Resource": return resourceDir();
    case "Temp": return tempDir();
    case "AppConfig": return appConfigDir();
    case "AppData": return appDataDir();
    case "AppLocalData": return appLocalDataDir();
    case "AppCache": return appCacheDir();
    case "AppLog": return appLogDir();
    case "Desktop": return desktopDir();
    case "Executable": return executableDir();
    case "Font": return fontDir();
    case "Home": return homeDir();
    case "Runtime": return runtimeDir();
    case "Template": return templateDir();
    default:
      throw new Error(`path: unknown BaseDirectory "${base}"`);
  }
}
