/**
 * @zturnlibs/ztron-svelte listeners — behavior tests.
 *
 * Transport seam: `@zturnlibs/ztron-api/mocks` `mockIPC` swaps the invoke
 * transport; a hand-rolled `__ZTRON_INTERNALS__.transformCallback` registry
 * backs `listen` callback delivery (exactly what the inject bridge provides
 * in a real WebView). No jsdom and no component compiler: the listeners are
 * headless. `subscribe` is the plain cleanup-returning helper and carries
 * the full behavior suite; `listenOnMount` delegates to it and only adds
 * Svelte's `onDestroy` binding, which requires component-initialisation
 * context, so it is pinned to its binding contract here (throw outside
 * init) and proven on the real pipeline by the svelte-demo smoke
 * (SVELTE_DEMO_OK).
 *
 * The listeners are imported from package SRC (no build needed), and the
 * surface tests pin src and (after build) dist to the same two exported
 * names.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { clearMocks, mockIPC } from "@zturnlibs/ztron-api/mocks";
import {
  listenOnMount,
  subscribe,
} from "../../packages/ztron-svelte/src/index.ts";
import * as svelteListenersSrc from "../../packages/ztron-svelte/src/index.ts";

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

/** Polls until cond() holds. */
async function until(
  cond: () => boolean,
  what: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) assert.fail(`timeout waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/* ------------------------------------------------------------------ *
 * Surface: exactly { listenOnMount, subscribe }, in src and (after
 * build) in dist
 * ------------------------------------------------------------------ */

test("surface: src exports exactly { listenOnMount, subscribe }", () => {
  assert.deepEqual(Object.keys(svelteListenersSrc).sort(), [
    "listenOnMount",
    "subscribe",
  ]);
});

test("surface: built dist exports match the src surface", async () => {
  const distUrl = new URL(
    "../../packages/ztron-svelte/dist/index.js",
    import.meta.url,
  );
  if (!existsSync(distUrl)) {
    // `pnpm test:unit` must pass before a build too; dist is pinned when built.
    return;
  }
  const dist = (await import(distUrl.href)) as Record<string, unknown>;
  assert.deepEqual(Object.keys(dist).sort(), [
    "listenOnMount",
    "subscribe",
  ]);
});

/* ------------------------------------------------------------------ *
 * subscribe
 * ------------------------------------------------------------------ */

test("subscribe delivers events and the returned cleanup unlistens", async () => {
  type ListenArgs = { event: string; handler: number };
  type UnlistenArgs = { event: string; eventId: number };
  const listenArgs: ListenArgs[] = [];
  const unlistenArgs: UnlistenArgs[] = [];
  const returnedEventIds: number[] = [];
  let eventIds = 300;
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

  const stop = subscribe<{ n: number }>("probe:tick", (e) =>
    received.push(e.payload.n),
  );

  await until(() => listenArgs.length === 1, "listen registered");
  assert.equal(listenArgs[0]!.event, "probe:tick");

  runCallback(listenArgs[0]!.handler, {
    event: "probe:tick",
    id: returnedEventIds[0],
    payload: { n: 7 },
  });
  assert.deepEqual(received, [7], "handler received the event payload");

  // Cleanup teeth: the returned cleanup must unlisten, and its eventId must
  // pair with the id the mock backend handed out. If the cleanup ever drops
  // the unlisten call, this fails.
  stop();
  await until(() => unlistenArgs.length === 1, "unlisten issued");
  assert.deepEqual(
    unlistenArgs.map((u) => u.eventId),
    returnedEventIds,
    "unlisten eventId pairs 1:1 with the issued listen id",
  );
  assert.doesNotThrow(
    () => stop(),
    "cleanup is idempotent (second call is a no-op)",
  );
});

test("subscribe cleanup wins the race against the pending listen promise", async () => {
  // Cleanup before the subscription resolves: the resolved listener must
  // unregister itself immediately (no leak).
  type ListenArgs = { event: string; handler: number };
  type UnlistenArgs = { event: string; eventId: number };
  const listenArgs: ListenArgs[] = [];
  const unlistenArgs: UnlistenArgs[] = [];
  const returnedEventIds: number[] = [];
  let eventIds = 400;

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

  const stop = subscribe<{ n: number }>("probe:tick", () => {});
  stop(); // same tick: the listen promise has not settled yet

  await until(
    () => listenArgs.length === 1 && unlistenArgs.length === 1,
    "late-arriving listener self-unregistered",
  );
  assert.deepEqual(
    unlistenArgs.map((u) => u.eventId),
    returnedEventIds,
    "unlisten eventId pairs 1:1 with the issued listen id",
  );
  // Note: the harness registry deliberately does not model the backend
  // removing the listener on unlisten, so there is no handler-silence
  // assertion here; the backend contract (unlisten issued with the paired
  // eventId) is the race-handling guarantee under test.
});

/* ------------------------------------------------------------------ *
 * listenOnMount — component-binding contract
 * ------------------------------------------------------------------ */

test("listenOnMount requires component-initialisation context (onDestroy binding)", async () => {
  // listenOnMount = subscribe + onDestroy. Outside a component's init
  // context Svelte's onDestroy throws; this pins the binding contract that
  // the README documents (call from a .svelte top-level script). The live
  // component behavior is proven by the svelte-demo smoke (SVELTE_DEMO_OK).
  assert.throws(
    () => listenOnMount("probe:tick", () => {}),
    (err: unknown) => err instanceof Error,
    "onDestroy binding must throw outside component initialisation",
  );
});
