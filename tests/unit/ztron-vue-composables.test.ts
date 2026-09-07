/**
 * @zturnlibs/ztron-vue composables — behavior tests.
 *
 * Transport seam: `@zturnlibs/ztron-api/mocks` `mockIPC` swaps the invoke
 * transport; a hand-rolled `__ZTRON_INTERNALS__.transformCallback` registry
 * backs `listen`/`Channel` callback delivery (exactly what the inject bridge
 * provides in a real WebView). No jsdom: the composables are headless — a
 * fake `globalThis.window` with `__ZTRON_INTERNALS__` is enough. Lifecycle:
 * Vue `effectScope` plays the component scope, `scope.stop()` plays unmount.
 *
 * The composables are imported from package SRC (no build needed), and the
 * surface tests pin src and (after build) dist to the same three exported
 * names.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { effectScope, nextTick, reactive, type EffectScope } from "vue";
import { clearMocks, mockIPC } from "@zturnlibs/ztron-api/mocks";
import {
  useChannelStream,
  useInvoke,
  useListen,
} from "../../packages/ztron-vue/src/index.ts";
import * as vueComposablesSrc from "../../packages/ztron-vue/src/index.ts";

/* ------------------------------------------------------------------ *
 * Harness: fake window globals + __ZTRON_INTERNALS__ callback registry
 * ------------------------------------------------------------------ */

/** id -> callback, mirroring what the inject bridge keeps on the window. */
const callbacks = new Map<number, (payload: unknown) => void>();
let nextCallbackId = 1;

/** Deliver a payload to a registered callback (what the backend's eval does). */
function runCallback(id: number, payload?: unknown): void {
  const cb = callbacks.get(id);
  if (!cb) throw new Error(`no callback registered for id ${id}`);
  cb(payload);
}

before(() => {
  (globalThis as { window?: unknown }).window = {
    __ZTRON_INTERNALS__: {
      transformCallback(cb?: (payload: unknown) => void): number {
        const id = nextCallbackId++;
        if (cb) callbacks.set(id, cb);
        return id;
      },
      unregisterCallback(id: number): void {
        callbacks.delete(id);
      },
      runCallback,
    },
  };
});

after(() => {
  callbacks.clear();
  clearMocks();
});

beforeEach(() => {
  clearMocks();
});

/* ------------------------------------------------------------------ *
 * Scope + polling helpers
 * ------------------------------------------------------------------ */

let scope: EffectScope | undefined;

/** Opens a fresh effect scope and runs `fn` inside it (setup stand-in). */
function runInScope<T>(fn: () => T): T {
  scope = effectScope();
  return scope.run(fn)!;
}

/** Stops the current scope (unmount stand-in). */
function stopScope(): void {
  scope?.stop();
  scope = undefined;
}

