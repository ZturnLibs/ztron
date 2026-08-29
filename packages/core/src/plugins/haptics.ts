/**
 * `plugin:haptics|*` — upstream command surface ported for parity
 * (GAP E-series). The plugin is MOBILE-ONLY upstream (ML Kit / VisionKit /
 * CoreMotion / NFC); on desktop runtimes every command fails closed with a
 * PluginUnavailable error so callers get a deterministic, documented
 * rejection instead of a silent stub. Revisit when a mobile host lands
 * (user-provided environment).
 */
import type { Plugin } from "../plugin.js";
import { unavailable } from "./barcode-scanner.js";

export { PluginUnavailable, unavailable } from "./barcode-scanner.js";

export interface HapticsPluginOptions {
  /** Reserved for the future mobile host bridge. */
  bridge?: unknown;
}

export function hapticsPlugin(_options: HapticsPluginOptions = {}): Plugin {
  return {
    name: "haptics",
    commands: {
      async impact_occurred(args) {
        throw unavailable("haptics", "impact_occurred");
      },
      async notification_occurred(args) {
        throw unavailable("haptics", "notification_occurred");
      },
      async selection_changed(args) {
        throw unavailable("haptics", "selection_changed");
      },
    },
    permissions: [
      { identifier: "haptics:allow-impact_occurred", commands: ["plugin:haptics|impact_occurred"] },
      { identifier: "haptics:allow-notification_occurred", commands: ["plugin:haptics|notification_occurred"] },
      { identifier: "haptics:allow-selection_changed", commands: ["plugin:haptics|selection_changed"] },
    ],
    permissionSets: [
      {
        name: "haptics:default",
        description: "Command surface parity; fails closed off-platform.",
        permissions: [
          "haptics:allow-impact_occurred",
          "haptics:allow-notification_occurred",
          "haptics:allow-selection_changed"
        ],
      },
    ],
  };
}
