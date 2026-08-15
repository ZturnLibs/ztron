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
import { AppBuilder } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

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
        setTimeout(() => {
          console.log("MULTI_WINDOW_RUNTIME_OK");
          console.log("[multiwin] calling terminate");
          quitMain();
          console.log("[multiwin] terminate sent");
        }, 800);
      }, 500);
    });
  })
  .build();
/* NOTE: windows register during run(); fetch the handle lazily. */
const quitMain = () => app.getWebview("main")?.terminate();
await app.run().catch((e) => console.log("[multiwin] ERROR", String(e)));
