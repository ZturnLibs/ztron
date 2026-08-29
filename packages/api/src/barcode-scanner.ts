/**
 * barcode-scanner API — upstream command-surface parity (GAP E-series).
 * Commands fail closed with PluginUnavailable on desktop runtimes.
 */
import { invoke } from "./core.js";

export function scan(args?: Record<string, unknown>): Promise<string> {
  return invoke<string>("plugin:barcode-scanner|scan", args ?? {});
}
