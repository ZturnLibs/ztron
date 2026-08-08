/**
 * `plugin:path|*` — stateless path utilities + platform directory getters.
 * No scope needed (pure string operations).
 *
 * `tjs:path` is loaded lazily so the module can be imported under Node
 * (for MockRuntime tests) without failing on the tjs-only specifier.
 */
import type { Plugin } from "../plugin.js";

interface PathLike {
  join(...p: string[]): string;
  resolve(...p: string[]): string;
  normalize(p: string): string;
  isAbsolute(p: string): boolean;
  basename(p: string, ext?: string): string;
  dirname(p: string): string;
  extname(p: string): string;
  sep: string;
}

export interface PathPluginOptions {
  /** Reverse-domain identifier used for app-specific dirs (appDataDir…). */
  appId?: string;
}

let pathMod: PathLike | null = null;

async function path(): Promise<PathLike> {
  if (!pathMod) {
    const mod = (await import("tjs:path")) as {
      default: PathLike;
    };
    pathMod = mod.default ?? mod;
  }
  return pathMod;
}

function platform(): "macos" | "linux" | "windows" {
  const p = (
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    ""
  ).toLowerCase();
  if (p.includes("mac")) return "macos";
  if (p.includes("linux")) return "linux";
  return "windows";
}

/** Platform directory conventions (macOS primary; Linux/Windows best-effort). */
function dirs(
  platform: "macos" | "linux" | "windows",
  appId: string,
): Record<string, string> {
  const home = tjs.homeDir;
  const exeDir = tjs.exePath
    ? tjs.exePath.slice(0, tjs.exePath.lastIndexOf("/"))
    : home;
  if (platform === "macos") {
    return {
      appDataDir: `${home}/Library/Application Support/${appId}`,
      appConfigDir: `${home}/Library/Application Support/${appId}`,
      appCacheDir: `${home}/Library/Caches/${appId}`,
      appLocalDataDir: `${home}/Library/Application Support/${appId}`,
      appLogDir: `${home}/Library/Logs/${appId}`,
      baselineDir: `${home}/Library/Application Support/${appId}/baseline`,
      dataDir: `${home}/Library/Application Support`,
      configDir: `${home}/Library/Preferences`,
      cacheDir: `${home}/Library/Caches`,
      fontDir: `${home}/Library/Fonts`,
      desktopDir: `${home}/Desktop`,
      documentDir: `${home}/Documents`,
      downloadDir: `${home}/Downloads`,
      pictureDir: `${home}/Pictures`,
      audioDir: `${home}/Music`,
      videoDir: `${home}/Movies`,
      publicDir: `${home}/Public`,
      templateDir: `${home}/Templates`,
      runtimeDir: tjs.tmpDir,
      executableDir: exeDir,
      resourceDir: exeDir,
    };
  }
  if (platform === "linux") {
    return {
      appDataDir: `${home}/.local/share/${appId}`,
      appConfigDir: `${home}/.config/${appId}`,
      appCacheDir: `${home}/.cache/${appId}`,
      appLocalDataDir: `${home}/.local/share/${appId}`,
      appLogDir: `${home}/.local/state/${appId}/log`,
      baselineDir: `${home}/.local/share/${appId}/baseline`,
      dataDir: `${home}/.local/share`,
      configDir: `${home}/.config`,
      cacheDir: `${home}/.cache`,
      fontDir: `${home}/.fonts`,
      desktopDir: `${home}/Desktop`,
      documentDir: `${home}/Documents`,
      downloadDir: `${home}/Downloads`,
      pictureDir: `${home}/Pictures`,
      audioDir: `${home}/Music`,
      videoDir: `${home}/Videos`,
      publicDir: `${home}/Public`,
      templateDir: `${home}/Templates`,
      runtimeDir: tjs.tmpDir,
      executableDir: exeDir,
      resourceDir: exeDir,
    };
  }
  return {
    appDataDir: `${appdata()}\\${appId}`,
    appConfigDir: `${appdata()}\\${appId}`,
    appCacheDir: `${localAppdata()}\\${appId}\\Cache`,
    appLocalDataDir: `${localAppdata()}\\${appId}`,
    appLogDir: `${localAppdata()}\\${appId}\\Logs`,
    baselineDir: `${appdata()}\\${appId}\\baseline`,
    dataDir: appdata(),
    configDir: appdata(),
    cacheDir: localAppdata(),
    fontDir: `${windir()}\\Fonts`,
    desktopDir: `${home}\\Desktop`,
    documentDir: `${home}\\Documents`,
    downloadDir: `${home}\\Downloads`,
    pictureDir: `${home}\\Pictures`,
    audioDir: `${home}\\Music`,
    videoDir: `${home}\\Videos`,
    publicDir: `${home}\\Public`,
    templateDir: `${home}\\Templates`,
    runtimeDir: tjs.tmpDir,
    executableDir: exeDir,
    resourceDir: exeDir,
  };
}

