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

/** Per-directory overrides for the app_* path APIs (tauri appDirectoriesOverride). */
export interface AppDirectoryOverrides {
  /** Overrides the app config directory. */
  config?: string;
  /** Overrides the app data directory. */
  data?: string;
  /** Overrides the app local data directory. */
  localData?: string;
  /** Overrides the app cache directory. */
  cache?: string;
  /** Overrides the app log directory. */
  log?: string;
}

/** A single portable root (all app dirs) or per-directory overrides. */
export type AppDirectoriesOverride = string | AppDirectoryOverrides;

/* Allowed leading $VARIABLEs (tauri APP_DIRECTORIES_OVERRIDE_VARIABLES
 * verbatim): $RESOURCE is read-only in bundles, $EXE/$FONT/$RUNTIME/
 * $TEMPLATE unavailable everywhere, $APP* self-referential. $LOCALDATA
 * maps to the platform data dir (ztron conflates local/app data there). */
const OVERRIDE_BASE_DIRS: Record<string, string> = {
  $AUDIO: "audioDir",
  $CACHE: "cacheDir",
  $CONFIG: "configDir",
  $DATA: "dataDir",
  $LOCALDATA: "dataDir",
  $DESKTOP: "desktopDir",
  $DOCUMENT: "documentDir",
  $DOWNLOAD: "downloadDir",
  $HOME: "homeDir",
  $PICTURE: "pictureDir",
  $PUBLIC: "publicDir",
  $TEMP: "runtimeDir",
  $VIDEO: "videoDir",
} as Record<string, string>; /* "homeDir" is special-cased below */

/** Resolves a $VARIABLE-prefixed override path against the base dirs. */
function resolveOverridePath(base: PlatformDirs, p: string): string {
  if (!p.startsWith("$")) return p;
  const first = p.split(/[\\/]/)[0] ?? "";
  const varName = first.slice(1);
  if (!OVERRIDE_BASE_DIRS[first] && first !== "$HOME") {
    throw new Error(
      `appDirectoriesOverride: "${p}" starts with unsupported base ` +
        `directory variable ${first}, expected one of ` +
        Object.keys(OVERRIDE_BASE_DIRS).join(", "),
    );
  }
  const root = first === "$HOME" ? tjs.homeDir : base[OVERRIDE_BASE_DIRS[first] as keyof PlatformDirs];
  return root + p.slice(first.length);
}

/** Applies {@linkcode AppDirectoriesOverride} to the app_* entries: a root
 *  maps config/data/localData to itself, cache to `<root>/caches` and log to
 *  `<root>/logs`; the per-dir form only touches listed entries. */
export function resolveAppDirs(
  base: PlatformDirs,
  override: AppDirectoriesOverride | undefined,
): PlatformDirs {
  if (override === undefined || override === null || override === "")
    return base;
  const sep = base.appCacheDir.includes("\\") ? "\\" : "/";
  const pick = (p: string | undefined): string | undefined =>
    p === undefined ? undefined : resolveOverridePath(base, p);
  let o: Partial<Pick<PlatformDirs,
    "appDataDir" | "appConfigDir" | "appCacheDir" | "appLocalDataDir" | "appLogDir">>;
  if (typeof override === "string") {
    const root = resolveOverridePath(base, override);
    o = {
      appDataDir: root,
      appConfigDir: root,
      appLocalDataDir: root,
      appCacheDir: `${root}${sep}caches`,
      appLogDir: `${root}${sep}logs`,
    };
  } else {
    o = {
      appDataDir: pick(override.data),
      appConfigDir: pick(override.config),
      appLocalDataDir: pick(override.localData),
      appCacheDir: pick(override.cache),
      appLogDir: pick(override.log),
    };
  }
  const out = { ...base };
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined) (out as Record<string, string>)[k] = v;
  }
  return out;
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

/** Platform directory conventions (all paths; separators per-platform). */
export interface PlatformDirs {
  appDataDir: string;
  appConfigDir: string;
  appCacheDir: string;
  appLocalDataDir: string;
  appLogDir: string;
  baselineDir: string;
  dataDir: string;
  configDir: string;
  cacheDir: string;
  fontDir: string;
  desktopDir: string;
  documentDir: string;
  downloadDir: string;
  pictureDir: string;
  audioDir: string;
  videoDir: string;
  publicDir: string;
  templateDir: string;
  runtimeDir: string;
  executableDir: string;
  resourceDir: string;
}

/** Platform directory conventions (macOS primary; Linux/Windows best-effort).
 * Exported for sibling plugins (e.g. the log plugin's file target resolves
 * `appLogDir` the same way the path plugin reports it). */
export function platformDirs(
  platform: "macos" | "linux" | "windows",
  appId: string,
): PlatformDirs {
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

/** Best-effort platform detection from `navigator.platform`.
 * Exported for sibling plugins that resolve platform directories. */
export function detectPlatform(): "macos" | "linux" | "windows" {
  return platform();
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

  const d = platformDirs(platform(), appId);
  /* app_* dirs honor `app > appDirectoriesOverride` at command time (the
   * config can change through AppBuilder.fromConfig after plugin creation,
   * so resolution stays lazy). */
  const commandFor = (key: keyof typeof d) => async (
    _args: unknown,
    ctx?: { app?: { config?: { appDirectoriesOverride?: AppDirectoriesOverride } } },
  ) => {
    const ov = ctx?.app?.config?.appDirectoriesOverride;
    if (ov === undefined || ov === null || ov === "") return d[key];
    return resolveAppDirs(d, ov)[key];
  };

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