/** Polls (pumping the Vue scheduler) until cond() holds. */
async function until(
  cond: () => boolean,
  what: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${what}`);
    await nextTick();
    await new Promise((r) => setTimeout(r, 5));
  }
}

/* ------------------------------------------------------------------ *
 * Surface: exactly the three composables, in src and (after build) dist
 * ------------------------------------------------------------------ */

test("surface: src exports exactly { useInvoke, useListen, useChannelStream }", () => {
  assert.deepEqual(Object.keys(vueComposablesSrc).sort(), [
    "useChannelStream",
    "useInvoke",
    "useListen",
  ]);
});

test("surface: built dist exports match the src surface", async () => {
  const distUrl = new URL(
    "../../packages/ztron-vue/dist/index.js",
    import.meta.url,
  );
  if (!existsSync(distUrl)) {
    // `pnpm test:unit` must pass before a build too; dist is pinned when built.
    return;
  }
  const dist = (await import(distUrl.href)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(dist).sort(), [
    "useChannelStream",
    "useInvoke",
    "useListen",
  ]);
});

/* ------------------------------------------------------------------ *
 * useInvoke
 * ------------------------------------------------------------------ */

test("useInvoke resolves data from mockIPC and re-runs when reactive args change", async () => {
  const calls: Array<Record<string, unknown>> = [];
  mockIPC((cmd, args) => {
    if (cmd === "probe:greet") {
      calls.push(args as Record<string, unknown>);
      return `hello ${(args as { name: string }).name}`;
    }
    return null;
  });

  const args = reactive<{ name: string }>({ name: "ztron" });
  const s = runInScope(() => useInvoke<string>("probe:greet", args));
  assert.equal(s.loading.value, true, "starts in the loading state");

  await until(() => s.data.value === "hello ztron", "first resolution");
  assert.equal(s.loading.value, false);
  assert.equal(s.error.value, null);
  assert.equal(calls.length, 1, "invoke issued exactly once on creation");
  assert.deepEqual(calls[0], { name: "ztron" });

  // Reactive args change (by value) -> exactly one re-run, data replaced.
  args.name = "again";
  await until(() => s.data.value === "hello again", "re-run resolution");
  assert.equal(calls.length, 2, "invoke re-ran after args change");
  assert.deepEqual(calls[1], { name: "again" });

  stopScope();
});

test("useInvoke surfaces rejections as error text", async () => {
  mockIPC(() => {
    throw new Error("boom");
  });

  const s = runInScope(() => useInvoke<string>("probe:fail"));
  await until(() => s.error.value === "boom", "error surfacing");
  assert.equal(s.data.value, null);
  assert.equal(s.loading.value, false);

  stopScope();
});

/* ------------------------------------------------------------------ *
 * useInvoke — stale-response regression (teeth for the onCleanup
 * `cancelled` guard): a mutant deleting the guard used to pass.
 * ------------------------------------------------------------------ */

test("useInvoke discards a late stale response after args change", async () => {
  // Deferred transport: every invoke is held mid-flight until released, so
  // the resolution order is under the test's control.
  const resolvers: Array<(v: unknown) => void> = [];
  mockIPC((cmd) => {
    if (cmd === "probe:greet") {
      return new Promise((resolve) => resolvers.push(resolve));
    }
    return null;
  });

  const args = reactive<{ name: string }>({ name: "slow" });
  const s = runInScope(() => useInvoke<string>("probe:greet", args));

  // Run 2 is issued by the args change; its onCleanup must cancel run 1.
  args.name = "fast";
  await until(() => resolvers.length === 2, "second invoke issued");
  await nextTick();
  resolvers[1]?.("hello fast");
  await until(() => s.data.value === "hello fast", "fresh data rendered");

  // Run 1 resolves late: the `cancelled` guard must drop it, or the stale
  // payload would overwrite the fresh one below.
  resolvers[0]?.("STALE");
  await nextTick();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(
    s.data.value,
    "hello fast",
    "late response of the cancelled run must not reach state",
  );

  stopScope();
});

test("useInvoke drops the response of a disposed scope", async () => {
  // Disposal variant: scope.stop() stops the watcher, whose onCleanup must
  // cancel the in-flight invoke before its late settlement.
  let release: ((v: unknown) => void) | undefined;
  mockIPC(() => {
    return new Promise((resolve) => {
      release = resolve;
    });
  });

  const s = runInScope(() => useInvoke<string>("probe:greet"));
  await until(() => release !== undefined, "invoke in flight");

  stopScope();
  assert.doesNotThrow(() => {
    release?.("late");
  }, "settling an in-flight invoke after disposal must not throw");
  await nextTick();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(s.data.value, null, "no state write reached the disposed scope");
  assert.equal(s.loading.value, true, "loading ref untouched after disposal");
});

/* ------------------------------------------------------------------ *
 * useListen
 * ------------------------------------------------------------------ */

test("useListen subscribes, delivers events, and scope disposal unsubscribes", async () => {
  type ListenArgs = { event: string; handler: number };
  type UnlistenArgs = { event: string; eventId: number };
  const listenArgs: ListenArgs[] = [];
  const unlistenArgs: UnlistenArgs[] = [];
  const returnedEventIds: number[] = [];
  let eventIds = 100;
  const received: number[] = [];

  mockIPC((cmd, args) => {
    if (cmd === "plugin:event|listen") {
      listenArgs.push(args as ListenArgs);
      const eventId = ++eventIds;
      returnedEventIds.push(eventId);
      return eventId;
    }
    if (cmd === "plugin:event|unlisten") {
      unlistenArgs.push(args as UnlistenArgs);
      return null;
    }
    return null;
  });

  runInScope(() =>
    useListen<{ n: number }>("probe:tick", (e) => received.push(e.payload.n)),
  );

  await until(() => listenArgs.length === 1, "listen registered");
  assert.equal(listenArgs[0]!.event, "probe:tick");

  runCallback(listenArgs[0]!.handler, {
    event: "probe:tick",
    id: returnedEventIds[0],
    payload: { n: 7 },
  });
  assert.deepEqual(received, [7], "handler received the event payload");

  // Cleanup teeth: scope disposal must unlisten, and its eventId must pair
  // with the id the mock backend handed out. If the dispose callback ever
  // drops the unlisten call, this fails.
  stopScope();
  await until(() => unlistenArgs.length === 1, "unlisten issued");
  assert.deepEqual(
    unlistenArgs.map((u) => u.eventId),
    returnedEventIds,
    "unlisten eventId pairs 1:1 with the issued listen id",
  );
});

test("useListen unsubscribes when the scope dies before listen resolves", async () => {
  type ListenArgs = { event: string; handler: number };
  type UnlistenArgs = { event: string; eventId: number };
  const listenArgs: ListenArgs[] = [];
  const unlistenArgs: UnlistenArgs[] = [];
  const returnedEventIds: number[] = [];
  let eventIds = 200;

  mockIPC((cmd, args) => {
    if (cmd === "plugin:event|listen") {
      listenArgs.push(args as ListenArgs);
      const eventId = ++eventIds;
      returnedEventIds.push(eventId);
      return eventId;
    }
    if (cmd === "plugin:event|unlisten") {
      unlistenArgs.push(args as UnlistenArgs);
      return null;
    }
    return null;
  });

  // Subscribe, then stop the scope in the same tick: the disposal wins the
  // race against the pending listen promise, and the resolved listener must
  // unregister itself immediately (no leak).
  runInScope(() => useListen("probe:tick", () => {}));
  stopScope();

  await until(
    () => listenArgs.length === 1 && unlistenArgs.length === 1,
    "late-arriving listener self-unregistered",
  );
  assert.deepEqual(
    unlistenArgs.map((u) => u.eventId),
    returnedEventIds,
    "unlisten eventId pairs 1:1 with the issued listen id",
  );
});

/* ------------------------------------------------------------------ *
 * useChannelStream
 * ------------------------------------------------------------------ */

test("useChannelStream collects messages in order, reaches done, and closes the channel", async () => {
  interface StreamArgs {
    ch: { id: number };
  }
  const streams: StreamArgs[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "probe:stream") {
      const { ch } = args as StreamArgs;
      streams.push({ ch });
      // Push 1..3 in order, then end (end unregisters the channel callback,
      // exactly like the real backend).
      queueMicrotask(() => {
        runCallback(ch.id, { message: 1, index: 0 });
        runCallback(ch.id, { message: 2, index: 1 });
        runCallback(ch.id, { message: 3, index: 2 });
        runCallback(ch.id, { end: true, index: 3 });
      });
      return "stream finished";
    }
    return null;
  });

  const s = runInScope(() => useChannelStream<number>("probe:stream"));
  assert.equal(s.status.value, "idle");
  s.start();
  assert.equal(s.status.value, "running", "start flips the status");

  await until(
    () => s.status.value === "done",
    `done (last: ${JSON.stringify(s.messages.value)})`,
  );
  assert.deepEqual(s.messages.value, [1, 2, 3], "messages in arrival order");
  assert.equal(s.error.value, null);
  assert.equal(streams.length, 1, "one channel per start()");
  assert.ok(streams[0]!.ch, "invoke args carried the channel");

  // 'end' closed the channel: the callback is gone from the registry.
  const chId = streams[0]!.ch.id;
  assert.ok(!callbacks.has(chId), "channel callback unregistered after end");

  stopScope();
});

test("useChannelStream stops on scope disposal: late messages are not delivered", async () => {
  interface StreamArgs {
    ch: { id: number };
  }
  let captured: StreamArgs | undefined;
  let release: ((value: unknown) => void) | undefined;
  mockIPC((cmd, args) => {
    if (cmd === "probe:stream") {
      captured = args as StreamArgs;
      queueMicrotask(() => {
        runCallback(captured!.ch.id, { message: "early", index: 0 });
      });
      // Hold the invoke open so the disposal happens mid-run.
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return null;
  });

  const s = runInScope(() => useChannelStream<string>("probe:stream"));
  s.start();
  await until(
    () => s.messages.value.length === 1,
    "early message collected",
  );

  // Dispose mid-run: the disposal invalidates the run AND unregisters the
  // channel callback from the bridge registry, so a late message can no
  // longer even be delivered (the registry no longer knows the callback id).
  stopScope();
  assert.ok(
    !callbacks.has(captured!.ch.id),
    "scope disposal unregistered the channel callback",
  );
  await new Promise((r) => setTimeout(r, 5));
  release?.("stream finished");
  await nextTick();
  assert.deepEqual(
    s.messages.value,
    ["early"],
    "late message dropped after disposal",
  );
  assert.equal(s.status.value, "running", "done status never reached the scope");
});

test("useChannelStream disposal unregisters the channel callback from the bridge registry", async () => {
  // Regression teeth for the disposal cleanup: the invoke never settles and
  // the backend never sends the `end` marker, so only the client-side
  // dispose can remove the callback — a mutant that merely bumps runId (the
  // recorded leak) leaves it registered and fails here.
  interface StreamArgs {
    ch: { id: number };
  }
  let captured: StreamArgs | undefined;
  mockIPC((_cmd, args) => {
    captured = args as StreamArgs;
    return new Promise(() => {}); // never settles: no end marker ever
  });

  const s = runInScope(() => useChannelStream<string>("probe:stream"));
  s.start();
  await until(() => captured !== undefined, "channel created");
  const chId = captured!.ch.id;
  assert.ok(callbacks.has(chId), "channel callback registered while running");

  stopScope();
  assert.ok(
    !callbacks.has(chId),
    "scope disposal unregistered the channel callback",
  );
});

test("useChannelStream restart invalidates the previous run's late messages", async () => {
  // Regression teeth for the runId guard (the same guard the disposal
  // cleanup uses): a late message of run 1 must be dropped after start()
  // re-issued.
  interface StreamArgs {
    ch: { id: number };
  }
  const channels: Array<{ id: number }> = [];
  const resolvers: Array<(v: unknown) => void> = [];
  mockIPC((cmd, args) => {
    if (cmd === "probe:stream") {
      const { ch } = args as StreamArgs;
      channels.push(ch);
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    }
    return null;
  });

  const s = runInScope(() => useChannelStream<string>("probe:stream"));

  // Run 1: message "a" arrives.
  s.start();
  const ch1 = channels[0]!;
  runCallback(ch1.id, { message: "a", index: 0 });
  await until(() => s.messages.value.length === 1, "run 1 message collected");

  // Restart (run 2): previous run's messages are reset.
  s.start();
  await until(() => s.messages.value.length === 0, "restart cleared messages");

  // Late message of run 1 must be dropped by the runId guard...
  runCallback(ch1.id, { message: "late-a", index: 1 });
  await nextTick();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(
    s.messages.value,
    [],
    "stale run's late message was dropped",
  );

  // ...while run 2's message is kept, and settling run 2 reaches done.
  const ch2 = channels[1]!;
  runCallback(ch2.id, { message: "b", index: 0 });
  await until(
    () => s.messages.value.length === 1,
    "run 2 message collected",
  );
  resolvers[1]?.("run 2 finished");
  await until(() => s.status.value === "done", "run 2 done");

  // Settle run 1's promise too so the test ends without a dangling invoke.
  resolvers[0]?.("run 1 finished");
  stopScope();
});
