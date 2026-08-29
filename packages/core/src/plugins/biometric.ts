/**
 * `plugin:biometric|*` — upstream command surface ported for parity
 * (GAP E-series). The plugin is MOBILE-ONLY upstream (ML Kit / VisionKit /
 * CoreMotion / NFC); on desktop runtimes every command fails closed with a
 * PluginUnavailable error so callers get a deterministic, documented
 * rejection instead of a silent stub. Revisit when a mobile host lands
 * (user-provided environment).
 */
import type { Plugin } from "../plugin.js";
import { unavailable } from "./barcode-scanner.js";

export { PluginUnavailable, unavailable } from "./barcode-scanner.js";

export interface BiometricPluginOptions {
  /** Reserved for the future mobile host bridge. */
  bridge?: unknown;
}

export function biometricPlugin(_options: BiometricPluginOptions = {}): Plugin {
  return {
    name: "biometric",
    commands: {
      async authenticate(args) {
        throw unavailable("biometric", "authenticate");
      },
      async status(args) {
        throw unavailable("biometric", "status");
      },
    },
    permissions: [
      { identifier: "biometric:allow-authenticate", commands: ["plugin:biometric|authenticate"] },
      { identifier: "biometric:allow-status", commands: ["plugin:biometric|status"] },
    ],
    permissionSets: [
      {
        name: "biometric:default",
        description: "Command surface parity; fails closed off-platform.",
        permissions: [
          "biometric:allow-authenticate",
          "biometric:allow-status"
        ],
      },
    ],
  };
}
