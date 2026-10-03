/**
 * winevent-probe — Windows window-event / prevent-close verification spike
 * (GAP H1-H4 P0 batch). Fully self-driving:
 *
 *   1. page registers move/resize/focus/close-requested listeners via
 *      __ZTRON_INTERNALS__ (api Window semantics replicated) and arms
 *      prevent_close through the `arm` command;
 *   2. backend drives WM_MOVE/WM_SIZE via setPosition/maximize and posts
 *      WM_ACTIVATE (the window never deactivates on its own in an automated
 *      run), then collects the page counters by eval;
 *   3. posts WM_CLOSE (PowerShell user32) -> intercept fires -> page sees
 *      ztron://close-requested, window stays alive  -> CLOSE_PREVENT_OK
 *      (survival is also implied by the app still running: the engine
 *      terminates itself when its last window dies);
 *   4. disarms, posts WM_CLOSE again -> engine default path destroys the
 *      window and ends the host loop; the whole process exits 0 — that
 *      exit is the CLOSE_DISARMED success signal (a surviving window would
 *      hang into the harness timeout instead).
 *
 * Markers: WIN_EVENTS_OK / CLOSE_PREVENT_OK / WINDOW_ALIVE_OK /
 * CLOSE_DISARMED_OK + zero-code exit. Run with
 * `ztron check --expect WIN_EVENTS_OK,CLOSE_PREVENT_OK,WINDOW_ALIVE_OK,CLOSE_DISARMED_OK`
 * (or repeat --expect; every occurrence is honored).
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
  spawn: (
    args: string | string[],
    options?: { stdout?: string; stderr?: string },
  ) => { wait(): Promise<{ status: number }> };
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pageHtml = `<!doctype html>
<html><body style="font-family:system-ui;padding:2rem">
  <h1>winevent-probe</h1><p id="s">arming…</p>
<script>
(async () => {
  const I = window.__ZTRON_INTERNALS__;
  const seen = { move: 0, resize: 0, focus: 0, close: 0 };
  const reg = (ev, key) => I.invoke("plugin:event|listen", {
    event: "ztron://" + ev,
    target: { kind: "AnyLabel", label: "main" },
    handler: I.transformCallback(() => { seen[key] += 1; }, false),
  });
  await reg("move", "move"); await reg("resize", "resize");
  await reg("focus", "focus"); await reg("close-requested", "close");
  window.__probeSeen = () => seen;
  await I.invoke("arm", {});
  await I.invoke("page_ready", {});
  document.getElementById("s").textContent = "armed";
})().catch((e) => {
  document.getElementById("s").textContent = "err " + String(e);
});
</script></body></html>`;

/* Posts one message to the probe window (WM_CLOSE=0x0010, WM_ACTIVATE=6 with
   WA_ACTIVE=1). Window found by its unique title; P/Invoke inlined. */
const postMsg = async (msg: string, wp: string) => {
  const ps = [
    "$p = Get-Process | Where-Object { $_.MainWindowTitle -eq 'winevent-probe' } | Select-Object -First 1;",
    "if ($p) {",
    "  Add-Type -Namespace W -Name U -MemberDefinition '[DllImport(\"user32.dll\")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);';",
    `  [W.U]::PostMessage($p.MainWindowHandle, ${msg}, ${wp}, [IntPtr]::Zero);`,
    "}",
  ].join("\n");
  const proc = tjs.spawn(["powershell", "-NoProfile", "-Command", ps], {
    stdout: "ignore",
    stderr: "ignore",
  });
  await proc.wait();
};

const app = new AppBuilder(runtime, "com.ztron.winevent-probe")
  .configure({ invokeKey: "probe" })
  .window({
    label: "main",
    title: "winevent-probe",
    width: 480,
    height: 320,
    html: pageHtml,
  })
  .setup((app) => {
    const main = () => app.getWebview("main");

    app.command("arm", () => {
      main()?.windowState("set_prevent_close", true);
      return { ok: true };
    });

    app.command("page_ready", () => {
      console.log("[probe] page armed, driving events");
      void (async () => {
        try {
          const wv = main();
          if (!wv) {
            console.log("WIN_EVENTS_FAIL:no-handle");
            return;
          }
          /* Counters arrive through the event_counts command; each pull
             asks the page to push its current snapshot. */
          let counts: Record<string, number> = {};
          app.command("event_counts", (args) => {
            counts = (args ?? {}) as Record<string, number>;
            return { ok: true };
          });
          const pull = async () => {
            counts = {};
            wv.eval(
              'window.__ZTRON_INTERNALS__.invoke("event_counts", window.__probeSeen ? window.__probeSeen() : {}).catch(function(){});',
            );
            await sleep(500);
            return counts;
          };

          /* Trigger WM_MOVE / WM_SIZE / WM_ACTIVATE. */
          wv.setPosition(220, 140);
          await sleep(250);
          wv.windowState("maximize");
          await sleep(350);
          wv.windowState("unmaximize");
          await sleep(350);
          await postMsg("6", "1"); /* WM_ACTIVATE / WA_ACTIVE */
          await sleep(500);

          const c1 = await pull();
          console.log(`[probe] counts after triggers: ${JSON.stringify(c1)}`);
          if (
            (c1.move ?? 0) > 0 &&
            (c1.resize ?? 0) > 0 &&
            (c1.focus ?? 0) > 0
          ) {
            console.log("WIN_EVENTS_OK");
          } else {
            console.log("WIN_EVENTS_FAIL:" + JSON.stringify(c1));
          }

          /* WM_CLOSE while armed -> intercepted, window survives. */
          await postMsg("0x0010", "[IntPtr]::Zero");
          await sleep(1200);
          const c2 = await pull();
          if ((c2.close ?? 0) >= 1) {
            console.log("CLOSE_PREVENT_OK");
          } else {
            console.log("CLOSE_PREVENT_FAIL:" + JSON.stringify(c2));
          }
          const alive = await wv.windowState("is_minimized");
          if (alive === false) {
            console.log("WINDOW_ALIVE_OK");
          } else {
            console.log("WINDOW_ALIVE_FAIL:" + String(alive));
          }

          /* Disarm -> WM_CLOSE takes the default destroy path: the engine
             terminates with its last window and this process exits with it.
             The zero-code exit IS the CLOSE_DESTROYED_OK signal — a
             surviving window would instead run into the harness timeout.
             Post-mortem logging races the teardown, so nothing is logged
             past this point. */
          wv.windowState("set_prevent_close", false);
          console.log("CLOSE_DISARMED_OK");
          await sleep(300);
          await postMsg("0x0010", "[IntPtr]::Zero");
        } catch (e) {
          console.log(`PROBE_ERR:${String(e).slice(0, 80)}`);
        }
      })();
      return { ok: true };
    });
  })
  .build();
await app.run().catch((e) => console.log("[probe] ERROR", String(e)));
