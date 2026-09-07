/**
 * @zturnlibs/ztron-react hooks — behavior tests.
 *
 * Transport seam: `@zturnlibs/ztron-api/mocks` `mockIPC` swaps the invoke
 * transport; a hand-rolled `__ZTRON_INTERNALS__.transformCallback` registry
 * backs `listen`/`Channel` callback delivery (exactly what the inject bridge
 * provides in a real WebView). DOM: jsdom installed as globalThis
 * window/document. Rendering: React 19 `createRoot` + `act`.
 *
 * The hooks are imported from package SRC (no build needed), and the surface
 * tests pin src and (after build) dist to the same three exported names.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { JSDOM } from "jsdom";
import { StrictMode, act, createElement, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearMocks, mockIPC } from "@zturnlibs/ztron-api/mocks";
import {
  useChannelStream,
  useInvoke,
  useListen,
} from "../../packages/ztron-react/src/index.ts";
import * as reactHooksSrc from "../../packages/ztron-react/src/index.ts";

/* ------------------------------------------------------------------ *
 * Harness: jsdom globals + __ZTRON_INTERNALS__ callback registry
 * ------------------------------------------------------------------ */

let domWindow: { document: Document };

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
  const dom = new JSDOM(
    "<!doctype html><html><body><div id='root'></div></body></html>",
    { url: "https://ztron.test/" },
  );
  const window = dom.window as unknown as Record<string, unknown>;
  window.__ZTRON_INTERNALS__ = {
    transformCallback(cb?: (payload: unknown) => void): number {
      const id = nextCallbackId++;
      if (cb) callbacks.set(id, cb);
      return id;
    },
    unregisterCallback(id: number): void {
      callbacks.delete(id);
    },
    runCallback,
  };
  domWindow = { document: dom.window.document };
  (globalThis as { window?: unknown }).window = window;
  (globalThis as { document?: unknown }).document = domWindow.document;
  // React 19 act() requires an explicit act-friendly testing environment.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

after(() => {
  callbacks.clear();
  clearMocks();
});

beforeEach(() => {
  clearMocks();
});

/* ------------------------------------------------------------------ *
 * Render helpers
 * ------------------------------------------------------------------ */

let root: Root | undefined;
let container: HTMLElement | undefined;

/** Mounts a node into a fresh container inside act and returns the container. */
async function renderNode(node: ReactElement): Promise<HTMLElement> {
  container = domWindow.document.createElement("div");
  domWindow.document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(node);
  });
  return container;
}

async function unmount(): Promise<void> {
  const r = root;
  const c = container;
  root = undefined;
  container = undefined;
  if (r) {
    await act(async () => r.unmount());
    c?.remove();
  }
}

/** Polls until the container shows the expected text (pumping act each try). */
async function waitForText(
  container: HTMLElement,
  text: string,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    await act(async () => {});
    last = container.textContent ?? "";
    if (last.includes(text)) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(
    `timeout waiting for ${JSON.stringify(text)}; last: ${JSON.stringify(last)}`,
  );
}

/* ------------------------------------------------------------------ *
 * Surface: exactly the three hooks, in src and (after build) in dist
 * ------------------------------------------------------------------ */

test("surface: src exports exactly { useInvoke, useListen, useChannelStream }", () => {
  assert.deepEqual(Object.keys(reactHooksSrc).sort(), [
    "useChannelStream",
    "useInvoke",
    "useListen",
  ]);
});

