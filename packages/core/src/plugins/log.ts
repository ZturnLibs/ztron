/**
 * `plugin:log|*` — structured logging (trace/debug/info/warn/error).
 * Translated from Tauri's `tauri-plugin-log`.
 */
import type { Plugin } from "../plugin.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

export interface LogPluginOptions {
  /** Minimum level to emit (default: info). */
  level?: LogLevel;
}

export function logPlugin(options: LogPluginOptions = {}): Plugin {
  const minLevel = LEVEL_PRIORITY[options.level ?? "info"];

  function log(
    level: LogLevel,
    message: string,
    attrs?: Record<string, unknown>,
  ): void {
    if (LEVEL_PRIORITY[level] < minLevel) return;
    const ts = new Date().toISOString();
    const prefix = `[${ts}] [${level.toUpperCase()}]`;
    const suffix = attrs ? " " + JSON.stringify(attrs) : "";
    const line = `${prefix} ${message}${suffix}`;
    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn?.(line) ?? console.log(line);
    } else {
      console.log(line);
    }
  }

  return {
    name: "log",
    commands: {
      log(args) {
        const { level, message, attrs } = args as {
          level: LogLevel;
          message: string;
          attrs?: Record<string, unknown>;
        };
        log(level, message, attrs);
      },
      trace(args) {
        log("trace", (args as { message: string }).message);
      },
      debug(args) {
        log("debug", (args as { message: string }).message);
      },
      info(args) {
        log("info", (args as { message: string }).message);
      },
      warn(args) {
        log("warn", (args as { message: string }).message);
      },
      error(args) {
        log("error", (args as { message: string }).message);
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
        ],
      },
    ],
    permissionSets: [{ name: "log:default", permissions: ["log:default"] }],
  };
}
