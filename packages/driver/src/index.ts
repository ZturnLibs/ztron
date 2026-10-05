#!/usr/bin/env node
/**
 * `ztron-driver` — a W3C WebDriver intermediary for Ztron apps (GAP F7/H21).
 *
 * Mirrors upstream `tauri-driver`: an HTTP intermediary node that speaks
 * the W3C WebDriver protocol on the client side and forwards EVERYTHING to
 * a platform-native WebDriver remote (WebKitWebDriver on Linux,
 * msedgedriver on Windows), which it spawns itself on a second port. The
 * only request it inspects is new-session: client-provided
 * `tauri:options` (application + args [+ webviewOptions]) is translated
 * into the native remote's capability format (`ms:edgeOptions` /
 * `webkitgtk:browserOptions`) — the exact wire contract upstream uses, so
 * WebDriver clients written against tauri-driver work unmodified.
 *
 * macOS has no native WebDriver remote (same upstream limitation): the
 * driver fails closed at startup unless an explicit remote binary is
 * passed (nativeDriver / ZTRON_NATIVE_DRIVER — also the hook used to
 * wrap a fake remote in the proxy unit tests).
 */
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export interface DriverOptions {
  /** Client-facing port (default 4444 — upstream parity). */
  port?: number;
  /** Native remote port (default 4445 — upstream parity). */
  nativePort?: number;
  /** `--host` for the native remote (default 127.0.0.1). */
  nativeHost?: string;
  /** Explicit native remote binary; overrides the platform table. */
  nativeDriver?: string;
  /** Full argv override for the native remote (default: --port/--host). */
  nativeArgs?: string[];
  verbose?: boolean;
}

export type DriverServer = ReturnType<typeof createServer> & {
  remoteProc?: ChildProcess;
};

/** The `tauri:options` wire contract (upstream server.rs TauriOptions). */
interface TauriOptions {
  application: string;
  args?: string[];
  webviewOptions?: unknown; // windows-only passthrough
}

/** Platform remotes (upstream parity table). */
export function remoteForPlatform(): { bin: string; args: string[] } | null {
  switch (process.platform) {
    case "linux":
      return { bin: "WebKitWebDriver", args: [] };
    case "win32":
      return { bin: "msedgedriver.exe", args: [] };
    default:
      return null; // darwin: no native WebDriver remote (upstream same)
  }
}

/** `where`/`which` probe for the platform-default remote binary. */
function findOnPath(bin: string): string | null {
  const probe = process.platform === "win32"
    ? spawnSync("where", [bin], { encoding: "utf8" })
    : spawnSync("which", [bin], { encoding: "utf8" });
  if (probe.status !== 0) return null;
  const first = (probe.stdout ?? "").trim().split(/\r?\n/)[0];
  return first && existsSync(first) ? first : null;
}

/**
 * Resolves the native remote binary: explicit option / ZTRON_NATIVE_DRIVER
 * (path must exist) → PATH probe of the platform default. Throws with the
 * upstream-style guidance when unresolvable (darwin = platform parity).
 */
export function resolveNativeBinary(explicit?: string): string {
  const custom = explicit ?? process.env.ZTRON_NATIVE_DRIVER;
  if (custom) {
    if (!existsSync(custom)) {
      throw new Error(
        `can not find the supplied native driver path ${custom}. This is currently required.`,
      );
    }
    return custom;
  }
  const remote = remoteForPlatform();
  if (!remote) {
    throw new Error(
      "ztron-driver is not supported on this platform (no native WebDriver remote; upstream parity). " +
        "Pass nativeDriver / ZTRON_NATIVE_DRIVER to wrap a custom remote.",
    );
  }
  const found = findOnPath(remote.bin);
  if (!found) {
    throw new Error(
      `can not find binary ${remote.bin} in the PATH. This is currently required. ` +
        `You can also pass a custom path with --native-driver / ZTRON_NATIVE_DRIVER.`,
    );
  }
  return found;
}

/** Rust Path::with_extension("exe") parity for the app binary. */
function withExeExt(application: string): string {
  return /\.[^./\\]+$/.test(application)
    ? application.replace(/\.[^./\\]+$/, ".exe")
    : application + ".exe";
}

/** tauri:options → the native remote's capability object (upstream parity). */
export function nativeObjectFor(
  o: TauriOptions,
  platform: NodeJS.Platform,
): Record<string, unknown> | null {
  if (platform === "win32") {
    const edge: Record<string, unknown> = {
      binary: withExeExt(o.application),
      args: o.args ?? [],
    };
    if (o.webviewOptions != null) edge.webviewOptions = o.webviewOptions;
    return {
      "ms:edgeChromium": true,
      browserName: "webview2",
      "ms:edgeOptions": edge,
    };
  }
  if (platform === "linux") {
    return {
      "webkitgtk:browserOptions": { binary: o.application, args: o.args ?? [] },
    };
  }
  return null;
}

/**
 * Upstream map_capabilities: pull `tauri:options` out of alwaysMatch,
 * replace it with the native format, and mirror into legacy
 * desiredCapabilities when present.
 */
export function mapCapabilities(
  json: Record<string, unknown>,
): Record<string, unknown> {
  const caps = json.capabilities;
  let native: Record<string, unknown> | null = null;
  if (caps && typeof caps === "object") {
    const am = (caps as Record<string, unknown>).alwaysMatch;
    if (am && typeof am === "object") {
      const alwaysMatch = am as Record<string, unknown>;
      const t = alwaysMatch["tauri:options"];
      if (t && typeof t === "object") {
        native = nativeObjectFor(
          t as TauriOptions,
          process.platform,
        );
        delete alwaysMatch["tauri:options"];
        if (native) Object.assign(alwaysMatch, native);
      }
    }
  }
  if (native) {
    const desired = json.desiredCapabilities;
    if (desired && typeof desired === "object") {
      const d = desired as Record<string, unknown>;
      delete d["tauri:options"];
      Object.assign(d, native);
    }
  }
  return json;
}

