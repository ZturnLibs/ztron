/** Log API — structured logging, mirrors `plugin:log|*`. */
import { invoke } from "./core.js";

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