function appdata(): string {
  return (
    (globalThis as { process?: { env?: { APPDATA?: string } } }).process?.env
      ?.APPDATA ?? `${tjs.homeDir}\\AppData\\Roaming`
  );
}

function localAppdata(): string {
  return (
    (globalThis as { process?: { env?: { LOCALAPPDATA?: string } } }).process
      ?.env?.LOCALAPPDATA ?? `${tjs.homeDir}\\AppData\\Local`
  );
}

function windir(): string {
  return (
    (globalThis as { process?: { env?: { WINDIR?: string } } }).process?.env
      ?.WINDIR ?? "C:\\Windows"
  );
}

export function pathPlugin(options: PathPluginOptions = {}): Plugin {
  const appId = options.appId ?? "com.ztron.app";
  const cmds = [
    "join",
    "resolve",
    "normalize",
    "is_absolute",
    "basename",
    "dirname",
    "extname",
    "sep",
    "home_dir",
    "temp_dir",
    "cwd",
    "app_data_dir",
    "app_config_dir",
    "app_cache_dir",
    "app_local_data_dir",
    "app_log_dir",
    "baseline_dir",
    "data_dir",
    "config_dir",
    "cache_dir",
    "font_dir",
    "desktop_dir",
    "document_dir",
    "download_dir",
    "picture_dir",
    "audio_dir",
    "video_dir",
    "public_dir",
    "template_dir",
    "runtime_dir",
    "executable_dir",
    "resource_dir",
  ] as const;

  const d = dirs(platform(), appId);
  const commandFor = (key: keyof typeof d) => async () => d[key];

  return {
    name: "path",
    commands: {
      join: async (args) =>
        (await path()).join(...((args as { parts?: string[] }).parts ?? [])),
      resolve: async (args) =>
        (await path()).resolve((args as { path: string }).path),
      normalize: async (args) =>
        (await path()).normalize((args as { path: string }).path),
      is_absolute: async (args) =>
        (await path()).isAbsolute((args as { path: string }).path),
      basename: async (args) =>
        (await path()).basename(
          (args as { path: string; ext?: string }).path,
          (args as { ext?: string }).ext,
        ),
      dirname: async (args) =>
        (await path()).dirname((args as { path: string }).path),
      extname: async (args) =>
        (await path()).extname((args as { path: string }).path),
      sep: async () => (await path()).sep,
      home_dir: async () => tjs.homeDir,
      temp_dir: async () => tjs.tmpDir,
      cwd: async () => tjs.cwd,
      app_data_dir: commandFor("appDataDir"),
      app_config_dir: commandFor("appConfigDir"),
      app_cache_dir: commandFor("appCacheDir"),
      app_local_data_dir: commandFor("appLocalDataDir"),
      app_log_dir: commandFor("appLogDir"),
      baseline_dir: commandFor("baselineDir"),
      data_dir: commandFor("dataDir"),
      config_dir: commandFor("configDir"),
      cache_dir: commandFor("cacheDir"),
      font_dir: commandFor("fontDir"),
      desktop_dir: commandFor("desktopDir"),
      document_dir: commandFor("documentDir"),
      download_dir: commandFor("downloadDir"),
      picture_dir: commandFor("pictureDir"),
      audio_dir: commandFor("audioDir"),
      video_dir: commandFor("videoDir"),
      public_dir: commandFor("publicDir"),
      template_dir: commandFor("templateDir"),
      runtime_dir: commandFor("runtimeDir"),
      executable_dir: commandFor("executableDir"),
      resource_dir: commandFor("resourceDir"),
    },
    permissions: cmds.map((c) => ({
      identifier: `path:allow-${c.replace(/_/g, "-")}`,
      commands: [`plugin:path|${c}`],
    })),
    permissionSets: [
      {
        name: "path:default",
        description: "All path utilities (pure string operations, no scope).",
        permissions: cmds.map((c) => `path:allow-${c.replace(/_/g, "-")}`),
      },
    ],
  };
}
