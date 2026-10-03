/**
 * schemeprobe — ztron:// custom scheme handler verification spike (GAP H5).
 * Requires the host to be spawned with ZTRON_SCHEME_ROOT pointing at a
 * writable directory (ci.sh passes a mktemp -d, converted to a Windows
 * path). Self-driving:
 *
 *   1. backend writes index.html / app.js / style.css into the root (the
 *      scheme mapping reads files per-request, so post-spawn writes are
 *      fine — the page navigates only after app.run());
 *   2. window loads ztron://localhost/ (core appends #ztron-window=main):
 *      document served with text/html          -> SCHEME_PAGE_OK;
 *   3. page pulls app.js via a relative <script src> (subresource under the
 *      custom scheme, no CORS)                 -> SCHEME_SUBRES_OK;
 *   4. page pulls missing.js — 404 fires onerror -> SCHEME_404_OK;
 *   5. backend evals an <link> whose href is
 *      ztron://localhost/asset/<percent-encoded abs path> — the
 *      convertFileSrc branch                   -> SCHEME_ASSET_OK;
 *   6. backend terminates the main webview -> exit 0.
 *
 * Run: ZTRON_SCHEME_ROOT=<dir> ztron check --expect SCHEME_PAGE_OK \
 *        --expect SCHEME_SUBRES_OK --expect SCHEME_404_OK --expect SCHEME_ASSET_OK
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
  writeFile: (path: string, data: string) => Promise<void>;
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const root = tjs.env.ZTRON_SCHEME_ROOT ?? "";
if (!root) {
  console.log("SCHEME_ENV_FAIL:no ZTRON_SCHEME_ROOT");
}

const pageHtml = `<!doctype html>
<html><head><script src="app.js"></script>
<script src="missing.js" onerror="window.__MISSING_ERR__=1"></script></head>
<body><h1>schemeprobe</h1>
<script>
(function () {
  // URL-loaded pages carry no embedded bootstrap: talk to the raw
  // window.__ZTRON_IPC__ envelope the host binds on every webview.
  var ipc = function (cmd, payload) {
    return window.__ZTRON_IPC__({
      cmd: cmd,
      payload: payload,
      __ZTRON_INVOKE_KEY__: "probe",
    });
  };
  window.__assetLoad = function (href) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.onload = function () { ipc("scheme_stage2", { asset: true }).catch(function () {}); };
    l.onerror = function () { ipc("scheme_stage2", { asset: false }).catch(function () {}); };
    l.href = href;
    document.head.appendChild(l);
  };
  setTimeout(function () {
    ipc("scheme_stage1", {
      js: !!window.__SCHEME_JS_OK,
      miss: !!window.__MISSING_ERR__,
      ipc: typeof window.__ZTRON_IPC__,
    }).catch(function () {});
  }, 800);
})();
</script></body></html>`;

const app = new AppBuilder(runtime, "com.ztron.schemeprobe")
  .configure({ invokeKey: "probe" })
  .window({
    label: "main",
    title: "schemeprobe",
    width: 480,
    height: 320,
    url: root ? "ztron://localhost/" : "about:blank",
    html: root ? undefined : "<h1>schemeprobe (no scheme root)</h1>",
  })
  .setup((app) => {
    const main = () => app.getWebview("main");

    app.command("scheme_stage1", (args) => {
      const r = (args ?? {}) as { js?: boolean; miss?: boolean };
      console.log("SCHEME_PAGE_OK");
      console.log(r.js ? "SCHEME_SUBRES_OK" : "SCHEME_SUBRES_FAIL");
      console.log(r.miss ? "SCHEME_404_OK" : "SCHEME_404_FAIL");
      const href =
        "ztron://localhost/asset/" +
        encodeURIComponent(root.replace(/\/+$/, "") + "/style.css");
      main()?.eval(`window.__assetLoad(${JSON.stringify(href)});`);
      return { ok: true };
    });

    app.command("scheme_stage2", (args) => {
      const r = (args ?? {}) as { asset?: boolean };
      console.log(r.asset ? "SCHEME_ASSET_OK" : "SCHEME_ASSET_FAIL");
      console.log("SCHEME_DONE_OK");
      // Settle the reports before tearing the window down.
      setTimeout(() => main()?.terminate(), 300);
      return { ok: true };
    });
  })
  .build();

if (root) {
  await tjs.writeFile(
    root.replace(/\/+$/, "") + "/index.html",
    pageHtml,
  );
  await tjs.writeFile(
    root.replace(/\/+$/, "") + "/app.js",
    "window.__SCHEME_JS_OK = true;",
  );
  await tjs.writeFile(
    root.replace(/\/+$/, "") + "/style.css",
    "body { background: rgb(1,2,3); }",
  );
}
await app.run().catch((e) => console.log("[probe] ERROR", String(e)));
