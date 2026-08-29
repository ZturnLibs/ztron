/**
 * `plugin:geolocation|*` — upstream command surface ported for parity
 * (GAP E-series). The plugin is MOBILE-ONLY upstream (ML Kit / VisionKit /
 * CoreMotion / NFC); on desktop runtimes every command fails closed with a
 * PluginUnavailable error so callers get a deterministic, documented
 * rejection instead of a silent stub. Revisit when a mobile host lands
 * (user-provided environment).
 */
import type { Plugin } from "../plugin.js";
import { unavailable } from "./barcode-scanner.js";

export { PluginUnavailable, unavailable } from "./barcode-scanner.js";

export interface GeolocationPluginOptions {
  /** Reserved for the future mobile host bridge. */
  bridge?: unknown;
}

export function geolocationPlugin(_options: GeolocationPluginOptions = {}): Plugin {
  return {
    name: "geolocation",
    commands: {
      async get_current_position(args) {
        throw unavailable("geolocation", "get_current_position");
      },
      async watch_position(args) {
        throw unavailable("geolocation", "watch_position");
      },
      async clear_watch(args) {
        throw unavailable("geolocation", "clear_watch");
      },
    },
    permissions: [
      { identifier: "geolocation:allow-get_current_position", commands: ["plugin:geolocation|get_current_position"] },
      { identifier: "geolocation:allow-watch_position", commands: ["plugin:geolocation|watch_position"] },
      { identifier: "geolocation:allow-clear_watch", commands: ["plugin:geolocation|clear_watch"] },
    ],
    permissionSets: [
      {
        name: "geolocation:default",
        description: "Command surface parity; fails closed off-platform.",
        permissions: [
          "geolocation:allow-get_current_position",
          "geolocation:allow-watch_position",
          "geolocation:allow-clear_watch"
        ],
      },
    ],
  };
}
