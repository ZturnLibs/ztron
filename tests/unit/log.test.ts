/** Log plugin — file target, rotation (keepAll/keepOne), webview target,
 * level filtering. Exercises the plugin command handlers against the
 * in-memory tjs stub (same primitives the real txiki runtime provides).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { logPlugin } from "../../packages/core/dist/index.js";
import { installTjs } from "../helpers/tjs-stub.ts";

const dec = (b: Uint8Array) => new TextDecoder().decode(b);
/** File writes are queued (read-modify-write); let the queue drain. */
const settle = () => new Promise((r) => setTimeout(r, 5));

function makePlugin(opts: Record<string, unknown> = {}) {
  const evals: string[] = [];
  const plugin = logPlugin({
    level: "trace",
    ...opts,
  } as Parameters<typeof logPlugin>[0]);
  plugin.setup?.({ config: { identifier: "com.ztron.test" } } as never);
  const ctx = {
    label: "main",
    app: {
      getWebview(label: string) {
        return { eval: (js: string) => void evals.push(`[${label}] ${js}`) };
      },
    },
  };
  return { plugin, ctx, evals };
}

test("log: file target appends + keepOne rotation replaces the single .old", async () => {
  const tjs = installTjs();
  const { plugin, ctx } = makePlugin({
    targets: ["file"],
    rotationStrategy: "keepOne",
    maxFileSize: 60,
    logDir: "/tmp/ztron-test/logs",
    fileName: "app.log",
  });

  plugin.commands!.info!({ message: "line-one" }, ctx);
  plugin.commands!.info!({ message: "line-two" }, ctx);
  await settle(); // ~45B/line: buffer now ~90B >= 60
  plugin.commands!.info!({ message: "line-three" }, ctx);
  await settle();

  const cur = dec(await tjs.readFile("/tmp/ztron-test/logs/app.log"));
  const backup = dec(await tjs.readFile("/tmp/ztron-test/logs/app.log.old"));
  // Rotation happened before the 3rd append: backup holds lines 1+2, current only line 3.
  assert.ok(backup.includes("line-one"));
  assert.ok(backup.includes("line-two"));
  assert.ok(!backup.includes("line-three"));
  assert.ok(cur.includes("line-three"));
  assert.ok(!cur.includes("line-one"));
  assert.equal(cur.split("\n").filter(Boolean).length, 1);
});

test("log: keepAll rotation leaves timestamped backups", async () => {
  const tjs = installTjs();
  const { plugin, ctx } = makePlugin({
    targets: ["file"],
    rotationStrategy: "keepAll",
    maxFileSize: 20, // first record (~40B) already exceeds on the next append
    logDir: "/tmp/ztron-test/logs",
    fileName: "app.log",
  });

  plugin.commands!.warn!({ message: "first" }, ctx);
  await settle();
  plugin.commands!.warn!({ message: "second" }, ctx);
  await settle();

  const entries = await tjs.readDir("/tmp/ztron-test/logs");
  const names = entries.map((e) => e.name);
  assert.ok(names.includes("app.log"));
  assert.ok(
    names.some((n) => /^app\.log\.\d{4}-\d{2}-\d{2}T/.test(n)),
    `timestamped backup among ${JSON.stringify(names)}`,
  );
  const cur = dec(await tjs.readFile("/tmp/ztron-test/logs/app.log"));
  assert.ok(cur.includes("second"));
});

test("log: webview target pushes records to plugin:log|__listener subscribers", async () => {
  const { plugin, ctx, evals } = makePlugin({
    targets: ["webview"],
  });
  // addPluginListener('log','log',…) registers via `__listener` with a
  // transformCallback id; delivery evals runCallback(id, {message}) in the
  // issuing webview (same mechanism as the event system).
  plugin.commands!["__listener"]!({ event: "log", handler: 77 }, ctx);
  plugin.commands!.info!({ message: "hello-webview" }, ctx);
  plugin.commands!.error!({ message: "boom" }, ctx);

  assert.equal(evals.length, 2);
  assert.match(evals[0]!, /runCallback\(77,/);
  assert.match(evals[0]!, /\[INFO\] hello-webview/);
  assert.match(evals[1]!, /\[ERROR\] boom/);

  plugin.commands!["__unlistener"]!({ event: "log", handler: 77 }, ctx);
  plugin.commands!.info!({ message: "after-unlisten" }, ctx);
  assert.equal(evals.length, 2); // no further deliveries
});

test("log: min level filters records before any target sees them", async () => {
  const tjs = installTjs();
  const { plugin, ctx, evals } = makePlugin({
    level: "warn",
    targets: ["file", "webview"],
    logDir: "/tmp/ztron-test/logs",
    fileName: "app.log",
  });
  plugin.commands!["__listener"]!({ event: "log", handler: 9 }, ctx);
  plugin.commands!.info!({ message: "filtered-out" }, ctx);
  await settle();
  plugin.commands!.error!({ message: "kept" }, ctx);
  await settle();

  assert.equal(evals.length, 1); // only the error record reached targets
  const cur = dec(await tjs.readFile("/tmp/ztron-test/logs/app.log"));
  assert.ok(!cur.includes("filtered-out"));
  assert.ok(cur.includes("kept"));
});
