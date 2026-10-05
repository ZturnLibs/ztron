/**
 * siprobe — single-instance argv forwarding spike (GAP H22, win32).
 * Self-driving: the page bootstraps one "run" command; the backend drives:
 *
 *   1. SIPROBE_PRIMARY_OK    — this instance is past plugin setup with the
 *                              instance port bound (a secondary exits during
 *                              setup — run() does setups before windows —
 *                              so anything that reaches `run` is primary);
 *   2. SIPROBE_SECOND_EXIT_OK — the packed launcher, spawned as a second
 *                              instance with marker args from a different
 *                              cwd, exits 0 right after forwarding (upstream
 *                              parity: a secondary never outlives its
 *                              forward);
 *   3. SIPROBE_FWD_OK        — the primary receives the secondary's real
 *                              argv (launcher command line → backend
 *                              tjs.args) and cwd (the spawn cwd).
 *
 * The packed app under dist/ZtronApp must exist first: the ci leg runs
 * `ztron build`, then this check. The secondary is the full packed chain
 * (launcher → host+backend), so the launcher-argv path is exercised, not
 * just plugin-level forwarding.
 *
 * app.emit is deliberately monkey-patched in setup: core fans plugin events
 * out to the page bus only (EventManager), and this probe's page listens to
 * nothing, so backend-side capture is lossless (same trick as the
 * deeplinkprobe runtime-slot re-bind).
 *
 * Run: ztron check --expect SIPROBE_PRIMARY_OK --expect SIPROBE_SECOND_EXIT_OK
 *        --expect SIPROBE_FWD_OK
 */
import { AppBuilder, singleInstancePlugin } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
  cwd: string;
  exit: (code: number) => never;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* The packed launcher of this example's dist/. `ztron check` runs the dev
   backend with cwd = the project dir, so this resolves under the example. */
const LAUNCHER =
  tjs.cwd.replace(/[\\/]+$/, "") +
  "\\dist\\ZtronApp\\ztron-launcher.exe";

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">siprobe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[siprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.siprobe")
  .configure({ invokeKey })
  .window({ label: "main", title: "siprobe", width: 480, height: 320, html: page })
  .plugin(singleInstancePlugin({ identifier: "com.ztron.siprobe" }))
  .setup((app) => {
    console.log("[siprobe] setup registered");

    /* Backend-side capture of the plugin's app.emit (see header comment). */
    const captured: { argv: string[]; cwd: string }[] = [];
    const real = app.emit.bind(app);
    (app as unknown as { emit: (e: string, p?: unknown) => void }).emit = (
      e: string,
      p?: unknown,
    ) => {
      if (e === "ztron://single-instance") {
        captured.push(p as { argv: string[]; cwd: string });
      }
      real(e, p);
    };

    app.command("run", async () => {
      console.log("SIPROBE_PRIMARY_OK");
      try {
        /* The real packed chain as a second instance, with marker args and
           a distinct cwd (the secondary must report it, not its default). */
        const proc = tjs.spawn(
          [LAUNCHER, "--siprobe-marker", "second arg"],
          { cwd: "C:\\", stdout: "ignore", stderr: "ignore" },
        );
        const st = await proc.wait();
        console.log(
          st.exit_status === 0
            ? "SIPROBE_SECOND_EXIT_OK"
            : `SIPROBE_SECOND_EXIT_FAIL code=${st.exit_status}`,
        );

        /* The POST that precedes the secondary's exit already delivered the
           payload; poll anyway so a slow primary never false-negatives. */
        for (let i = 0; i < 24 && captured.length === 0; i++) {
          await sleep(250);
        }
        const fwd = captured[0];
        const argvOk =
          JSON.stringify(fwd?.argv) ===
          JSON.stringify(["--siprobe-marker", "second arg"]);
        const cwdOk =
          (fwd?.cwd ?? "").replace(/[\\/]+$/, "").toLowerCase() === "c:";
        console.log(
          argvOk && cwdOk
            ? `SIPROBE_FWD_OK argv=${JSON.stringify(fwd.argv)} cwd=${fwd.cwd}`
            : `SIPROBE_FWD_FAIL argv=${JSON.stringify(fwd?.argv ?? null)} cwd=${fwd?.cwd ?? null}`,
        );
      } catch (e) {
        console.log("SIPROBE_RUN_FAIL " + String(e).slice(0, 160));
      }

      await sleep(300);
      const w = app.getWebview("main");
      w?.terminate();
      /* The single-instance plugin's listening socket keeps the tjs event
         loop alive after the webview is down — exit explicitly (hello
         precedent: lingering serve sockets never drain on their own). */
      setTimeout(() => tjs.exit(0), 300);
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[siprobe] ERROR", String(e)));
