/**
 * Unit tests for the framework core using the MockRuntime.
 * Run: node --experimental-strip-types --test tests/core.test.ts
 *
 * Note: `app.createWindow()` (not `app.run()`) is used — `run()` blocks on the
 * real run loop; the mock needs only the IPC wiring from createWindow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AppBuilder,
  MockRuntime,
  defineCommand,
  PathScope,
  windowStatePlugin,
} from "../packages/core/dist/index.js";

function buildApp(
  configure?: (b: AppBuilder) => void,
  setup?: (app: import("../packages/core/dist/index.js").App) => void,
) {
  const mock = new MockRuntime();
  const builder = new AppBuilder(mock, "com.ztron.test");
  configure?.(builder);
  const app = builder.build();
  setup?.(app);
  app.createWindow({ label: "main", title: "t", width: 100, height: 100 });
  return { mock, app };
}

test("typed command via defineCommand + MockRuntime", async () => {
  const greet = defineCommand("test:greet", {
    args: {} as { name: string },
    result: "" as string,
    handler: (a) => `hello, ${a.name}`,
  });
  const { mock } = buildApp(undefined, (app) => app.commandDef(greet));
  const res = await mock.main.invoke("test:greet", { name: "world" });
  assert.equal(res, "hello, world");
});

test("window state commands route through the handle", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:window|minimize", {});
  await mock.main.invoke("plugin:window|set_title", { title: "New Title" });
  assert.equal(mock.main.windowStateLog[0]?.op, "minimize");
  assert.deepEqual(mock.main.titleLog, ["New Title"]);
});

test("positioner commands route through the handle frame", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:window|set_position", { x: 30, y: 40 });
  assert.deepEqual(mock.main.positionLog, [{ x: 30, y: 40 }]);
  const frame = await mock.main.invoke("plugin:window|get_frame", {});
  assert.deepEqual(frame, { x: 30, y: 40, width: 900, height: 640 });
});

test("start_dragging and get_state route through the handle", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:window|start_dragging", {});
  assert.equal(mock.main.dragCount, 1);
  const st = await mock.main.invoke("plugin:window|get_state", {});
  assert.deepEqual(st, mock.main.stateSnapshot);
});

test("global-shortcut commands route to the controller", async () => {
  const { mock } = buildApp();
  const ok = await mock.main.invoke("plugin:global-shortcut|register", {
    id: "toggle",
    accelerator: "Cmd+Shift+K",
  });
  assert.equal(ok, true);
  assert.deepEqual(mock.shortcutRegisters, [
    { id: "toggle", accelerator: "Cmd+Shift+K" },
  ]);
  const un = await mock.main.invoke("plugin:global-shortcut|unregister", {
    id: "toggle",
  });
  assert.equal(un, true);
  assert.deepEqual(mock.shortcutUnregisters, ["toggle"]);
});

test("deep-link get_last_url routes to the controller", async () => {
  const { mock } = buildApp();
  const last = await mock.main.invoke("plugin:deep-link|get_last_url", {});
  assert.equal(last, null);
});

test("window-state plugin saves and restores geometry", async () => {
  // Stub the txiki `tjs` global with an in-memory fs for the plugin.
  const files = new Map<string, string>();
  (globalThis as Record<string, unknown>).tjs = {
    tmpDir: "/tmp",
    readFile: async (p: string) =>
      new TextEncoder().encode(files.get(p) ?? "{}"),
    writeFile: async (p: string, data: string | Uint8Array) => {
      files.set(p, new TextDecoder().decode(data));
    },
  };

  const { mock } = buildApp((b) =>
    b.plugin(windowStatePlugin({ file: "/tmp/ws.json" })),
  );
  await mock.main.invoke("plugin:window|set_position", { x: 55, y: 66 });
  const saved = await mock.main.invoke("plugin:window-state|save", {});
  assert.deepEqual(saved, {
    x: 55,
    y: 66,
    width: 900,
    height: 640,
    maximized: false,
    fullscreen: false,
  });

  // Move away, restore, and confirm the handle re-applies the saved geometry.
  await mock.main.invoke("plugin:window|set_position", { x: 200, y: 200 });
  const restored = await mock.main.invoke("plugin:window-state|restore", {});
  assert.deepEqual(restored, {
    x: 55,
    y: 66,
    width: 900,
    height: 640,
    maximized: false,
    fullscreen: false,
  });
  assert.deepEqual(mock.main.positionLog[mock.main.positionLog.length - 1], {
    x: 55,
    y: 66,
  });
  assert.deepEqual(mock.main.sizeLog[mock.main.sizeLog.length - 1], {
    w: 900,
    h: 640,
  });
  delete (globalThis as Record<string, unknown>).tjs;
});

test("window-state plugin saves and restores maximized/fullscreen flags", async () => {
  const files = new Map<string, string>();
  (globalThis as Record<string, unknown>).tjs = {
    tmpDir: "/tmp",
    readFile: async (p: string) =>
      new TextEncoder().encode(files.get(p) ?? "{}"),
    writeFile: async (p: string, data: string | Uint8Array) => {
      files.set(p, new TextDecoder().decode(data));
    },
  };

  const { mock } = buildApp((b) =>
    b.plugin(windowStatePlugin({ file: "/tmp/ws-max.json" })),
  );
  mock.main.windowStateValues["is_maximized"] = true;
  const saved = await mock.main.invoke("plugin:window-state|save", {});
  assert.equal(saved?.maximized, true);
  assert.equal(saved?.fullscreen, false);

  const restored = await mock.main.invoke("plugin:window-state|restore", {});
  assert.equal(restored?.maximized, true);
  assert.ok(
    mock.main.windowStateLog.some((l) => l.op === "toggle_maximize"),
    "restore should re-maximize the window",
  );
  delete (globalThis as Record<string, unknown>).tjs;
});

test("ACL: command outside capability is denied", async () => {
  // A hand-rolled plugin with an explicit permission for one command — no
  // tjs dependency, so it runs under Node's mock runtime.
  const { mock } = buildApp((b) => {
    b.configure({
      capabilities: [
        {
          identifier: "main",
          windows: ["main"],
          permissions: ["core:default"],
        },
      ],
    });
    b.plugin({
      name: "secret",
      commands: {
        peek: () => "pwned",
      },
      permissions: [
        { identifier: "secret:allow-peek", commands: ["plugin:secret|peek"] },
      ],
    });
  });
  // plugin:secret|peek is NOT granted (only core:default) -> ACL denies.
  await assert.rejects(
    () => mock.main.invoke("plugin:secret|peek", {}),
    (err: unknown) =>
      /access denied/i.test(String((err as { error?: unknown })?.error ?? err)),
  );
});

test(
  "PathScope allows $TMP and denies /etc",
  { skip: !("tjs" in globalThis) },
  async () => {
    const scope = new PathScope({ allow: ["$TMP/**"] });
    const allowed = await scope.tryCheck("$TMP/foo.txt");
    assert.ok(allowed);
    const denied = await scope.tryCheck("/etc/hosts");
    assert.equal(denied, null);
  },
);
