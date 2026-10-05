/**
 * `plugin:single-instance|*` — enforce a single running instance per app id.
 *
 * The primary instance binds a loopback TCP port derived from the identifier
 * (a deterministic FNV-1a hash into 20000–60000). A second instance fails to
 * bind, POSTs its `{ argv, cwd }` to that port, and exits — upstream Tauri
 * forwards the same payload over a named pipe (Windows) and never lets the
 * secondary outlive its forward. The primary emits `ztron://single-instance`
 * with the forwarded payload and focuses its window.
 *
 * argv comes from the backend's own argument vector minus argv[0]
 * (`tjs.args.slice(1)` — the same convention as the cli plugin): for a
 * packed app that is exactly the args passed to `ztron-launcher`, which
 * the Windows launcher forwards to the backend on its command line.
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
          fetch: async (req) => {
            // A secondary instance connected: adopt its payload. A GET (or
            // an unparseable body) means a pre-forwarding peer — empty argv.
            let payload: { argv: string[]; cwd: string } = { argv: [], cwd: "" };
            try {
              if (req.method === "POST") {
                const body = await req.text();
                if (body) {
                  payload = JSON.parse(body) as { argv: string[]; cwd: string };
                }
              }
            } catch {
              /* keep the empty payload */
            }
            // Bring the primary forward.
            const wv = app.getWebview("main");
            if (wv) {
              wv.eval("window.focus()");
            }
            app.emit("ztron://single-instance", payload);
            return new Response("ok");
          },
        })) as { port: number; close(): void };
        void server;
        isPrimary = true;
      } catch {
        // Port already held by another instance → this is a secondary:
        // forward our real argv/cwd to the primary, then exit like upstream.
        isPrimary = false;
        try {
          await fetch(`http://127.0.0.1:${port}/`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              argv: [...tjs.args.slice(1)],
              cwd: tjs.cwd,
            }),
          });
        } catch {
          /* primary unreachable */
        }
        tjs.exit(0);
      }
    },
  };
}
