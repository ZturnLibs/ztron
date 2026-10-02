/**
 * Dev-server security middleware tests (tauri 2.12 cc9d522c6 alignment):
 * Host-header allowlist (DNS-rebinding guard) + Origin-aware CORS.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  ztronVitePlugin,
  isLocalHostname,
} from "../../packages/cli/src/vite-plugin.ts";

type StubRes = {
  headers: Record<string, string>;
  statusCode?: number;
  ended?: string;
  setHeader(k: string, v: string): void;
  end(chunk?: string): void;
};

function makeRes(): StubRes {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(k, v) {
      headers[k] = v;
    },
    end(chunk) {
      this.ended = chunk;
    },
  };
}

/** Extracts the dev middleware from the plugin (configureServer hook). */
function devMiddleware() {
  const plugin = ztronVitePlugin("test-key");
  const hook = plugin.configureServer as unknown as (
    server: { middlewares: { use: (m: unknown) => void } },
  ) => void;
  let captured: unknown;
  hook({ middlewares: { use: (m: unknown) => { captured = m; } } });
  assert.ok(captured, "configureServer must register a middleware");
  return captured as (
    req: { headers: Record<string, string | undefined> },
    res: StubRes,
    next: () => void,
  ) => void;
}

test("isLocalHostname accepts localhost variants with/without port", () => {
  assert.equal(isLocalHostname("localhost"), true);
  assert.equal(isLocalHostname("localhost:5173"), true);
  assert.equal(isLocalHostname("LOCALHOST:5173"), true);
  assert.equal(isLocalHostname("127.0.0.1"), true);
  assert.equal(isLocalHostname("127.0.0.1:5173"), true);
  assert.equal(isLocalHostname("[::1]:5173"), true);
  assert.equal(isLocalHostname("::1"), true);
  assert.equal(isLocalHostname("app.localhost"), true); // Vite allows *.localhost
});

test("isLocalHostname rejects foreign hosts", () => {
  assert.equal(isLocalHostname("evil.com"), false);
  assert.equal(isLocalHostname("evil.com:5173"), false);
  assert.equal(isLocalHostname("localhost.evil.com"), false);
  assert.equal(isLocalHostname(""), false);
});

test("middleware rejects non-local Host header (DNS rebinding)", () => {
  const mw = devMiddleware();
  const res = makeRes();
  let nexted = false;
  mw(
    { headers: { host: "evil.com:5173" } },
    res as never,
    () => {
      nexted = true;
    },
  );
  assert.equal(nexted, false, "must not call next()");
  assert.equal(res.statusCode, 403);
});

test("middleware rejects missing Host header", () => {
  const mw = devMiddleware();
  const res = makeRes();
  let nexted = false;
  mw({ headers: {} }, res as never, () => { nexted = true; });
  assert.equal(nexted, false);
  assert.equal(res.statusCode, 403);
});

test("middleware omits ACAO for foreign Origin", () => {
  const mw = devMiddleware();
  const res = makeRes();
  mw(
    { headers: { host: "localhost:5173", origin: "http://evil.com" } },
    res as never,
    () => {},
  );
  assert.equal(res.headers["Access-Control-Allow-Origin"], undefined);
});

test("middleware echoes ACAO for local Origin", () => {
  const mw = devMiddleware();
  const res = makeRes();
  mw(
    { headers: { host: "127.0.0.1:5173", origin: "http://localhost:5173" } },
    res as never,
    () => {},
  );
  assert.equal(
    res.headers["Access-Control-Allow-Origin"],
    "http://localhost:5173",
  );
});

test("middleware keeps wildcard ACAO for same-origin (no Origin header)", () => {
  const mw = devMiddleware();
  const res = makeRes();
  mw({ headers: { host: "127.0.0.1:5173" } }, res as never, () => {});
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});
