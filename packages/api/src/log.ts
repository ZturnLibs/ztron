/** Log API — structured logging, mirrors `plugin:log|*`. */
import { invoke, addPluginListener } from "./core.js";
import type { UnlistenFn } from "./event.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/** A client-side logger sink (upstream attachLogger shape). */
export type LogSink = (record: {
  level: LogLevel;
  payload: string;
}) => void;

const sinks = new Set<LogSink>();

/**
 * Registers a client-side logger sink receiving every `log*` call made from
 * this page (upstream attachLogger parity for the webview target; backend
 * targets keep their own sinks).
 */
export function attachLogger(sink: LogSink): () => void {
  sinks.add(sink);
  return () => detachLogger(sink);
}

/** Removes a previously attached sink. */
export function detachLogger(sink: LogSink): void {
  sinks.delete(sink);
}

export function log(level: LogLevel, message: string): Promise<void> {
  for (const sink of sinks) {
    try {
      sink({ level, payload: message });
    } catch {
      /* user sink errors never break logging */
    }
  }
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
