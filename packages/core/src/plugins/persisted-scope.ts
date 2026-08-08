/**
 * `plugin:persisted-scope|*` — persist the filesystem scope allowlist so
 * user-granted paths survive restarts.
 *
 * Translated from Tauri's `tauri-plugin-persisted-scope`. Creates a
 * {@link PathScope} that loads extra allow entries from a JSON file on
 * startup, and exposes a `save` command that writes the merged allowlist
 * back. Pair it with `fsPlugin({ scope: psPlugin.scope })`.
 */
import type { Plugin } from "../plugin.js";
import { PathScope, type PathScopeConfig } from "../scope.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface PersistedScopePluginOptions {
  /** JSON file holding the persisted `{ allow: string[] }`. */
  file: string;
  /** The base scope config (always allowed, cannot be removed). */
  scope: PathScopeConfig;
}

export function persistedScopePlugin(
  options: PersistedScopePluginOptions,
): Plugin & { scope: PathScope } {
  const scope = new PathScope(options.scope);

  void (async () => {
    try {
      const raw = await tjs.readFile(options.file);
      const parsed = JSON.parse(dec.decode(raw)) as { allow?: unknown };
      if (Array.isArray(parsed.allow)) {
        for (const entry of parsed.allow) {
          if (typeof entry === "string") scope.addAllow(entry);
        }
      }
    } catch {
      /* no persisted scope yet */
    }
  })();

  const plugin: Plugin = {
    name: "persisted-scope",
    commands: {
      async get() {
        return { allow: scope.serializeAllow() };
      },
      async save() {
        await tjs.writeFile(
          options.file,
          enc.encode(JSON.stringify({ allow: scope.serializeAllow() })),
        );
        return { saved: true };
      },
    },
    permissions: [
      {
        identifier: "persisted-scope:allow-get",
        commands: ["plugin:persisted-scope|get"],
      },
      {
        identifier: "persisted-scope:allow-save",
        commands: ["plugin:persisted-scope|save"],
      },
    ],
    permissionSets: [
      {
        name: "persisted-scope:default",
        description: "Allows reading/saving the merged filesystem scope.",
        permissions: [
          "persisted-scope:allow-get",
          "persisted-scope:allow-save",
        ],
      },
    ],
  };

  return Object.assign(plugin, { scope });
}
