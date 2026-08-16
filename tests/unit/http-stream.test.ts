/**
 * http streaming — `plugin:http|fetch` channel mode: chunks pushed as
 * base64 over a ChannelHandle, done + end ordering, scope still enforced.
 * Network-free: the handler's global fetch is stubbed with a progressive
 * ReadableStream Response.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { httpPlugin, ChannelHandle } from "../../packages/core/dist/index.js";
import type { Plugin } from "../../packages/core/dist/index.js";

interface Evaling {
  eval(js: string): void;
}

function makeCtx(webview: Evaling) {
  return {
    label: "main",
    getChannel: (id: number) => new ChannelHandle(id, webview as never),
    app: {} as never,
  };
}

function withStubbedFetch(
  body: ReadableStream<Uint8Array> | string,
  fn: () => Promise<void>,
): Promise<void> {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(body, {
      status: 207,
      headers: { "x-ztron": "yes" },
    })) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

/** Extracts the JSON payload from a runCallback eval. */
function channelPayload(js: string): {
  message?: { b64?: string; done?: boolean; error?: string };
  end?: boolean;
  index: number;
} {
  const start = js.indexOf("(") + 1;
  const rest = js.slice(start).replace(/\)$/, "");
  const obj = rest.slice(rest.indexOf(",") + 2);
  return JSON.parse(obj);
}

test("http stream: chunks -> done -> end, invoke returns head only", async () => {
  const evals: string[] = [];
  const plugin = httpPlugin({ scope: { allow: [{ url: "https://ok.test/*" }] } });

  const enc = new TextEncoder();
  const parts = ["alpha", "beta", "gamma"];
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const p of parts) {
        c.enqueue(enc.encode(p));
        await new Promise((r) => setTimeout(r, 5));
      }
      c.close();
    },
  });

  await withStubbedFetch(stream, async () => {
    const head = (await plugin.commands!.fetch!(
      {
        url: "https://ok.test/stream",
        channel: { kind: "channel", id: 5 },
      },
      makeCtx({ eval: (js) => evals.push(js) }) as never,
    )) as { status: number; ok: boolean; headers: Record<string, string> };

    assert.equal(head.status, 207);
    assert.equal(head.headers["x-ztron"], "yes");
    assert.equal("body" in head, false);
  });

  // pump runs in the background; wait for the end marker
  const deadline = Date.now() + 2000;
  while (
    !evals.some((js) => channelPayload(js).end) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 10));
  }

  const payloads = evals.map(channelPayload);
  const indexes = payloads.map((p) => p.index);
  assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b)); // ordered

  const chunkMsgs = payloads.filter((p) => p.message?.b64);
  assert.equal(chunkMsgs.length, 3);
  const assembled = chunkMsgs
    .map((p) => Buffer.from(p.message!.b64!, "base64").toString())
    .join("");
  assert.equal(assembled, "alphabetagamma");

  const doneIdx = payloads.findIndex((p) => p.message?.done);
  const endIdx = payloads.findIndex((p) => p.end);
  assert.ok(doneIdx > -1 && endIdx > -1, "done and end markers present");
  assert.ok(endIdx > doneIdx, "end follows done");
  assert.ok(doneIdx === payloads.length - 2, "done is the last message");
});

test("http stream: mid-stream errors surface as an error message + end", async () => {
  const evals: string[] = [];
  const plugin = httpPlugin({
    scope: { allow: [{ url: "https://any.test/*" }] },
  });
  const boom = new ReadableStream<Uint8Array>({
    start(c) {
      c.error(new Error("network reset"));
    },
  });

  await withStubbedFetch(boom, async () => {
    const head = await plugin.commands!.fetch!(
      { url: "https://any.test/x", channel: { kind: "channel", id: 9 } },
      makeCtx({ eval: (js) => evals.push(js) }) as never,
    );
    assert.equal(head.status, 207);
  });

  const deadline = Date.now() + 2000;
  while (!evals.some((js) => channelPayload(js).end) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  const payloads = evals.map(channelPayload);
  const err = payloads.find((p) => p.message?.error);
  assert.ok(err, "error message present");
  assert.match(err!.message!.error!, /network reset/);
  assert.ok(payloads.at(-1)!.end, "end marker last");
});

test("http stream: scope denial throws before any fetch/channel work", async () => {
  const evals: string[] = [];
  const plugin = httpPlugin({ scope: { allow: [] } });
  await assert.rejects(
    plugin.commands!.fetch!(
      { url: "https://denied.test/x", channel: { kind: "channel", id: 3 } },
      makeCtx({ eval: (js) => evals.push(js) }) as never,
    ) as Promise<unknown>,
    /http scope denied/,
  );
  assert.equal(evals.length, 0);
});
