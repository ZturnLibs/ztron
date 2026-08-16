/** Log API — structured logging, mirrors `plugin:log|*`. */
import { invoke, addPluginListener } from "./core.js";
import type { UnlistenFn } from "./event.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export function log(level: LogLevel, message: string): Promise<void> {
  return invoke<void>("plugin:log|log", { level, message });
}
export const trace = (m: string) => log("trace", m);
export const debug = (m: string) => log("debug", m);
export const info = (m: string) => log("info", m);
export const warn = (m: string) => log("warn", m);
export const error = (m: string) => log("error", m);

export const logger = { log, trace, debug, info, warn, error };

export interface AttachConsoleOptions {
  /** Custom sink for each record (default: `console.log`). */
  logger?: (message: string) => void;
}

/**
 * Mirrors `@tauri-apps/plugin-log`'s `attachConsole`: subscribes to the
 * records the backend log plugin pushes for every entry when running with
 * the `webview` target (via the `addPluginListener('log','log',…)`
 * contract). Returns an unlisten function.
 */
export function attachConsole(
  options: AttachConsoleOptions = {},
): Promise<UnlistenFn> {
  const sink = options.logger ?? ((m: string) => console.log(m));
  return addPluginListener<{ message: string }>("log", "log", (record) => {
    sink(record.message);
  });
}
