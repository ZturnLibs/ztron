/**
 * deeplinkprobe — ztron:// deep-link verification spike (GAP H8/H9, win32).
 * Self-driving: the page bootstraps one "run" command; the backend drives:
 *
 *   1. DEEPLINK_REG_OK    — HKCU\Software\Classes\ztron\shell\open\command
 *                           reads back as "<this exe>" "%1" (the claim the
 *                           OS acts on for every activation);
 *   2. DEEPLINK_LINE_OK   — deeplink_emit_test drives the production
 *                           emitter -> deep_link wire line -> controller;
 *   3. DEEPLINK_HOT_OK    — the REAL OS leg: `start ztron://ci-hot-*` makes
 *                           Windows spawn a second host via the registry
 *                           command; that process forwards the URL over
 *                           WM_COPYDATA to this (running) instance and
 *                           exits before binding anything.
 *
 * The runtime deepLink slot is deliberately re-bound after build(): core
 * registered it to fan events out to the page bus; this probe's page
 * listens to nothing, so backend-side capture is lossless.
 *
 * Run: ztron check --expect DEEPLINK_REG_OK --expect DEEPLINK_LINE_OK \
 *        --expect DEEPLINK_HOT_OK
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
  spawn: (
    cmd: string[],
    opts?: Record<string, unknown>,
  ) => { wait(): Promise<{ exit_status?: number }> };
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const invokeKey = tjs.env.ZTRON_INVOKE_KEY ?? "k";

const sendReq = (
  runtime as unknown as {
    sendRequest: (
      op: string,
      payload?: Record<string, unknown>,
      from?: string,
    ) => Promise<unknown>;
  }
).sendRequest.bind(runtime);

type RegistryQuery = { command: string | null };
const HOT_URL_TAG = "ci-hot-" + Math.floor(Math.random() * 1e6);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">deeplinkprobe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[dlprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.deeplinkprobe")
  .configure({ invokeKey })
  .window({ label: "main", title: "deeplinkprobe", width: 480, height: 320, html: page })
  .setup((app) => {
    console.log("[dlprobe] setup registered");
    app.command("run", async () => {
      console.log("[dlprobe] run fired");

      /* Re-bind the runtime deepLink slot (core fans events to the page
         bus; this probe captures backend-side instead). */
      const urls: string[] = [];
      runtime.deepLink.onEvent((url) => urls.push(url));
      const waitUrl = async (needle: string, tries = 24) => {
        for (let i = 0; i < tries; i++) {
          if (urls.some((u) => u.includes(needle))) return true;
          await sleep(250);
        }
        return false;
      };

      try {
        /* 1: the registry claim the OS acts on. */
        const reg = (await sendReq("deeplink_registry_query")) as RegistryQuery;
        const cmd = reg?.command ?? "";
        const shapeOk =
          cmd.includes("ztron-host.exe") && cmd.includes("%1") &&
          cmd.includes('"');
        console.log(
          shapeOk ? "DEEPLINK_REG_OK" : `DEEPLINK_REG_FAIL command=${cmd}`,
        );

        /* 2: production emitter -> wire line -> controller. */
        await sendReq("deeplink_emit_test", { url: "ztron://line-spike" });
        console.log(
          (await waitUrl("line-spike"))
            ? "DEEPLINK_LINE_OK"
            : "DEEPLINK_LINE_FAIL: no deep_link line arrived",
        );

        /* 3: the real OS leg — registry command spawns a second host. */
        const proc = tjs.spawn(
          ["cmd.exe", "/c", "start", "", `ztron://${HOT_URL_TAG}`],
          { stdout: "ignore", stderr: "ignore" },
        );
        await proc.wait();
        console.log(
          (await waitUrl(HOT_URL_TAG))
            ? "DEEPLINK_HOT_OK"
            : `DEEPLINK_HOT_FAIL: ztron://${HOT_URL_TAG} never arrived (urls=${JSON.stringify(urls)})`,
        );
      } catch (e) {
        console.log("DEEPLINK_RUN_FAIL " + String(e).slice(0, 160));
      }

      await sleep(300);
      const w = app.getWebview("main");
      w?.terminate();
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[dlprobe] ERROR", String(e)));
