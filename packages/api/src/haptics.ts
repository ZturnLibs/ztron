/**
 * haptics API — upstream command-surface parity (GAP E-series).
 * Commands fail closed with PluginUnavailable on desktop runtimes.
 */
import { invoke } from "./core.js";

export function impactOccurred(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:haptics|impact_occurred", args ?? {});
}

export function notificationOccurred(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:haptics|notification_occurred", args ?? {});
}

export function selectionChanged(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:haptics|selection_changed", args ?? {});
}
