/**
 * Minimal Ztron app — Plan A (native host) spike target.
 *
 * The backend connects to the `ztron-host` process (webview + GUI loop) over a
 * socket. Because the backend runs its own event loop, async commands work.
 *
 * Run: pnpm --filter @ztron/example-hello dev
 * Requires: native toolchain (scripts/build-native.sh) — tjs + ztron-host.
 */
import { AppBuilder } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(`[spike] backend connected to host ${host}:${port}`);

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Hello Ztron</title></head>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div id="status" style="text-align:center">running async round-trip...</div>
    <script>
      const status = document.getElementById("status");
      async function run() {
        if (!window.__TAURI_INTERNALS__) {
          status.textContent = "internals missing";
          return;
        }
        try {
          const a = await window.__TAURI_INTERNALS__.invoke("spike:async", { ms: 30 });
          status.textContent = "async round-trip OK: " + a;
          await window.__TAURI_INTERNALS__.invoke("spike:report", { received: "ASYNC_OK:" + a });
        } catch (e) {
          status.textContent = "error: " + e;
          await window.__TAURI_INTERNALS__.invoke("spike:report", { received: "ERROR:" + e });
        }
      }
      window.addEventListener("DOMContentLoaded", run);
    </script>
  </body>
</html>`;

new AppBuilder(runtime, "com.ztron.hello")
  .window({
    label: "main",
    title: "Hello Ztron",
    width: 800,
    height: 600,
    html,
  })
  .setup((app) => {
    app.command("spike:async", async (args) => {
      const { ms } = args as { ms?: number };
      const result = await new Promise<string>((resolve) =>
        setTimeout(() => resolve("async-ok"), ms ?? 30),
      );
      console.log(
        `[spike] async command resolved after ${ms ?? 30}ms -> "${result}"`,
      );
      return result;
    });

    app.command("spike:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[spike] frontend reported: "${received}"`);
      if (received?.startsWith("ASYNC_OK")) {
        console.log("SPIKE_RESULT: ASYNC_ROUNDTRIP_OK");
        ctx.webview.terminate();
      } else if (received?.startsWith("ERROR")) {
        console.log(`SPIKE_RESULT: ERROR ${received}`);
        ctx.webview.terminate();
      }
    });
  })
  .build()
  .run();
