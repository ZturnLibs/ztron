/**
 * geolocation API — upstream command-surface parity (GAP E-series).
 * Commands fail closed with PluginUnavailable on desktop runtimes.
 */
import { invoke } from "./core.js";

export function getCurrentPosition(args?: Record<string, unknown>): Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }> {
  return invoke<{ coords: { latitude: number; longitude: number; accuracy: number } }>("plugin:geolocation|get_current_position", args ?? {});
}

export function watchPosition(args?: Record<string, unknown>): Promise<string> {
  return invoke<string>("plugin:geolocation|watch_position", args ?? {});
}

export function clearWatch(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:geolocation|clear_watch", args ?? {});
}
