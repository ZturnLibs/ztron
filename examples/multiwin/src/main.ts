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
import { AppBuilder, detectPlatform } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

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
  window.__ZTRON_INTERNALS__.invoke(${JSON.stringify(next)}, {}).then(
    () => {}, () => {},
  );`;

const mainHtml = `<!doctype html>
<html><body style="font-family:system-ui;padding:2rem">
  <h1>multiwin main</h1>
  <p id="s">spawning…</p>
  <script>window.__ZTRON_INTERNALS__.invoke("spawn", {}).then(
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
    window.__ZTRON_INTERNALS__.invoke("stress_ping", { n: n++ }).catch(function () {});
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
          // show/hide + Dock visibility through the host. Windows (GAP H15)
          // adds REAL assertions: hide must unmap every window, show must
          // bring main back, and the dock switch must toggle the
          // taskbar-skip style (host-only app_diag readback). mac keeps
          // the smoke-only contract here.
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
            // GAP H18: badge / cursor grab / visible-on-all-workspaces.
            // Public-API ack smoke on both platforms (mac implements them
            // against the dock tile / CG / collectionBehavior); the real
            // assertions live in the windows block below via host-only
            // probes (SetOverlayIcon / ClipCursor / WS_EX_TOPMOST).
            const mainWin = app.getWebview("main") as unknown as {
              setBadgeCount(count: number | null): Promise<void>;
              setBadgeLabel(label: string | null): Promise<void>;
              windowState(
                op: string,
                v?: boolean,
              ): boolean | Promise<boolean> | null;
            };
            await mainWin.setBadgeCount(3);
            await mainWin.setBadgeLabel("hi");
            await mainWin.setBadgeCount(null);
            await mainWin.setBadgeLabel(null);
            await mainWin.windowState("set_cursor_grab", true);
            await mainWin.windowState("set_cursor_grab", false);
            await mainWin.windowState("set_visible_on_all_workspaces", true);
            await mainWin.windowState("set_visible_on_all_workspaces", false);
            if (detectPlatform() === "windows") {
              const sendReq = (
                runtime as unknown as {
                  sendRequest: (
                    op: string,
                    payload?: Record<string, unknown>,
                  ) => Promise<unknown>;
                }
              ).sendRequest.bind(runtime);
              type Diag = { visible?: boolean; toolwindow?: boolean };
              type St = { visible: boolean } | null | undefined;
              const state = (): Promise<St> =>
                (
                  app.getWebview("main") as unknown as
                    | { getWindowState(): Promise<St> }
                    | undefined
                )?.getWindowState() ?? Promise.resolve(null);
              runtime.application.hide();
              await sleep(250);
              const s1 = await state();
              if (!s1 || s1.visible) {
                throw new Error("hide:left-visible:" + JSON.stringify(s1));
              }
              runtime.application.show();
              await sleep(250);
              const s2 = await state();
              if (!s2 || !s2.visible) {
                throw new Error("show:still-hidden:" + JSON.stringify(s2));
              }
              const d0 = (await sendReq("app_diag")) as Diag | null;
              if (!d0 || d0.toolwindow !== false) {
                throw new Error("dock:baseline:" + JSON.stringify(d0));
              }
              runtime.application.setDockVisibility(false);
              await sleep(200);
              const d1 = (await sendReq("app_diag")) as Diag | null;
              if (!d1 || d1.toolwindow !== true) {
                throw new Error("dock:no-skip:" + JSON.stringify(d1));
              }
              runtime.application.setDockVisibility(true);
              await sleep(200);
              const d2 = (await sendReq("app_diag")) as Diag | null;
              if (!d2 || d2.toolwindow !== false) {
                throw new Error("dock:stuck-skip:" + JSON.stringify(d2));
              }
              // GAP H16: DefaultBackgroundColor is what shows through the
              // page — the multiwin pages set no CSS background, so the
              // webview surface color lands on the pixels directly.
              // bg_probe samples via PrintWindow(PW_RENDERFULLCONTENT),
              // immune to CI window stacking.
              type Px = { r?: number; g?: number; b?: number } | null;
              const probe = (): Promise<Px> =>
                sendReq("bg_probe") as Promise<Px>;
              const near = (v: number | undefined, want: number) =>
                typeof v === "number" && Math.abs(v - want) <= 14;
              const win =
                app.getWebview("main") as unknown as {
                  setBackgroundColor(color: string): Promise<void>;
                };
              const b0 = await probe();
              if (!b0 || !near(b0.r, 255) || !near(b0.g, 255) || !near(b0.b, 255)) {
                throw new Error("bg:baseline:" + JSON.stringify(b0));
              }
              await win.setBackgroundColor("#204060");
              await sleep(400);
              const b1 = await probe();
              if (!b1 || !near(b1.r, 0x20) || !near(b1.g, 0x40) || !near(b1.b, 0x60)) {
                throw new Error("bg:set:" + JSON.stringify(b1));
              }
              await win.setBackgroundColor("transparent");
              await sleep(200); /* ack-only: alpha has no GDI readback */

              // GAP H18 windows assertions (host-only probe readbacks).
              // Badge: SetOverlayIcon has no getter — render through the
              // real path, accept, clear; S_OK is the observable.
              type Bdg = {
                mk1?: number;
                mk3?: number;
                set?: number;
                clear?: number;
              };
              const bd = (await sendReq("badge_probe")) as Bdg | null;
              if (
                !bd ||
                bd.mk1 !== 1 ||
                bd.mk3 !== 1 ||
                bd.set !== 0 ||
                bd.clear !== 0
              ) {
                throw new Error("badge:" + JSON.stringify(bd));
              }
              // Cursor grab: the clip rect must equal the window rect while
              // grabbed, and fall back to the virtual screen on release.
              // (Set/read/clear/read happens inside ONE host handler, so
              // the desktop-global ClipCursor lives for microseconds.)
              type R4 = number[];
              const eq4 = (a: R4 | undefined, b: R4 | undefined) =>
                !!a && !!b && a.length === 4 && b.length === 4 &&
                a.every((v, i) => v === b[i]);
              const gp = (await sendReq("grab_probe")) as {
                win?: R4;
                clip?: R4;
                free?: R4;
                vs?: R4;
              } | null;
              if (!eq4(gp?.clip, gp?.win)) {
                throw new Error("grab:clip:" + JSON.stringify(gp));
              }
              if (!eq4(gp?.free, gp?.vs)) {
                throw new Error("grab:free:" + JSON.stringify(gp));
              }
              // All-workspaces: the live topmost bit flips with the op.
              type Ws = { topmost?: number } | null;
              await mainWin.windowState("set_visible_on_all_workspaces", true);
              await sleep(150);
              const w1 = (await sendReq("ws_probe")) as Ws;
              if (!w1 || w1.topmost !== 1) {
                throw new Error("ws:on:" + JSON.stringify(w1));
              }
              await mainWin.windowState("set_visible_on_all_workspaces", false);
              await sleep(150);
              const w2 = (await sendReq("ws_probe")) as Ws;
              if (!w2 || w2.topmost !== 0) {
                throw new Error("ws:off:" + JSON.stringify(w2));
              }
            }
            console.log("BG_COLOR_OK"); /* windows: asserted above; mac: smoke */
            console.log("BADGE_OK"); /* windows: asserted above; mac: smoke */
            console.log("GRAB_OK"); /* windows: asserted above; mac: smoke */
            console.log("ALLWS_OK"); /* windows: asserted above; mac: smoke */
            console.log("APP_LIFECYCLE_OK");
          } catch (e) {
            console.log("APP_LIFECYCLE_FAIL:" + String(e).slice(0, 120));
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
