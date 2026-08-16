/**
 * `plugin:log|*` — structured logging (trace/debug/info/warn/error).
 * Translated from Tauri's `tauri-plugin-log`: multiple targets (stdout /
 * stderr / file / webview), a min-level filter and file rotation
 * (`keepAll` timestamped backups / `keepOne` single `.old` backup).
 */
import type { Plugin } from "../plugin.js";
import { platformDirs, detectPlatform } from "./path.js";
import { formatCallback } from "../ipc/formatCallback.js";

/** Minimal app surface the plugin needs (avoids a circular App import). */
interface LogApp {
  getWebview(label: string): { eval(js: string): void } | undefined;
}

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";
export type LogTarget = "stdout" | "stderr" | "file" | "webview";
export type RotationStrategy = "keepAll" | "keepOne";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/** Directory part of a path that may use either separator. */
function dirName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? "." : p.slice(0, i);
}

export interface LogPluginOptions {
  /** Minimum level to emit (default: info). */
  level?: LogLevel;
  /**
   * Where each record goes (default: `["stdout"]`). In txiki.js
   * `console.log` writes to stdout and `console.error` to stderr, so the
   * stdout/stderr targets map naturally. `file` appends to
   * `<logDir>/<fileName>` (rotating); `webview` re-emits every record as a
   * `plugin:log|log` event so frontends can `attachConsole()`.
   */
  targets?: LogTarget[];
  /** Explicit directory for the file target. Default: the platform log dir
   * (macOS `~/Library/Logs/<identifier>`), matching `plugin:path|app_log_dir`. */
  logDir?: string;
  /** Log file name. Default: `<identifier>.log` (Tauri LogDir semantics). */
  fileName?: string;
  /** What happens to the current file when it exceeds `maxFileSize`
   * (default: keepAll). */
  rotationStrategy?: RotationStrategy;
  /** File rotation threshold in bytes (default: 100_000). */
  maxFileSize?: number;
}

export function logPlugin(options: LogPluginOptions = {}): Plugin {
  const minLevel = LEVEL_PRIORITY[options.level ?? "info"];
  const targets = options.targets ?? ["stdout"];
  const strategy = options.rotationStrategy ?? "keepAll";
  const maxFileSize = options.maxFileSize ?? 100_000;

  let filePath = ""; // resolved in setup()
  let dirEnsured = false;
  /** Current file contents (lazily seeded from disk on first write). */
  let buffer: string | null = null;
  /** Serializes read-modify-write appends (tjs has no O_APPEND). */
  let queue: Promise<void> = Promise.resolve();
  /** Webview-target listeners: `plugin:log|__listener` registry (the
   * `addPluginListener` contract — Tauri plugins bypass named events, whose
   * names cannot contain `|`). */
  const webviewListeners = new Map<string, { label: string; callbackId: number }>();
  let appRef: LogApp | undefined;

  function deliverToWebviews(payload: unknown): void {
    for (const [key, l] of webviewListeners) {
      const wv = appRef?.getWebview(l.label);
      if (!wv) {
        webviewListeners.delete(key);
        continue;
      }
      wv.eval(formatCallback(l.callbackId, payload));
    }
  }

  async function appendToFile(line: string): Promise<void> {
    if (buffer === null) {
      try {
        buffer = new TextDecoder().decode(await tjs.readFile(filePath));
      } catch {
        buffer = ""; // no previous file
      }
    }
    if (!dirEnsured) {
      await tjs.makeDir(dirName(filePath), { recursive: true });
      dirEnsured = true;
    }
    // Rotate BEFORE appending once the current file is at capacity
    // (tauri-plugin-log semantics: rotate when size exceeds max_file_size).
    if (new TextEncoder().encode(buffer).length >= maxFileSize) {
      const backup =
        strategy === "keepOne"
          ? filePath + ".old"
          : `${filePath}.${new Date().toISOString().replace(/[:.]/g, "-")}`;
      try {
        await tjs.remove(backup); // keepOne replaces; keepAll never hits this
      } catch {
        /* no previous backup */
      }
      try {
        await tjs.rename(filePath, backup);
      } catch {
        /* no current file yet */
      }
      buffer = "";
    }
    buffer += line + "\n";
    await tjs.writeFile(filePath, buffer);
  }

  function log0(
    level: LogLevel,
    message: string,
    attrs?: Record<string, unknown>,
  ): void {
    if (LEVEL_PRIORITY[level] < minLevel) return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    const suffix = attrs ? " " + JSON.stringify(attrs) : "";
    const line = `${prefix} ${message}${suffix}`;
    for (const t of targets) {
      if (t === "stdout") {
        if (level === "error") {
          console.error(line);
        } else if (level === "warn") {
          console.warn?.(line) ?? console.log(line);
        } else {
          console.log(line);
        }
      } else if (t === "stderr") {
        console.error(line);
      } else if (t === "file") {
        queue = queue
          .then(() => appendToFile(line))
          .catch((e) =>
            console.error("[log] file target failed:", String(e ?? e)),
          );
      } else if (t === "webview") {
        // Same contract as tauri-plugin-log's Webview target: records are
        // pushed to `addPluginListener('log', 'log', …)` subscribers (the
        // `plugin:log|__listener` registry), not through named events.
        deliverToWebviews({ message: line });
      }
    }
  }

  return {
    name: "log",
    commands: {
      log(args, ctx) {
        const { level, message, attrs } = args as {
          level: LogLevel;
          message: string;
          attrs?: Record<string, unknown>;
        };
        if (ctx) appRef = ctx.app;
        log0(level, message, attrs);
      },
      trace(args, ctx) {
        if (ctx) appRef = ctx.app;
        log0("trace", (args as { message: string }).message);
      },
      debug(args, ctx) {
        if (ctx) appRef = ctx.app;
        log0("debug", (args as { message: string }).message);
      },
      info(args, ctx) {
        if (ctx) appRef = ctx.app;
        log0("info", (args as { message: string }).message);
      },
      warn(args, ctx) {
        if (ctx) appRef = ctx.app;
        log0("warn", (args as { message: string }).message);
      },
      error(args, ctx) {
        if (ctx) appRef = ctx.app;
        log0("error", (args as { message: string }).message);
      },
      "__listener": (args, ctx) => {
        // addPluginListener('log', <event>, cb) registration.
        const { event, handler } = args as { event: string; handler: number };
        appRef = ctx.app;
        webviewListeners.set(`${ctx.label}:${event}:${handler}`, {
          label: ctx.label,
          callbackId: handler,
        });
      },
      "__unlistener": (args, ctx) => {
        const { event, handler } = args as { event: string; handler: number };
        webviewListeners.delete(`${ctx.label}:${event}:${handler}`);
      },
    },
    permissions: [
      {
        identifier: "log:default",
        commands: [
          "plugin:log|log",
          "plugin:log|trace",
          "plugin:log|debug",
          "plugin:log|info",
          "plugin:log|warn",
          "plugin:log|error",
          "plugin:log|__listener",
          "plugin:log|__unlistener",
        ],
      },
    ],
    permissionSets: [{ name: "log:default", permissions: ["log:default"] }],
    setup(app) {
      // Resolve the file-target path the same way plugin:path|app_log_dir
      // reports it, so frontends can compute the exact same location.
      const appId = app.config.identifier || "com.ztron.app";
      const dir =
        options.logDir ?? platformDirs(detectPlatform(), appId).appLogDir;
      filePath = `${dir}/${options.fileName ?? `${appId}.log`}`;
    },
  };
}
