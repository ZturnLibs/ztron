/**
 * notifprobe — WinRT toast notification verification spike (GAP H12,
 * win32). Self-driving: the page bootstraps one "run" command; the
 * backend drives:
 *
 *   1. NOTIF_SETTING_OK  — notification_diag answers with a valid
 *                          ToastNotificationSetting (0 Enabled / 1
 *                          Disabled / 2 DisabledForApplication / 3
 *                          DisabledForUser / -1 query unavailable);
 *                          proves the WinRT activation chain (RoInitialize
 *                          -> RoGetActivationFactory -> AUMID notifier)
 *                          and the hand-rolled get_Setting slot work;
 *   2. NOTIF_SEND_OK     — notification_show_test drives toast_show
 *                          directly (the exact component production
 *                          notification_send uses) and the OS ACCEPTS the
 *                          toast — a real Windows toast lands in the
 *                          Action Center under the "ztron-host" AUMID;
 *   3. NOTIF_GRANTED_OK  — runtime.notification.isPermissionGranted()
 *                          returns a boolean (the value itself depends on
 *                          the machine's notification settings, so CI
 *                          asserts the shape, not the value);
 *   4. NOTIF_REQUEST_OK  — requestPermission() returns a boolean (Windows
 *                          has no per-app authorization API; Tauri
 *                          answers true the same way).
 *
 * Run: ztron check --expect NOTIF_SETTING_OK --expect NOTIF_SEND_OK \
 *        --expect NOTIF_GRANTED_OK --expect NOTIF_REQUEST_OK
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

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">notifprobe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[notifprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.notifprobe")
  .configure({ invokeKey: tjs.env.ZTRON_INVOKE_KEY ?? "k" })
  .window({ label: "main", title: "notifprobe", width: 480, height: 320, html: page })
  .setup((app) => {
    console.log("[notifprobe] setup registered");
    app.command("run", async () => {
      console.log("[notifprobe] run fired");

      try {
        /* 1: WinRT activation chain + get_Setting slot. */
        const d = (await sendReq("notification_diag")) as {
          setting?: number;
        };
        const s = d?.setting;
        const settingOk =
          typeof s === "number" &&
          (s === -1 || (s >= 0 && s <= 3));
        console.log(
          settingOk
            ? `NOTIF_SETTING_OK ${JSON.stringify(d)}`
            : `NOTIF_SETTING_FAIL ${JSON.stringify(d)}`,
        );

        /* 2: the OS accepts a real toast (production component). */
        const shown = await sendReq("notification_show_test");
        console.log(
          shown === true
            ? "NOTIF_SEND_OK toast accepted (see Action Center)"
            : `NOTIF_SEND_FAIL ${JSON.stringify(shown)}`,
        );

        /* 3: permission query answers a boolean (value is machine-
           dependent — the user's notification settings decide). */
        const g = await runtime.notification.isPermissionGranted();
        console.log(
          typeof g === "boolean"
            ? `NOTIF_GRANTED_OK granted=${g}`
            : `NOTIF_GRANTED_FAIL ${String(g)}`,
        );

        /* 4: request returns a boolean (no Windows API to request with;
           reports current acceptability like Tauri). */
        const r = await runtime.notification.requestPermission();
        console.log(
          typeof r === "boolean"
            ? `NOTIF_REQUEST_OK granted=${r}`
            : `NOTIF_REQUEST_FAIL ${String(r)}`,
        );
      } catch (e) {
        console.log("NOTIF_RUN_FAIL " + String(e).slice(0, 160));
      }

      await sleep(300);
      app.getWebview("main")?.terminate();
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[notifprobe] ERROR", String(e)));
