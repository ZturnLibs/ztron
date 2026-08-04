/**
 * Plugin base — translated from Tauri's `tauri-plugin` crate.
 *
 * A plugin bundles commands (and later permissions) registered under a
 * `plugin:<name>` namespace, mirroring how Tauri plugins ship Rust code
 * + JS API + permission manifests.
 */
import type { App } from "./app.js";
import type { CommandHandlers } from "./commands/index.js";

export interface Plugin {
  name: string;
  version?: string;
  /** Commands registered as `plugin:<name>|<cmd>`. */
  commands?: CommandHandlers;
  /** Capability identifiers this plugin can grant (reserved for ACL). */
  permissions?: string[];
  /** Lifecycle hook, called after the app is built. */
  setup?(app: App): void | Promise<void>;
}

export class PluginManager {
  #plugins = new Map<string, Plugin>();

  register(plugin: Plugin): void {
    if (this.#plugins.has(plugin.name)) {
      throw new Error(`plugin "${plugin.name}" is already registered`);
    }
    this.#plugins.set(plugin.name, plugin);
  }

  get(name: string): Plugin | undefined {
    return this.#plugins.get(name);
  }

  list(): Plugin[] {
    return [...this.#plugins.values()];
  }
}
