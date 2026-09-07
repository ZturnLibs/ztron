/**
 * network plugin — `plugin:network|get_public_ip` hardening: the public-IP
 * fetch is abort-capped (AbortSignal.timeout, the httpPlugin timeoutMs
 * pattern) and its endpoint URL is injectable, so the graceful null
 * fallback is provable headless (network-free: globalThis.fetch is stubbed,
 * same primitive as http-stream.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { networkPlugin } from "../../packages/core/dist/index.js";

const CTX = { label: "main", app: {} } as never;

/** Runs fn() with globalThis.fetch stubbed (restored afterwards). */
async function withStubbedFetch(
  stub: (url: string, init?: RequestInit) => Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const orig = globalThis.fetch;
  globalThis.fetch = stub as unknown as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

test("network: get_public_ip queries the injected endpoint and trims the IP", async () => {
  let seenUrl = "";
  const plugin = networkPlugin({ publicIpUrl: "https://ip.example/inspect" });
  await withStubbedFetch(
    async (url) => {
      seenUrl = url;
      return new Response("203.0.113.7\n");
    },
    async () => {
      assert.equal(await plugin.commands!.get_public_ip!({}, CTX), "203.0.113.7");
    },
  );
  assert.equal(seenUrl, "https://ip.example/inspect", "injected endpoint used");
});

test(
  "network: get_public_ip aborts a hanging endpoint and falls back to null",
  { timeout: 5000 },
  async () => {
    // Endpoint never answers; the abort signal (50ms cap) must reject the
    // fetch so the handler returns null promptly instead of hanging the
    // caller (observed live: an SNI-blocked host stalled the whole hello
    // 86-check gate).
    let seenUrl = "";
    let aborted = false;
    const plugin = networkPlugin({
      publicIpUrl: "https://blackhole.example/ip",
      publicIpTimeoutMs: 50,
    });
    await withStubbedFetch(
      (url, init) => {
        seenUrl = url;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("The operation was aborted"));
          });
        });
      },
      async () => {
        const start = Date.now();
        assert.equal(
          await plugin.commands!.get_public_ip!({}, CTX),
          null,
          "timeout falls back to null",
        );
        assert.ok(Date.now() - start < 2000, "returned promptly (abort-capped)");
      },
    );
    assert.equal(seenUrl, "https://blackhole.example/ip");
    assert.equal(aborted, true, "the timeout signal actually fired");
  },
);
