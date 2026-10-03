/**
 * effectprobe — window effects verification spike (GAP H7).
 * Self-driving: the page bootstraps one "run" command; the backend drives
 * the whole sequence and verifies each step against the host's DWM readback
 * (window_effects_query replies {"backdrop","mode","hr","bg_alpha"}):
 *
 *   1. EFFECTS_INIT_OK    — untouched window: backdrop NONE(1), bg opaque;
 *   2. EFFECTS_ACRYLIC_OK — Sidebar -> DWMSBT_TRANSIENTWINDOW(3) and the
 *                           WebView2 default background flipped to alpha 0
 *                           (the backdrop is invisible without that);
 *   3. EFFECTS_MICA_OK    — WindowBackground -> DWMSBT_MAINWINDOW(2);
 *   4. EFFECTS_GLASS_OK   — liquidGlassRegular -> Mica(2) (closest
 *                           Windows-native glass; mac falls back to a
 *                           vibrancy material, Windows to the DWM path);
 *   5. EFFECTS_CLEAR_OK   — clear -> NONE(1), background opaque again;
 *   6. ZTRON_EFFECTS_LEGACY=1 (separate run): the accent path applies —
 *      mode "legacy", background transparent -> EFFECTS_LEGACY_OK.
 *
 * Run: ztron check --expect EFFECTS_INIT_OK --expect EFFECTS_ACRYLIC_OK \
 *        --expect EFFECTS_MICA_OK --expect EFFECTS_GLASS_OK \
 *        --expect EFFECTS_CLEAR_OK
 *      ZTRON_EFFECTS_LEGACY=1 ztron check --expect EFFECTS_LEGACY_OK
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
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
const legacy = !!tjs.env.ZTRON_EFFECTS_LEGACY;

type EffectsQuery = {
  backdrop: number;
  mode: string;
  hr: number;
  bg_alpha: number;
};
const sendReq = (
  runtime as unknown as {
    sendRequest: (
      op: string,
      payload?: Record<string, unknown>,
      from?: string,
    ) => Promise<unknown>;
  }
).sendRequest.bind(runtime);
const query = () => sendReq("window_effects_query") as Promise<EffectsQuery>;

/* Transparent page: in real usage the backdrop shows through wherever the
   content doesn't paint (the host also flips the WebView2 default
   background to alpha 0 when effects apply). The invoke retries — the
   bootstrap script may land after page scripts on slow spawns. */
const page = `<style>html,body{background:transparent;margin:0}</style>
<h1 style="color:#888">effectprobe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[effectprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.effectprobe")
  .configure({ invokeKey })
  .window({ label: "main", title: "effectprobe", width: 480, height: 320, html: page })
  .setup((app) => {
    console.log("[effectprobe] setup registered (legacy=" + legacy + ")");
    app.command("run", async () => {
      console.log("[effectprobe] run fired");
      const w = app.getWebview("main");
      if (!w) {
        console.log("EFFECTS_ENV_FAIL:no main handle");
        return { ok: false };
      }
      const set = (
        material: string,
        extra?: {
          fallback?: string;
          color?: string;
          radius?: number;
          state?: number;
          interactive?: number;
        },
      ) => {
        w.windowState("set_effects", false, { material, ...extra });
      };
      const settle = () => new Promise((r) => setTimeout(r, 300));
      try {
        if (legacy) {
          set("titlebar");
          const q = await query();
          console.log(
            q.mode === "legacy" && q.bg_alpha === 0
              ? "EFFECTS_LEGACY_OK"
              : "EFFECTS_LEGACY_FAIL " + JSON.stringify(q),
          );
          w.windowState("clear_effects");
          await settle();
          w.terminate();
          return { ok: true };
        }
        const q0 = await query();
        console.log(
          /* untouched windows read DWMSBT_AUTO(0) — the system default —
             not NONE(1) (which is what clearEffects restores to). */
          q0.backdrop === 0 && q0.bg_alpha === 255
            ? "EFFECTS_INIT_OK"
            : "EFFECTS_INIT_FAIL " + JSON.stringify(q0),
        );
        set("sidebar");
        const q1 = await query();
        console.log(
          q1.mode === "dwm" && q1.backdrop === 3 && q1.bg_alpha === 0
            ? "EFFECTS_ACRYLIC_OK"
            : "EFFECTS_ACRYLIC_FAIL " + JSON.stringify(q1),
        );
        set("windowBackground");
        const q2 = await query();
        console.log(
          q2.backdrop === 2 && q2.bg_alpha === 0
            ? "EFFECTS_MICA_OK"
            : "EFFECTS_MICA_FAIL " + JSON.stringify(q2),
        );
        set("liquidGlassRegular", {
          fallback: "titlebar",
          color: "#80b0ff",
          radius: 12,
          state: 0,
          interactive: 0,
        });
        const q3 = await query();
        console.log(
          q3.backdrop === 2
            ? "EFFECTS_GLASS_OK"
            : "EFFECTS_GLASS_FAIL " + JSON.stringify(q3),
        );
        w.windowState("clear_effects");
        const q4 = await query();
        console.log(
          q4.backdrop === 1 && q4.bg_alpha === 255
            ? "EFFECTS_CLEAR_OK"
            : "EFFECTS_CLEAR_FAIL " + JSON.stringify(q4),
        );
      } catch (e) {
        console.log("EFFECTS_RUN_FAIL " + String(e).slice(0, 120));
      }
      await settle();
      w.terminate();
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[effectprobe] ERROR", String(e)));
