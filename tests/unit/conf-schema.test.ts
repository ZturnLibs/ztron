/**
 * G10 (F1/F2/C10) — ztron.conf.json full-schema validation, structured
 * ingestion into AppConfig, extended WindowConfig startup application and
 * the withGlobalTauri (__ZTRON__) injection.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppBuilder,
  MockRuntime,
  validateProjectConfig,
  DECLARED_UNSUPPORTED_WINDOW_FIELDS,
} from "../../packages/core/dist/index.js";
import { buildInitScript } from "../../packages/inject/dist/index.js";

test("conf: structured blocks ingest into AppConfig (legacy csp wins-through)", async () => {
  const builder = new AppBuilder(new MockRuntime(), "com.t").fromConfig({
    identifier: "com.t",
    productName: "My App",
    version: "2.3.4",
    csp: "default-src 'self'",
    app: { withGlobalTauri: true, security: { assetProtocol: { scope: ["$APPDATA/**"] } } },
    build: { devUrl: "http://localhost:5173", frontendDist: "../dist" },
    bundle: { active: true, icon: ["icons/icon.icns"], category: "DeveloperTool" },
    plugins: { localhost: { dir: "./dist" } },
    windows: [{ label: "main", title: "T", focus: true, shadow: false }],
  });
  const app = builder.build();
  assert.equal(app.config.appName, "My App");
  assert.equal(app.config.productName, "My App");
  assert.equal(app.config.security?.csp, "default-src 'self'");
  assert.equal(app.config.withGlobalTauri, true);
  assert.equal(app.config.build?.devUrl, "http://localhost:5173");
  assert.equal(app.config.bundle?.active, true);
  assert.equal(app.config.plugins?.localhost &&
    (app.config.plugins.localhost as { dir: string }).dir, "./dist");
});

test("conf: validator rejects bad types and warns on unknown keys", () => {
  assert.throws(() =>
    validateProjectConfig({ build: { devUrl: 42 as never } }),
  );
  assert.throws(() =>
    validateProjectConfig({ app: { withGlobalTauri: "yes" as never } }),
  );
  assert.throws(() => validateProjectConfig({ bundle: 5 as never }));

  const warnings: string[] = [];
  validateProjectConfig({ totallyUnknown: 1 } as never, {
    onWarn: (m) => warnings.push(m),
  });
  assert.ok(
    warnings.some((w) => w.includes('unknown top-level key "totallyUnknown"')),
  );
});

test("conf: declared-unsupported window fields warn via onWarn", () => {
  const warnings: string[] = [];
  const builder = new AppBuilder(new MockRuntime(), "com.t").fromConfig(
    {
      windows: [
        { label: "w", parent: "main", userAgent: "ztron/1" } as never,
      ],
    },
    { onWarn: (m) => warnings.push(m) },
  );
  void builder;
  const joined = warnings.join("\n");
  for (const k of ["parent", "userAgent"]) {
    assert.ok(joined.includes(k), `missing warning for ${k}`);
    assert.ok(DECLARED_UNSUPPORTED_WINDOW_FIELDS.includes(k as never));
  }
});

test("conf: startup focus/shadow/dragDrop apply through windowState", async () => {
  const mock = new MockRuntime();
  const builder = new AppBuilder(mock, "com.t").fromConfig({
    windows: [
      {
        label: "main",
        title: "T",
        focus: true,
        shadow: false,
        dragDropEnabled: false,
      },
    ],
  });
  const app = builder.build();
  // Startup materialization: the App runtime creates each declared window;
  // unit-side we drive the same createWindow path per config entry.
  for (const w of app.config.windows) {
    app.createWindow(w as never);
  }
  const ops = mock.handles.flatMap((h) => h.windowStateLog.map((l) => l.op));
  for (const op of ["set_focus", "set_shadow", "set_file_drop_enabled"]) {
    assert.ok(ops.includes(op), `${op} not applied at startup`);
  }
});

test("inject: withGlobalTauri exposes the __ZTRON__ namespace", () => {
  const script = buildInitScript({
    invokeKey: "k",
    withGlobalTauri: true,
  });
  assert.ok(script.includes("window.__ZTRON__ = window.__TAURI_INTERNALS__"));
  const plain = buildInitScript({ invokeKey: "k" });
  assert.ok(!plain.includes("__ZTRON__"));
});
