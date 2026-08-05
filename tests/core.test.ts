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
