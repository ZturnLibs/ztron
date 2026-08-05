/**
 * Plugin base — translated from Tauri's `tauri-plugin` crate.
 *
 * A plugin bundles commands, ACL permissions, and lifecycle hooks under a
 * `plugin:<name>` namespace, mirroring how Tauri plugins ship Rust code +
 * JS API + permission manifests.
 */
import type { App } from "./app.js";
import type { CommandHandlers } from "./commands/index.js";
import type { Permission, PermissionSet } from "./acl/types.js";

export interface Plugin {
  name: string;
  version?: string;
  /** Commands registered as `plugin:<name>|<cmd>`. */
  commands?: CommandHandlers;
  /** Permissions this plugin declares (registered into the ACL registry). */
  permissions?: Permission[];
  /** Named groups of permission identifiers (e.g. `default`). */
  permissionSets?: PermissionSet[];
  /** Default permissions applied when no capability references this plugin
   *  (v1 convenience; set to `[]` to require explicit grants). */
  defaultPermissions?: string[];
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
