/**
 * Ztron multiwin — P6.3 spike: runtime creation of a SECOND native window.
 *
 * Flow:
 *  1. main page invokes `spawn` → backend creates the second window
 *  2. second page invokes `second_loaded` → must arrive labeled "second"
 *  3. backend drives window ops on the second handle (minimize/unminimize/
 *     setTitle/is_minimized query) → SECOND_OPS_OK
 *  4. backend destroys the second window (registry cleanup path)
 *  5. main terminates → MULTI_WINDOW_RUNTIME_OK + exit 0
 */
import { AppBuilder } from "@zturnlibs/core";
import { HostRuntime } from "@zturnlibs/runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const invokeKey = tjs.env.ZTRON_INVOKE_KEY ?? "k";

const bootstrap = (next: string) => `
  window.__TAURI_INTERNALS__.invoke(${JSON.stringify(next)}, {}).then(
    () => {}, () => {},
  );`;

const mainHtml = `<!doctype html>
<html><body style="font-family:system-ui;padding:2rem">
  <h1>multiwin main</h1>
  <p id="s">spawning…</p>
  <script>window.__TAURI_INTERNALS__.invoke("spawn", {}).then(
    () => { document.getElementById("s").textContent = "spawned"; },
    (e) => { document.getElementById("s").textContent = "err " + e; },
  );</script>
</body></html>`;

const secondHtml = `<!doctype html>
<html><body style="font-family:system-ui;padding:2rem">
  <h1>multiwin SECOND</h1>
  <p id="s">reporting…</p>
  <script>${bootstrap("second_loaded")}</script>
</body></html>`;

const app = new AppBuilder(runtime, "com.ztron.multiwin")
  .configure({ invokeKey })
  .window({ label: "main", title: "multiwin", width: 480, height: 320, html: mainHtml })
  .setup((app) => {
    app.command("spawn", (_args, ctx) => {
      console.log("[multiwin] spawn received from", ctx.label);
      app.createWindow({
        label: "second",
        title: "second",
        width: 360,
        height: 240,
        html: secondHtml,
      });
      console.log("[multiwin] createWindow returned");
      return { ok: true };
    });
    app.command("stress_ping", (args, ctx) => {
      /* just needs to exist; response races the destroy */
      return { pong: (args as { n?: number }).n ?? -1, from: ctx.label };
    });
    app.command("second_loaded", async (_args, ctx) => {
      console.log("SECOND_WINDOW_OK from label=" + ctx.label);
      if (ctx.label !== "second") {
        console.log("SECOND_LABEL_FAIL: expected second, got " + ctx.label);
        quitMain();
        return;
      }
      const second = app.getWebview("second");
      if (!second) {
        console.log("SECOND_HANDLE_FAIL: no handle");
        quitMain();
        return;
      }
      /* window ops routed by label (host resolves on the GUI thread) */
      second.windowState("minimize");
      second.windowState("unminimize");
      second.setTitle("second-retitled");
      const minimized = await second.windowState("is_minimized");
      console.log("SECOND_OPS_OK minimized=" + String(minimized));
      /* destroy: closes just the second window + registry cleanup */
      setTimeout(() => {
        console.log("SECOND_DESTROY_SENT");
        second.destroy();
        /* Stress: N rounds of create(page spamming invokes) + destroy,
           racing WKWebView's async script-message callbacks — guards the
           UAF fix (handler detached before webview release, DESIGN §76). */
        const spamHtml = (n: number) => `<!doctype html>
<html><body><p>stress ${n}</p></body></html>
<script>
  var n = 0;
  setInterval(function () {
    window.__TAURI_INTERNALS__.invoke("stress_ping", { n: n++ }).catch(function () {});
  }, 25);
</script>`;
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        void (async () => {
          for (let i = 0; i < 10; i++) {
            const label = `stress-${i}`;
            app.createWindow({
              label,
              title: label,
              width: 240,
              height: 120,
              html: spamHtml(i),
            });
            await sleep(600);
            app.getWebview(label)?.destroy();
            await sleep(350);
          }
          // App-lifecycle surface (G2 / core:app parity): drive whole-app
          // show/hide + Dock visibility through the host. Each op must ack
          // without hanging the GUI thread before we quit.
          try {
            runtime.application.show();
            await sleep(80);
            runtime.application.hide();
            await sleep(80);
            runtime.application.setDockVisibility(false);
            await sleep(60);
            runtime.application.setDockVisibility(true);
            await sleep(60);
            runtime.application.show(); /* leave the app visible */
            await sleep(80);
            console.log("APP_LIFECYCLE_OK");
          } catch (e) {
            console.log("APP_LIFECYCLE_FAIL:" + String(e).slice(0, 60));
          }

          console.log("STRESS_OK");
          console.log("MULTI_WINDOW_RUNTIME_OK");
          quitMain();
        })();
      }, 500);
    });
  })
  .build();
/* NOTE: windows register during run(); fetch the handle lazily. */
const quitMain = () => app.getWebview("main")?.terminate();
await app.run().catch((e) => console.log("[multiwin] ERROR", String(e)));