/** Reads the raw request body. */
function readRaw(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

/** Waits until the native remote answers GET /status (bounded). */
async function waitReady(port: number, timeoutMs = 10000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise<boolean>((resolve) => {
      const r = httpRequest(
        { host: "127.0.0.1", port, path: "/status", method: "GET", timeout: 500 },
        () => resolve(true),
      );
      r.on("error", () => resolve(false));
      r.on("timeout", () => {
        r.destroy();
        resolve(false);
      });
      r.end();
    });
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * Starts the intermediary: spawns the native remote (upstream parity env +
 * stdout-nulled), then relays every request — session creation first gets
 * its capabilities rewritten. Resolves once both ports are live.
 */
export function startDriver(options: DriverOptions = {}): Promise<DriverServer> {
  const port = options.port ?? 4444;
  const nativePort = options.nativePort ?? 4445;
  const nativeHost = options.nativeHost ?? "127.0.0.1";
  const log = (m: string) => {
    if (options.verbose) process.stderr.write(`[ztron-driver] ${m}\n`);
  };

  const bin = resolveNativeBinary(options.nativeDriver);
  const args = options.nativeArgs ?? [
    `--port=${nativePort}`,
    `--host=${nativeHost}`,
  ];
  const remoteProc = spawn(bin, args, {
    // upstream webdriver.rs parity: automation env for the app host, stdout
    // nulled so protocol chatter can't corrupt the driver's own stdout.
    env: {
      ...process.env,
      TAURI_AUTOMATION: "true",
      TAURI_WEBVIEW_AUTOMATION: "true",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  remoteProc.on("error", (e) => log(`native remote spawn error: ${e.message}`));
  log(`spawned native remote: ${bin} ${args.join(" ")}`);

  const forward = (
    req: IncomingMessage,
    res: ServerResponse,
    body: Buffer,
  ): void => {
    const headers = { ...req.headers } as Record<string, string>;
    delete headers["host"];
    delete headers["connection"];
    // The body is re-framed below as a fixed-length buffer: an inbound
    // chunked request must not keep its transfer-encoding alongside the
    // recomputed content-length (RFC 7230 framing conflict — node's
    // parser answers 400 to the doubled framing).
    delete headers["content-length"];
    delete headers["transfer-encoding"];
    const upstream = httpRequest(
      {
        host: "127.0.0.1",
        port: nativePort,
        method: req.method,
        path: req.url ?? "/",
        headers: {
          ...headers,
          host: `127.0.0.1:${nativePort}`,
          ...(body.length ? { "content-length": String(body.length) } : {}),
        } as Record<string, string>,
      },
      (ur) => {
        res.writeHead(ur.statusCode ?? 502, ur.headers);
        ur.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      log(`native relay error: ${e.message}`);
      if (!res.headersSent) {
        send(res, 500, {
          value: {
            error: "unknown error",
            message: `native remote unreachable: ${e.message}`,
          },
        });
      } else {
        res.destroy();
      }
    });
    if (body.length) upstream.write(body);
    upstream.end();
  };

  const server = createServer(
    (req: IncomingMessage, res: ServerResponse) => {
      void (async () => {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/session") {
          const raw = await readRaw(req);
          let out = raw;
          try {
            const body = JSON.parse(raw.toString("utf8")) as Record<
              string,
              unknown
            >;
            out = Buffer.from(JSON.stringify(mapCapabilities(body)), "utf8");
          } catch {
            /* non-JSON body: forward as-is, let the remote complain */
          }
          return forward(req, res, out);
        }
        // Everything else — /status included — passes through untouched:
        // the native remote's answer is the truthful one (upstream has no
        // local routes at all).
        return forward(req, res, await readRaw(req));
      })().catch((e) => {
        log(`request error: ${String(e)}`);
        if (!res.headersSent) send(res, 500, {
          value: { error: "unknown error", message: String(e) },
        });
      });
    },
  ) as DriverServer;
  server.remoteProc = remoteProc;

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      // Hold the handoff until the native remote announces readiness so
      // the first client request can't race the spawn (upstream skips
      // this; clients retry — we make the race impossible instead).
      waitReady(nativePort).then((ready) => {
        if (!ready) {
          log(`native remote not ready on ${nativePort} (continuing)`);
        }
        log(`listening on ${port} (native ${nativePort})`);
        resolve(server);
      });
    });
  });
}

/** CLI entry: run only when this module IS the entry (bin shim / direct
 * node invocation). The old `argv[1].endsWith("driver")` probe never
 * matched the real bin layout — the shim execs `node dist/index.js`, so
 * argv[1] is the file itself; the CLI silently did nothing. */
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const argVal = (name: string): string | undefined => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  void (async () => {
    try {
      const server = await startDriver({
        port: Number(argVal("--port") ?? process.env.ZTRON_DRIVER_PORT ?? 4444),
        nativePort: Number(
          argVal("--native-port") ??
            process.env.ZTRON_DRIVER_NATIVE_PORT ??
            4445,
        ),
        nativeDriver:
          argVal("--native-driver") ?? process.env.ZTRON_NATIVE_DRIVER,
        verbose: true,
      });
      const shutdown = () => {
        server.remoteProc?.kill();
        server.close(() => process.exit(0));
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    } catch (e) {
      process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(1);
    }
  })();
}
