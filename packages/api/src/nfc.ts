/**
 * nfc API — upstream command-surface parity (GAP E-series).
 * Commands fail closed with PluginUnavailable on desktop runtimes.
 */
import { invoke } from "./core.js";

export function nfcScan(args?: Record<string, unknown>): Promise<string> {
  return invoke<string>("plugin:nfc|scan", args ?? {});
}

export function nfcWrite(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:nfc|write", args ?? {});
}

export function nfcStop(args?: Record<string, unknown>): Promise<void> {
  return invoke<void>("plugin:nfc|stop", args ?? {});
}
