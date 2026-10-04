/**
 * themeprobe — set_theme + theme_change push verification spike (GAP H11,
 * win32). Self-driving: the page bootstraps one "run" command; the backend
 * drives:
 *
 *   1. THEME_GET_OK   — window_get_theme answers with the effective theme
 *                       (registry AppsUseLightTheme while no override);
 *   2. THEME_SET_OK   — production setTheme(<flipped>) lands on BOTH hooks
 *                       the mac appearance maps to: DWM title-bar bit
 *                       (DWMWA_USE_IMMERSIVE_DARK_MODE) and the WebView2
 *                       content scheme (Profile2::PreferredColorScheme),
 *                       read back via the theme_diag host-only op;
 *   3. THEME_PUSH_OK  — theme_settingchange_test drives the REAL
 *                       WM_SETTINGCHANGE("ImmersiveColorSet") message path
 *                       through zt_proc (what the OS broadcasts on a
 *                       personalization flip) and the backend-collected
 *                       window event carries theme_change with the
 *                       effective theme. The user's actual global theme is
 *                       NOT flipped — the broadcast is message+string,
 *                       nothing more;
 *   4. THEME_RESET_OK — setTheme(null) re-follows the system: readback
 *                       matches the pre-test system value on both hooks.
 *
 * The onWindowEvent slot is re-bound after build(): core routes it to the
 * page bus; this probe's page listens to nothing, so backend-side capture
 * is lossless (dragdrop-probe pattern).
 *
 * Run: ztron check --expect THEME_GET_OK --expect THEME_SET_OK \
 *        --expect THEME_PUSH_OK --expect THEME_RESET_OK
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

const sendReq = (
  runtime as unknown as {
    sendRequest: (
      op: string,
      payload?: Record<string, unknown>,
      from?: string,
    ) => Promise<unknown>;
  }
).sendRequest.bind(runtime);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ThemeDiag = { dwm: boolean; scheme: number; hr: string };

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">themeprobe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[themeprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.themeprobe")
  .configure({ invokeKey: tjs.env.ZTRON_INVOKE_KEY ?? "k" })
  .window({ label: "main", title: "themeprobe", width: 480, height: 320, html: page })
  .setup((app) => {
    console.log("[themeprobe] setup registered");
    app.command("run", async () => {
      console.log("[themeprobe] run fired");
      const w = app.getWebview("main");

      /* Backend-side theme_change capture (core's slot fans events to the
         page bus; this probe's page listens to nothing). host.ts maps the
         wire name "theme_change" to WindowEvent "theme-change" and passes
         msg.theme as the bare payload string. */
      const themeEvents: string[] = [];
      w?.onWindowEvent((event: unknown, payload: unknown) => {
        if (String(event) !== "theme-change") return;
        themeEvents.push(String(payload ?? ""));
      });

      try {
        /* 1: effective query answers with a real value. */
        const cur = (await sendReq("window_get_theme")) as string;
        if (cur !== "light" && cur !== "dark") {
          console.log(`THEME_GET_FAIL ${JSON.stringify(cur)}`);
          w?.terminate();
          return { ok: true };
        }
        console.log(`THEME_GET_OK ${cur}`);

        /* 2: flip via production setTheme; both hooks must land. */
        const target = cur === "dark" ? "light" : "dark";
        const wantDwm = target === "dark";
        const wantScheme = wantDwm ? 2 : 1;
        w?.setTheme(target as "dark" | "light");
        let diag: ThemeDiag | null = null;
        for (let i = 0; i < 20; i++) {
          await sleep(300);
          diag = (await sendReq("theme_diag")) as ThemeDiag;
          if (diag.dwm === wantDwm && diag.scheme === wantScheme) break;
        }
        const setOk =
          !!diag && diag.dwm === wantDwm && diag.scheme === wantScheme;
        console.log(
          setOk
            ? `THEME_SET_OK ${target}`
            : `THEME_SET_FAIL ${JSON.stringify(diag)}`,
        );

        /* 3: the real WM_SETTINGCHANGE path pushes theme_change app-wide
           with the effective (overridden) theme. */
        await sendReq("theme_settingchange_test");
        let pushed = false;
        for (let i = 0; i < 20; i++) {
          await sleep(300);
          if (themeEvents.includes(target)) {
            pushed = true;
            break;
          }
        }
        console.log(
          pushed
            ? `THEME_PUSH_OK theme=${target}`
            : `THEME_PUSH_FAIL events=${JSON.stringify(themeEvents)}`,
        );

        /* 4: reset follows the system — readback matches the pre-test
           system value on both hooks. */
        w?.setTheme(null);
        const sysDwm = cur === "dark";
        const sysScheme = sysDwm ? 2 : 1;
        let diag2: ThemeDiag | null = null;
        for (let i = 0; i < 20; i++) {
          await sleep(300);
          diag2 = (await sendReq("theme_diag")) as ThemeDiag;
          if (diag2.dwm === sysDwm && diag2.scheme === sysScheme) break;
        }
        const resetOk =
          !!diag2 && diag2.dwm === sysDwm && diag2.scheme === sysScheme;
        console.log(
          resetOk
            ? "THEME_RESET_OK"
            : `THEME_RESET_FAIL ${JSON.stringify(diag2)}`,
        );
      } catch (e) {
        console.log("THEME_RUN_FAIL " + String(e).slice(0, 160));
      }

      await sleep(300);
      w?.terminate();
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[themeprobe] ERROR", String(e)));
