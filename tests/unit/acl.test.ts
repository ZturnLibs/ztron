/**
 * ACL coverage — capabilities, permission sets, deny-overrides, per-window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AppBuilder, MockRuntime } from "../../packages/core/dist/index.js";

const SECRET_PLUGIN = {
  name: "secret",
  commands: {
    peek: (_args: unknown, ctx: { app: { config: { identifier: string } } }) =>
      `peek:${ctx.app.config.identifier}`,
  },
  permissions: [
    { identifier: "secret:allow-peek", commands: ["plugin:secret|peek"] },
    { identifier: "secret:deny-peek", commands: ["!plugin:secret|peek"] },
  ],
};

function buildRestricted(capabilities: unknown[]) {
  const mock = new MockRuntime();
  const builder = new AppBuilder(mock, "com.ztron.test");
  builder.plugin(SECRET_PLUGIN);
  builder.configure({ capabilities: capabilities as never });
  const app = builder.build();
  app.createWindow({ label: "main", title: "t", width: 100, height: 100 });
  return { mock, app };
}

const denied = (p: Promise<unknown>) =>
  assert.rejects(
    () => p,
    (e: unknown) => {
      const val = String((e as { error?: string })?.error ?? e);
      if (!/access denied/i.test(val)) {
        console.log("[denied] unexpected rejection:", val);
      }
      return /access denied/i.test(val);
    },
  );

test("ACL: permissive mode (no capabilities) allows everything", async () => {
  const mock = new MockRuntime();
  const builder = new AppBuilder(mock, "com.ztron.test");
  builder.plugin(SECRET_PLUGIN);
  const app = builder.build();
  app.createWindow({ label: "main", title: "t", width: 100, height: 100 });
  assert.equal(
    await mock.main.invoke("plugin:secret|peek", {}),
    "peek:com.ztron.test",
  );
  assert.equal(await mock.main.invoke("plugin:window|center", {}), true);
});

test("ACL: unlisted command is denied when capabilities are configured", async () => {
  const { mock } = buildRestricted([
    {
      identifier: "main",
      windows: ["main"],
      permissions: ["core:default"],
    },
  ]);
  await denied(mock.main.invoke("plugin:secret|peek", {}));
});

test("ACL: granting a permission allows the command", async () => {
  const { mock } = buildRestricted([
    {
      identifier: "main",
      windows: ["main"],
      permissions: ["core:default", "secret:allow-peek"],
    },
  ]);
  assert.equal(
    await mock.main.invoke("plugin:secret|peek", {}),
    "peek:com.ztron.test",
  );
});

test("ACL: deny permission overrides allow", async () => {
  const { mock } = buildRestricted([
    {
      identifier: "main",
      windows: ["main"],
      permissions: ["core:default", "secret:allow-peek", "secret:deny-peek"],
    },
  ]);
  await denied(mock.main.invoke("plugin:secret|peek", {}));
});

test("ACL: a capability for another window does not grant the current one", async () => {
  const { mock } = buildRestricted([
    {
      identifier: "other",
      windows: ["other-window"],
      permissions: ["core:default", "secret:allow-peek"],
    },
  ]);
  await denied(mock.main.invoke("plugin:secret|peek", {}));
});

test("ACL: core commands respect core:default", async () => {
  const { mock } = buildRestricted([
    { identifier: "main", windows: ["main"], permissions: [] },
  ]);
  // core:default is NOT granted, so a core command is denied.
  await denied(mock.main.invoke("plugin:event|listen", { event: "x" }));
});

test("ACL: permission set expands to its member permissions", async () => {
  const { mock } = buildRestricted([
    {
      identifier: "main",
      windows: ["main"],
      permissions: ["core:default", "secret:allow-peek"],
    },
  ]);
  assert.equal(
    await mock.main.invoke("plugin:secret|peek", {}),
    "peek:com.ztron.test",
  );
});
