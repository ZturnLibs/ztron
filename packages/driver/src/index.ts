#!/usr/bin/env node
/**
 * `ztron-driver` — a W3C WebDriver intermediary for Ztron apps (GAP F7).
 *
 * Mirrors upstream `tauri-driver`: an HTTP intermediary node that speaks
 * the W3C WebDriver protocol on the client side and forwards sessions to
 * a platform-native WebDriver remote (WebKitWebDriver on Linux,
 * msedgedriver on Windows). macOS has no native WebDriver remote (same
 * upstream limitation); sessions there fail closed with a clear error.
 *
 * Status: protocol skeleton with session handshake, routing table and
 * platform dispatch. Driving real remotes requires the target platforms
 * (user-provided environments per the GAP "port now, verify later" rule).
 */
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { spawn, ChildProcess } from "node:child_process";

export interface DriverOptions {
  port?: number;
  nativePort?: number;
  verbose?: boolean;
}

interface W3CError {
  error: string;
  message: string;
  stacktrace?: string;
}

const NOT_MAPPED: W3CError = {
  error: "unknown command",
  message: "Command not mapped by ztron-driver",
};

/** Platform remotes (upstream parity table). */
function remoteForPlatform(): { bin: string; args: string[] } | null {
  switch (process.platform) {
    case "linux":
      return { bin: "WebKitWebDriver", args: [] };
    case "win32":
      return { bin: "msedgedriver.exe", args: [] };
    default:
      return null; // darwin: no native WebDriver remote (upstream same)
  }
}

/** Reads a JSON body (best-effort; empty -> {}). */
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

/**
 * Starts the intermediary. Returns the server once listening; sessions
 * are forwarded to the platform remote when one exists.
 */
export function startDriver(options: DriverOptions = {}): Promise<
  ReturnType<typeof createServer> & { remoteProc?: ChildProcess }
> {
  const port = options.port ?? 4444;
  const nativePort = options.nativePort ?? 4445;
  const log = (m: string) => {
    if (options.verbose) process.stderr.write(`[ztron-driver] ${m}\n`);
  };

  const remote = remoteForPlatform();

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);

      // W3C handshake
      if (req.method === "GET" && url.pathname === "/status") {
        return send(res, 200, {
          value: {
            ready: remote != null,
            message: remote
              ? "ztron-driver ready (platform remote available)"
              : "ztron-driver running; no WebDriver remote on this platform",
          },
        });
      }

      // New session: proxy to the native remote, or fail closed.
      if (req.method === "POST" && url.pathname === "/session") {
        if (!remote) {
          return send(res, 500, {
            value: {
              error: "session not created",
              message:
                "This platform has no WebDriver remote (macOS parity with upstream tauri-driver)",
            },
          });
        }
        try {
          const proc = spawn(remote.bin, [...remote.args, `--port=${nativePort}`], {
            stdio: "ignore",
          });
          (server as { remoteProc?: ChildProcess }).remoteProc = proc;
          log(`spawned ${remote.bin} on ${nativePort}`);
          const body = await readBody(req);
          void body;
          // Skeleton: real proxying lands with target-platform verification.
          return send(res, 500, {
            value: {
              error: "session not created",
              message:
                "Remote spawn succeeded; request forwarding is pending platform verification (GAP F7)",
            },
          });
        } catch (e) {
          return send(res, 500, {
            value: { error: "session not created", message: String(e) },
          });
        }
      }

      void segments;
      return send(res, 404, { value: NOT_MAPPED });
    },
  ) as ReturnType<typeof createServer> & { remoteProc?: ChildProcess };

  return new Promise((resolve) => {
    server.listen(port, () => {
      log(`listening on ${port} (native ${nativePort})`);
      resolve(server);
    });
  });
}

/** CLI entry: run until interrupted. */
if (process.argv[1] && process.argv[1].endsWith("driver")) {
  const port = Number(process.env.ZTRON_DRIVER_PORT ?? 4444);
  startDriver({ port, verbose: true }).then((s) => {
    const shutdown = () => {
      s.remoteProc?.kill();
      s.close(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  });
}
