/**
 * `plugin:nfc|*` — upstream command surface ported for parity
 * (GAP E-series). The plugin is MOBILE-ONLY upstream (ML Kit / VisionKit /
 * CoreMotion / NFC); on desktop runtimes every command fails closed with a
 * PluginUnavailable error so callers get a deterministic, documented
 * rejection instead of a silent stub. Revisit when a mobile host lands
 * (user-provided environment).
 */
import type { Plugin } from "../plugin.js";
import { unavailable } from "./barcode-scanner.js";

export { PluginUnavailable, unavailable } from "./barcode-scanner.js";

export interface NfcPluginOptions {
  /** Reserved for the future mobile host bridge. */
  bridge?: unknown;
}

export function nfcPlugin(_options: NfcPluginOptions = {}): Plugin {
  return {
    name: "nfc",
    commands: {
      async scan(args) {
        throw unavailable("nfc", "scan");
      },
      async write(args) {
        throw unavailable("nfc", "write");
      },
      async stop(args) {
        throw unavailable("nfc", "stop");
      },
    },
    permissions: [
      { identifier: "nfc:allow-scan", commands: ["plugin:nfc|scan"] },
      { identifier: "nfc:allow-write", commands: ["plugin:nfc|write"] },
      { identifier: "nfc:allow-stop", commands: ["plugin:nfc|stop"] },
    ],
    permissionSets: [
      {
        name: "nfc:default",
        description: "Command surface parity; fails closed off-platform.",
        permissions: [
          "nfc:allow-scan",
          "nfc:allow-write",
          "nfc:allow-stop"
        ],
      },
    ],
  };
}
