/**
 * Minimal Ztron app — M0 spike target.
 *
 * Boots a system WebView via @ztron/runtime-ffi with inline HTML. The page
 * auto-runs a round-trip test on load and reports results back to the backend,
 * which prints them to stdout and then closes the window.
 *
 * Run: pnpm --filter @ztron/example-hello dev
 * Requires: txiki `tjs` binary and a webview shared library (see
 * scripts/build-native.sh).
 */
import { AppBuilder } from "@ztron/core";
import { FfiRuntime } from "@ztron/runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
};

const platform =
  (globalThis.navigator as { platform?: string })?.platform ?? "";
const webviewLib =
  tjs.env.ZTRON_WEBVIEW_LIB ??
  (platform.startsWith("Mac")
    ? "./native/libs/libwebview.dylib"
    : platform.startsWith("Win")
      ? "./native/libs/webview.dll"
      : "./native/libs/libwebview.so");

const adapter = new FfiRuntime({ libraryPath: webviewLib });

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Hello Ztron</title></head>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div id="status" style="text-align:center">running round-trip...</div>
    <script>
      const status = document.getElementById("status");
      const internals = () => window.__TAURI_INTERNALS__;
      async function run() {
        if (!internals()) {
          status.textContent = "internals missing";
          return;
        }
        try {
          // 1. sync round trip: invoke -> backend -> return -> page receives
          const echoed = await internals().invoke("spike:echo", { msg: "hello-ztron" });
          status.textContent = "sync round-trip OK: " + echoed;
          await internals().invoke("spike:report", { received: "SYNC_OK:" + echoed });

          // 2. async command: dispatched fire-and-forget; the backend handler
          //    runs its synchronous body. A full async response requires event
          //    loop integration (see DESIGN.md §M0).
          await internals().invoke("spike:async", {});
          await internals().invoke("spike:report", { received: "ASYNC_DISPATCHED" });
        } catch (e) {
          status.textContent = "error: " + e;
          await internals().invoke("spike:report", { received: "ERROR:" + e });
        }
      }
      window.addEventListener("DOMContentLoaded", run);
    </script>
  </body>
</html>`;

new AppBuilder(adapter, "com.ztron.hello")
  .window({
    label: "main",
    title: "Hello Ztron",
    width: 800,
    height: 600,
    html,
  })
  .setup((app) => {
    app.command("spike:echo", (args) => {
      const { msg } = args as { msg?: string };
      const result = `echo:${msg ?? ""}`;
      console.log(`[spike] 1/3 sync command handled, returning "${result}"`);
      return result;
    });

    app.command("spike:async", () => {
      const result = "async-ok";
      console.log(
        `[spike] async command dispatched, handler body ran -> "${result}"`,
      );
      return result;
    });

    app.command("spike:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[spike] frontend reported: "${received}"`);
      if (received?.startsWith("ASYNC_DISPATCHED")) {
        console.log("SPIKE_RESULT: SYNC_ROUNDTRIP_OK + ASYNC_DISPATCHED");
        ctx.webview.terminate();
      } else if (received?.startsWith("SYNC_OK")) {
        console.log("SPIKE_RESULT: SYNC_ROUNDTRIP_OK");
      } else if (received?.startsWith("ERROR")) {
        console.log(`SPIKE_RESULT: ERROR ${received}`);
        ctx.webview.terminate();
      }
    });
  })
  .build()
  .run();
