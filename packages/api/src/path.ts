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

export const path = {
  join,
  resolve,
  normalize,
  isAbsolute,
  basename,
  dirname,
  extname,
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
