/**
 * `plugin:single-instance|*` — enforce a single running instance per app id.
 *
 * The primary instance binds a loopback TCP port derived from the identifier
 * (a deterministic FNV-1a hash into 20000–60000). A second instance fails to
 * bind, signals the primary, and reports `is_primary === false`; the primary
 * emits `tauri://single-instance` and focuses its window.
 */
import type { Plugin } from "../plugin.js";

export interface SingleInstancePluginOptions {
  /** Reverse-domain identifier; must match `AppBuilder(..., identifier)`. */
  identifier?: string;
}

/** FNV-1a 32-bit hash → port in [20000, 60000). */
function instancePort(identifier: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < identifier.length; i += 1) {
    h ^= identifier.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return 20000 + (h % 40000);
}

export function singleInstancePlugin(
  options: SingleInstancePluginOptions = {},
): Plugin {
  const identifier = options.identifier ?? "com.ztron.app";
  const port = instancePort(identifier);
  let isPrimary = false;

  return {
    name: "single-instance",
    commands: {
      async is_primary() {
        return isPrimary;
      },
    },
    permissions: [
      {
        identifier: "single-instance:allow-is-primary",
        commands: ["plugin:single-instance|is_primary"],
      },
    ],
    permissionSets: [
      {
        name: "single-instance:default",
        description: "Query whether this is the primary instance.",
        permissions: ["single-instance:allow-is-primary"],
      },
    ],
    async setup(app) {
      try {
        const server = (await tjs.serve({
          port,
          listenIp: "127.0.0.1",
          fetch: async () => {
            // A secondary instance connected: bring the primary forward.
            const wv = app.getWebview("main");
            if (wv) {
              wv.eval("window.focus()");
            }
            app.emit("tauri://single-instance", { argv: [], cwd: "" });
            return new Response("ok");
          },
        })) as { port: number; close(): void };
        void server;
        isPrimary = true;
      } catch {
        // Port already held by another instance → this is a secondary.
        isPrimary = false;
        try {
          await fetch(`http://127.0.0.1:${port}/`);
        } catch {
          /* primary unreachable */
        }
      }
    },
  };
}
