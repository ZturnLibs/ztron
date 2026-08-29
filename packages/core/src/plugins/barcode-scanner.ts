/**
 * `plugin:barcode-scanner|*` — upstream command surface ported for parity
 * (GAP E-series). The plugin is MOBILE-ONLY upstream (ML Kit / VisionKit /
 * CoreMotion / NFC); on desktop runtimes every command fails closed with a
 * PluginUnavailable error so callers get a deterministic, documented
 * rejection instead of a silent stub. Revisit when a mobile host lands
 * (user-provided environment).
 */
import type { Plugin } from "../plugin.js";

export class PluginUnavailable extends Error {
  readonly plugin: string;
  readonly command: string;
  constructor(plugin: string, command: string) {
    super(
      `plugin:${plugin}|${command} is unavailable on this platform ` +
        `(mobile-only upstream surface; ported for parity)`,
    );
    this.name = "PluginUnavailable";
    this.plugin = plugin;
    this.command = command;
  }
}

export function unavailable(plugin: string, command: string): PluginUnavailable {
  return new PluginUnavailable(plugin, command);
}

export interface BarcodeScannerPluginOptions {
  /** Reserved for the future mobile host bridge. */
  bridge?: unknown;
}

export function barcodeScannerPlugin(_options: BarcodeScannerPluginOptions = {}): Plugin {
  return {
    name: "barcode-scanner",
    commands: {
      async scan(args) {
        throw unavailable("barcode-scanner", "scan");
      },
    },
    permissions: [
      { identifier: "barcode-scanner:allow-scan", commands: ["plugin:barcode-scanner|scan"] },
    ],
    permissionSets: [
      {
        name: "barcode-scanner:default",
        description: "Command surface parity; fails closed off-platform.",
        permissions: [
          "barcode-scanner:allow-scan"
        ],
      },
    ],
  };
}
