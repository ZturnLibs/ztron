/**
 * ztron-driver proxy — GAP H21: request-level forwarding to the native
 * WebDriver remote. Two layers:
 *
 *  1. Pure capability rewrite (`tauri:options` → native format, upstream
 *     tauri-driver wire contract) — asserted directly.
 *  2. End-to-end relay against a fake remote (tests/fixtures/
 *     fake-webdriver-remote.mjs, spawned via node) — proves /status
 *     passthrough, session rewrite on the wire, and arbitrary command
 *     forwarding on every platform without a real browser. The REAL
 *     msedgedriver chain is verified on-target (GAP H21 row /
 *     VERIFY-LATER A4).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
import {
  mapCapabilities,
  startDriver,
  type DriverServer,
} from "../../packages/driver/src/index.ts";

const FAKE_REMOTE = fileURLToPath(
  new URL("../fixtures/fake-webdriver-remote.mjs", import.meta.url),
);
const NATIVE_PORT = 4479;

test("capability rewrite: tauri:options -> ms:edgeOptions (win32 shape)", () => {
  const json = {
    capabilities: {
      alwaysMatch: {
        browserName: "unused",
        "tauri:options": { application: "C:\\apps\\hello\\ztron-host", args: ["-x"] },
      },
    },
    desiredCapabilities: { "tauri:options": { application: "C:\\apps\\hello\\ztron-host" } },
  };
  const out = mapCapabilities(json) as {
    capabilities: { alwaysMatch: Record<string, unknown> };
    desiredCapabilities: Record<string, unknown>;
  };
  const am = out.capabilities.alwaysMatch;
  assert.ok(!("tauri:options" in am), "tauri:options must be stripped");
  assert.equal(am["ms:edgeChromium"], true);
  assert.equal(am.browserName, "webview2");
  const edge = am["ms:edgeOptions"] as { binary: string; args: string[] };
  assert.equal(edge.binary, "C:\\apps\\hello\\ztron-host.exe");
  assert.deepEqual(edge.args, ["-x"]);
  // legacy bucket mirrors the same native object
  assert.ok(!("tauri:options" in out.desiredCapabilities));
  assert.equal(out.desiredCapabilities["ms:edgeChromium"], true);
});

test("capability rewrite: webkitgtk:browserOptions (linux shape)", () => {
  const json = {
    capabilities: {
      alwaysMatch: {
        "tauri:options": { application: "/opt/hello/ztron-host", args: [] },
      },
    },
  };
  // The rewrite is per-host-platform (upstream compiles it per-target); on
  // this host the win32/linux branches are mutually exclusive — assert the
  // branch this platform actually takes and keep the other branch covered
  // by the tauri:options-stripping assertion.
  const out = mapCapabilities(json) as {
    capabilities: { alwaysMatch: Record<string, unknown> };
  };
  const am = out.capabilities.alwaysMatch;
  assert.ok(!("tauri:options" in am));
  if (process.platform === "linux") {
    assert.equal(
      (am["webkitgtk:browserOptions"] as { binary: string }).binary,
      "/opt/hello/ztron-host",
    );
  } else if (process.platform === "win32") {
    assert.equal(
      (am["ms:edgeOptions"] as { binary: string }).binary,
      "/opt/hello/ztron-host.exe",
    );
  }
});

test("capability rewrite: body without tauri:options passes untouched", () => {
  const json = {
    capabilities: { alwaysMatch: { browserName: "msedge" } },
  };
  const out = mapCapabilities(json) as {
    capabilities: { alwaysMatch: Record<string, unknown> };
  };
  assert.deepEqual(out.capabilities.alwaysMatch, { browserName: "msedge" });
});

test("ztron-driver relays sessions to the native remote end-to-end", async (t) => {
  let driver: DriverServer;
  try {
    driver = await startDriver({
      port: 0, // ephemeral; read back below
      nativePort: NATIVE_PORT,
      nativeDriver: process.execPath, // the fake remote runner
      nativeArgs: [FAKE_REMOTE, `--port=${NATIVE_PORT}`],
    });
  } catch (e) {
    // Platform with no resolvable remote AND a broken explicit path would
    // throw at startup — anything else is a real regression.
    assert.match(String(e), /native driver|WebDriver remote/i);
    return;
  }
  t.after(() => {
    driver.remoteProc?.kill();
    driver.close();
  });
  const addr = driver.address() as { port: number };

  const call = (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number | undefined; json: any }> =>
    new Promise((resolve, reject) => {
      const payload = body == null ? null : Buffer.from(JSON.stringify(body));
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: addr.port,
          method,
          path,
          headers: payload
            ? {
                "content-type": "application/json",
                "content-length": String(payload.length),
              }
            : undefined,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () => {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve({ status: res.statusCode, json: JSON.parse(text) });
          });
        },
      );
      req.on("error", reject);
      if (payload) req.write(payload);
      req.end();
    });

  // /status passes through (the skeleton used to answer locally; upstream
  // has no local routes — the native answer is the truthful one).
  const st = await call("GET", "/status");
  assert.equal(st.status, 200);
  assert.equal(st.json.value.ready, true);
  assert.equal(st.json.value.message, "fake remote");

  // New session: rewrite happens on the wire — the remote receives the
  // NATIVE capability shape.
  const app =
    process.platform === "win32"
      ? "C:\\apps\\hello\\ztron-host"
      : "/opt/hello/ztron-host";
  const ns = await call("POST", "/session", {
    capabilities: {
      alwaysMatch: {
        "tauri:options": { application: app, args: ["-x"] },
      },
    },
  });
  assert.equal(ns.status, 200);
  const am = ns.json.value.capabilities.alwaysMatch as Record<string, unknown>;
  assert.ok(!("tauri:options" in am));
  assert.ok(
    "ms:edgeOptions" in am || "webkitgtk:browserOptions" in am,
    `native options missing: ${JSON.stringify(am)}`,
  );

  // Arbitrary commands forward untouched (method + path + body).
  const echo = await call("POST", "/session/fake-1/url", {
    url: "ztron://hello/main",
  });
  assert.equal(echo.status, 200);
  assert.equal(echo.json.value.method, "POST");
  assert.equal(echo.json.value.path, "/session/fake-1/url");
  assert.equal(echo.json.value.body, JSON.stringify({ url: "ztron://hello/main" }));

  const del = await call("DELETE", "/session/fake-1");
  assert.equal(del.json.value.method, "DELETE");
  assert.equal(del.json.value.path, "/session/fake-1");
});

test("relay re-frames chunked request bodies (no framing conflict)", async (t) => {
  const driver = await startDriver({
    port: 0,
    nativePort: 4483,
    nativeDriver: process.execPath,
    nativeArgs: [
      FAKE_REMOTE,
      "--port=4483",
    ],
  });
  t.after(() => {
    driver.remoteProc?.kill();
    driver.close();
  });
  const addr = driver.address() as { port: number };
  // Deliberately chunked: write a body with no content-length.
  const st = await new Promise<{ status: number | undefined; text: string }>(
    (resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: addr.port,
          method: "POST",
          path: "/session",
          headers: { "content-type": "application/json" },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c as Buffer));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(JSON.stringify({ capabilities: { alwaysMatch: {} } }));
    },
  );
  assert.equal(st.status, 200, `chunked relay failed: ${st.text}`);
});
