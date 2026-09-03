/**
 * `plugin:localhost|*` — serves the configured directory over
 * `http://localhost:<port>` (upstream `tauri-plugin-localhost` parity), for
 * apps that prefer an http origin over the ztron:// asset scheme.
 *
 * Powered by `tjs.serve` (fetch-style handler). File access is gated by a
 * PathScope rooted at the served directory; content types cover common web
 * assets with an `application/octet-stream` fallback.
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";

/* Minimal structural types for the fetch-style handler — CI (lib ES2022,
   no DOM) has no Request/Response globals; txiki provides compatible
   runtime objects. */
interface FetchRequestLike {
  url: string;
}
interface FetchResponseLike {
  status: number;
}

interface ServeServer {
  readonly port: number;
  close(): Promise<void> | void;
}

interface ServeLike {
  serve(options: {
    fetch: (request: FetchRequestLike) => FetchResponseLike | Promise<FetchResponseLike>;
    port?: number;
  }): ServeServer;
}

const MIME: Record<string, string> = {
  html: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  wasm: "application/wasm",
  txt: "text/plain; charset=utf-8",
};

/** Response constructor via the runtime global (typed loosely for CI). */
function globalResponse(): {
  new (body?: unknown, init?: { status?: number; headers?: Record<string, string> }): FetchResponseLike;
} {
  const g = globalThis as unknown as {
    Response: new (body?: unknown, init?: { status?: number; headers?: Record<string, string> }) => FetchResponseLike;
  };
  return g.Response;
}

function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

export interface LocalhostPluginOptions {
  /** Directory served at the origin (default: cwd). */
  dir?: string;
  /** Fixed port (default: ephemeral). */
  port?: number;
  /** Extra path scope entries; the served dir is always the anchor. */
  scope?: PathScopeConfig;
}

export function localhostPlugin(options: LocalhostPluginOptions = {}): Plugin {
  const root = (options.dir ?? tjs.cwd).replace(/\/+$/, "");
  const scope = new PathScope(
    options.scope ?? { allow: [`${root}/**`, root] },
  );
  let server: ServeServer | null = null;
  let boundPort: number | null = null;

  function resolveFile(urlPath: string): string | null {
    let rel = decodeURIComponent(new URL(urlPath).pathname);
    rel = rel.replace(/\/+$/, "");
    if (rel === "" || rel === "/") rel = "/index.html";
    const abs = `${root}${rel}`;
    if (!scope.check(abs)) return null;
    if (abs.includes("/..")) return null;
    return abs;
  }

  async function handler(request: FetchRequestLike): Promise<FetchResponseLike> {
    const file = resolveFile(request.url);
    const headers = { "access-control-allow-origin": "*" };
    if (!file) {
      return new (globalResponse())("not found", {
        status: 404,
        headers,
      });
    }
    try {
      const bytes = await tjs.readFile(file);
      return new (globalResponse())(bytes, {
        status: 200,
        headers: { ...headers, "content-type": contentTypeFor(file) },
      });
    } catch {
      return new (globalResponse())("not found", { status: 404, headers });
    }
  }

  return {
    name: "localhost",
    commands: {
      async start(args) {
        const wanted = Number(
          (args as { port?: number } | undefined)?.port ??
            options.port ??
            0,
        );
        if (server) {
          return { already: true, port: boundPort, origin: `http://localhost:${boundPort}` };
        }
        const t = (globalThis as unknown as { tjs: ServeLike }).tjs;
        server = t.serve({ fetch: handler, port: wanted });
        boundPort = server.port;
        return {
          already: false,
          port: boundPort,
          origin: `http://localhost:${boundPort}`,
        };
      },
      async stop() {
        if (!server) return { stopped: false };
        const srv = server;
        server = null;
        boundPort = null;
        await srv.close();
        return { stopped: true };
      },
      async status() {
        return { running: server != null, port: boundPort };
      },
    },
    permissions: [
      {
        identifier: "localhost:allow-start",
        commands: ["plugin:localhost|start"],
      },
      {
        identifier: "localhost:allow-stop",
        commands: ["plugin:localhost|stop"],
      },
      {
        identifier: "localhost:allow-status",
        commands: ["plugin:localhost|status"],
      },
    ],
    permissionSets: [
      {
        name: "localhost:default",
        description: "Start/stop/status of the localhost asset origin.",
        permissions: [
          "localhost:allow-start",
          "localhost:allow-stop",
          "localhost:allow-status",
        ],
      },
    ],
  };
}
