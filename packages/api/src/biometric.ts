/**
 * biometric API — upstream command-surface parity (GAP E-series).
 * Commands fail closed with PluginUnavailable on desktop runtimes.
 */
import { invoke } from "./core.js";

export function authenticate(args?: Record<string, unknown>): Promise<{ status: string }> {
  return invoke<{ status: string }>("plugin:biometric|authenticate", args ?? {});
}

export function biometricStatus(args?: Record<string, unknown>): Promise<{ available: boolean }> {
  return invoke<{ available: boolean }>("plugin:biometric|status", args ?? {});
}