test("surface: built dist exports match the src surface", async () => {
  const distUrl = new URL(
    "../../packages/ztron-react/dist/index.js",
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

test("useInvoke resolves data from mockIPC and re-runs when args change", async () => {
  const calls: Array<Record<string, unknown>> = [];
  mockIPC((cmd, args) => {
    if (cmd === "probe:greet") {
      calls.push(args as Record<string, unknown>);
      return `hello ${(args as { name: string }).name}`;
    }
    return null;
  });

  function Probe({ name }: { name: string }) {
    const s = useInvoke<string>("probe:greet", { name });
    return createElement(
      "div",
      null,
      s.error ? `error:${s.error}` : s.loading ? "loading" : `ok:${s.data}`,
    );
  }

  const container = await renderNode(createElement(Probe, { name: "ztron" }));
  await waitForText(container, "ok:hello ztron");
  assert.equal(calls.length, 1, "invoke issued exactly once on mount");
  assert.deepEqual(calls[0], { name: "ztron" });

  // args change (by value) -> exactly one re-run, data replaced
  await act(async () => {
    root!.render(createElement(Probe, { name: "again" }));
  });
  await waitForText(container, "ok:hello again");
  assert.equal(calls.length, 2, "invoke re-ran after args change");
  assert.deepEqual(calls[1], { name: "again" });

  await unmount();
});

/* ------------------------------------------------------------------ *
 * useListen
 * ------------------------------------------------------------------ */

test("useListen subscribes, delivers events, and cleanup unsubscribes on unmount", async () => {
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

  let renders = 0;
  function Probe() {
    renders += 1;
    const [ticks, setTicks] = useState<number[]>([]);
    useListen<{ n: number }>("probe:tick", (e) => {
      received.push(e.payload.n);
      setTicks((prev) => [...prev, e.payload.n]);
    });
    return createElement("div", null, `ticks:${ticks.length}`);
  }

  // StrictMode double mount: two listen registrations are expected.
  const container = await renderNode(
    createElement(StrictMode, null, createElement(Probe)),
  );

  const deadline = Date.now() + 2000;
  while (listenArgs.length < 2 && Date.now() < deadline) {
    await act(async () => {});
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(listenArgs.length, 2, "StrictMode double mount -> two listens");
  assert.ok(listenArgs.every((a) => a.event === "probe:tick"));
  assert.equal(
    unlistenArgs.length,
    1,
    "the disposed first listen already unregistered itself on resolution",
  );

  // Deliver on the surviving (second) registration: handler fires + renders.
  const survivingHandler = listenArgs[1]!.handler;
  await act(async () => {
    runCallback(survivingHandler, {
      event: "probe:tick",
      id: returnedEventIds[1],
      payload: { n: 7 },
    });
  });
  assert.deepEqual(received, [7], "handler received the event payload");
  await waitForText(container, "ticks:1");
  const rendersAtSteadyState = renders;

  // Cleanup teeth: unmount must unlisten the surviving registration, and its
  // eventId must pair with the id the mock backend handed out. If the effect
  // cleanup ever drops the unlisten call, this fails.
  await unmount();
  const unDeadline = Date.now() + 2000;
  while (unlistenArgs.length < 2 && Date.now() < unDeadline) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.equal(
    unlistenArgs.length,
    2,
    "cleanup unlistened both StrictMode registrations",
  );
  assert.deepEqual(
    unlistenArgs.map((u) => u.eventId).sort((a, b) => a - b),
    returnedEventIds,
    "unlisten eventIds pair 1:1 with the issued listen ids",
  );
  assert.equal(renders, rendersAtSteadyState, "no renders after unmount");
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

  let startRef: (() => void) | undefined;
  function Probe() {
    const s = useChannelStream<number>("probe:stream");
    startRef = s.start;
    return createElement(
      "div",
      null,
      s.error ? `error:${s.error}` : `${s.status}:${s.messages.join(",")}`,
    );
  }

  const container = await renderNode(createElement(Probe));
  await act(async () => {
    startRef!();
  });
  await waitForText(container, "done:1,2,3");
  assert.equal(streams.length, 1, "one channel per start()");
  assert.ok(streams[0]!.ch, "invoke args carried the channel");

  // 'end' closed the channel: the callback is gone from the registry.
  const chId = streams[0]!.ch.id;
  assert.ok(!callbacks.has(chId), "channel callback unregistered after end");

  await unmount();
});

test("useChannelStream stops on unmount: late messages are not delivered", async () => {
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
      // Hold the invoke open so the unmount happens mid-run.
      return new Promise((resolve) => {
        release = resolve;
      });
    }
    return null;
  });

  let startRef: (() => void) | undefined;
  let renders = 0;
  function Probe() {
    renders += 1;
    const s = useChannelStream<string>("probe:stream");
    startRef = s.start;
    return createElement("div", null, `${s.status}:${s.messages.join(",")}`);
  }

  const container = await renderNode(createElement(Probe));
  await act(async () => {
    startRef!();
  });
  await waitForText(container, "running:early");
  const rendersBeforeUnmount = renders;

  // Unmount mid-run, then push a late message and settle the invoke. The
  // unmount cleanup invalidates the run, so neither the message nor the
  // done-status may reach the unmounted component.
  await unmount();
  assert.doesNotThrow(() => {
    runCallback(captured!.ch.id, { message: "late", index: 1 });
  }, "late channel message after unmount must not throw");
  await act(async () => {
    release?.("stream finished");
  });
  assert.equal(
    renders,
    rendersBeforeUnmount,
    "no state writes reached the unmounted component",
  );
  assert.equal(container.textContent, "", "nothing rendered after unmount");
});

test("useChannelStream restart invalidates the previous run's late messages", async () => {
  // Regression teeth for the runId guard (the same guard the unmount cleanup
  // uses): a late message of run 1 must be dropped after start() re-issued.
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

  let startRef: (() => void) | undefined;
  function Probe() {
    const s = useChannelStream<string>("probe:stream");
    startRef = s.start;
    return createElement("div", null, `${s.status}:${s.messages.join(",")}`);
  }

  const container = await renderNode(createElement(Probe));

  // Run 1: message "a" arrives and renders.
  await act(async () => {
    startRef!();
  });
  const ch1 = channels[0]!;
  await act(async () => {
    runCallback(ch1.id, { message: "a", index: 0 });
  });
  await waitForText(container, "running:a");

  // Restart (run 2): previous run's messages are reset.
  await act(async () => {
    startRef!();
  });
  const ch2 = channels[1]!;
  await act(async () => {});
  assert.ok(
    !(container.textContent ?? "").includes("a"),
    "restart cleared the previous run's messages",
  );

  // Late message of run 1 must be dropped by the runId guard...
  await act(async () => {
    runCallback(ch1.id, { message: "late-a", index: 1 });
  });
  await act(async () => {});
  assert.ok(
    !(container.textContent ?? "").includes("late-a"),
    "stale run's late message was dropped",
  );

  // ...while run 2's message is kept, and settling run 2 reaches done.
  await act(async () => {
    runCallback(ch2.id, { message: "b", index: 0 });
  });
  await waitForText(container, "running:b");
  await act(async () => {
    resolvers[1]?.("run 2 finished");
  });
  await waitForText(container, "done:b");

  // Settle run 1's promise too so the test ends without a dangling invoke.
  await act(async () => {
    resolvers[0]?.("run 1 finished");
  });
  await unmount();
});
