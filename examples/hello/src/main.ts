/**
 * M2 spike — plugin base + restricted capability layer (scoped fs + path).
 *
 * Registers `fsPlugin` (scoped to `$TMP/**`) and `pathPlugin`, then the page
 * exercises: path ops, in-scope file write/read, and an out-of-scope write
 * that must be denied by the PathScope gate.
 *
 * Run: pnpm --filter @ztron/example-hello dev
 */
import { AppBuilder, fsPlugin, pathPlugin } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(`[m2] backend connected to host ${host}:${port}`);

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Ztron M2</title></head>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <h1>Ztron M2 — scoped fs + path</h1>
      <p>path: <span id="p">-</span></p>
      <p>fs: <span id="f">-</span></p>
      <p>deny: <span id="d">-</span></p>
      <p id="status">running...</p>
    </div>
    <script>
      const I = window.__TAURI_INTERNALS__;
      const report = (received) => I.invoke("m2:report", { received });

      async function run() {
        const status = document.getElementById("status");

        // 1. PATH — plugin:path|* (pure string ops)
        const joined = await I.invoke("plugin:path|join", { parts: ["/a", "b", "c"] });
        const base = await I.invoke("plugin:path|basename", { path: "/a/b/c.txt" });
        const ext = await I.invoke("plugin:path|extname", { path: "/a/b/c.txt" });
        document.getElementById("p").textContent = joined + " / " + base + " / " + ext;
        if (joined === "/a/b/c" && base === "c.txt" && ext === ".txt") {
          report("PATH_OK:" + joined);
        }

        // 2. FS — in-scope write + read ($TMP/** allowed)
        await I.invoke("plugin:fs|write_text", { path: "$TMP/ztron_m2.txt", contents: "m2-hello" });
        const data = await I.invoke("plugin:fs|read_text", { path: "$TMP/ztron_m2.txt" });
        document.getElementById("f").textContent = data;
        if (data === "m2-hello") report("FS_OK:" + data);

        // 3. FS — out-of-scope write must be denied by PathScope
        try {
          await I.invoke("plugin:fs|write_text", { path: "/etc/passwd", contents: "x" });
          document.getElementById("d").textContent = "FAIL: was allowed!";
          report("FS_DENY_FAIL");
        } catch (e) {
          document.getElementById("d").textContent = "denied";
          report("FS_DENY_OK");
        }
        status.textContent = "done";
      }

      window.addEventListener("DOMContentLoaded", run);
    </script>
  </body>
</html>`;

const done = new Set<string>();

new AppBuilder(runtime, "com.ztron.hello")
  .plugin(
    fsPlugin({
      scope: {
        allow: ["$TMP/**"],
      },
    }),
  )
  .plugin(pathPlugin())
  .window({
    label: "main",
    title: "Ztron M2",
    width: 800,
    height: 600,
    html,
  })
  .setup((app) => {
    app.command("m2:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[m2] frontend reported: "${received}"`);
      const tag = received?.split(":")[0];
      if (tag) {
        done.add(tag);
      }
      if (done.size >= 3) {
        console.log("SPIKE_RESULT: M2_FS_SCOPE_PATH_OK");
        ctx.webview.terminate();
      }
    });
  })
  .build()
  .run();
