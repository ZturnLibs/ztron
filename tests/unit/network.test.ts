/**
 * network plugin — `plugin:network|get_public_ip` hardening: the public-IP
 * fetch is abort-capped (AbortSignal.timeout, the httpPlugin timeoutMs
 * pattern) and its endpoint URL is injectable, so the graceful null
 * fallback is provable headless (network-free: globalThis.fetch is stubbed,
 * same primitive as http-stream.test.ts).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  networkPlugin,
  localIpPlugin,
} from "../../packages/core/dist/index.js";
import { installTjs } from "../helpers/tjs-stub.ts";

const CTX = { label: "main", app: {} } as never;

/** Pins navigator.platform for the duration of fn (installTjs resets it). */
function withPlatform(
  platform: string,
  fn: () => Promise<void>,
): Promise<void> {
  Object.defineProperty(globalThis.navigator, "platform", {
    value: platform,
    configurable: true,
  });
  return fn().finally(() => {
    installTjs(); // resets navigator.platform to the macOS default
  });
}

test("network: local IPv4/IPv6 on Windows via Get-NetIPAddress", async () => {
  installTjs(); // spawn stub answers the powershell probes
  await withPlatform("Win32", async () => {
    const net = networkPlugin();
    assert.equal(
      await net.commands!.get_local_ipv4!({}, CTX),
      "192.168.0.44",
    );
    assert.equal(
      await net.commands!.get_local_ipv6!({}, CTX),
      "2409:8d02::1",
    );
    const localIp = localIpPlugin();
    assert.equal(await localIp.commands!.get!({}, CTX), "192.168.0.44");
  });
});

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
          // Hold the event loop with a REF'd timer while the fetch hangs:
          // AbortSignal.timeout uses an unref'd timer internally, so without
          // this the loop can drain with the promise still pending and
          // node:test cancels the test ("event loop has already resolved").
          const keepAlive = setTimeout(() => {}, 10_000);
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            clearTimeout(keepAlive);
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
