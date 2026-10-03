/**
 * permissionprobe — webview permission bridge verification spike (GAP H6).
 * Requires the host to be spawned with ZTRON_SCHEME_ROOT (ci.sh passes a
 * mktemp -d): getUserMedia needs a secure context, and the registered
 * ztron:// scheme is TreatAsSecure while html-string windows are opaque
 * about:blank origins with no navigator.mediaDevices. Self-driving:
 *
 *   1. page (ztron://localhost/) requests the CAMERA
 *      -> host bridge emits permission_request(camera, url, label)
 *      -> PERM_REQ_OK (kind/url/label all present);
 *   2. backend answers "deny" -> getUserMedia rejects with NotAllowedError
 *      -> PERM_DENY_OK;
 *   3. backend evals a MICROPHONE request -> second permission_request,
 *      backend answers "allow" -> the stream opens (or fails with anything
 *      but NotAllowedError: the decision path is under test, not device
 *      presence) -> PERM_ALLOW_OK; camera+microphone both seen
 *      -> PERM_KINDS_OK;
 *   4. PERM_DONE_OK, terminate the main webview -> exit 0.
 *
 * Run: ZTRON_SCHEME_ROOT=<dir> ztron check --expect PERM_REQ_OK \
 *        --expect PERM_DENY_OK --expect PERM_ALLOW_OK --expect PERM_KINDS_OK
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
  console.log("PERM_ENV_FAIL:no ZTRON_SCHEME_ROOT");
}

const pageHtml = `<!doctype html>
<html><body><h1>permissionprobe</h1>
<script>
(function () {
  var ipc = function (cmd, payload) {
    return window.__ZTRON_IPC__({
      cmd: cmd,
      payload: payload,
      __ZTRON_INVOKE_KEY__: "perm",
    });
  };
  var ask = function (constraint) {
    return navigator.mediaDevices.getUserMedia(constraint).then(
      function (s) {
        var t = s.getTracks()[0];
        if (t) t.stop();
        return { ok: true, name: "" };
      },
      function (e) {
        return { ok: false, name: (e && e.name) || String(e) };
      }
    );
  };
  window.__stage2 = function () {
    ask({ audio: true }).then(function (r) {
      ipc("perm_stage2", r).catch(function () {});
    });
  };
  setTimeout(function () {
    ask({ video: true }).then(function (r) {
      ipc("perm_stage1", r).catch(function () {});
    });
  }, 800);
})();
</script></body></html>`;

const seenKinds = new Set<string>();
let permCount = 0;

const app = new AppBuilder(runtime, "com.ztron.permissionprobe")
  .configure({ invokeKey: "perm" })
  .onPermissionRequest((req) => {
    permCount++;
    seenKinds.add(req.kind);
    if (permCount === 1) {
      const shaped =
        req.kind === "camera" &&
        typeof req.url === "string" &&
        req.url.length > 0 &&
        req.label === "main";
      console.log(
        shaped
          ? "PERM_REQ_OK"
          : "PERM_REQ_FAIL kind=" + req.kind + " url=" + req.url +
              " label=" + req.label,
      );
    }
    req.respond(permCount === 1 ? "deny" : "allow");
  })
  .window({
    label: "main",
    title: "permissionprobe",
    width: 480,
    height: 320,
    url: root ? "ztron://localhost/" : "about:blank",
    html: root ? undefined : "<h1>permissionprobe (no scheme root)</h1>",
  })
  .setup((app) => {
    const main = () => app.getWebview("main");

    app.command("perm_stage1", (args) => {
      const r = (args ?? {}) as { ok?: boolean; name?: string };
      console.log(
        !r.ok && r.name === "NotAllowedError"
          ? "PERM_DENY_OK"
          : "PERM_DENY_FAIL " + JSON.stringify(r),
      );
      main()?.eval("window.__stage2 && window.__stage2();");
      return { ok: true };
    });

    app.command("perm_stage2", (args) => {
      const r = (args ?? {}) as { ok?: boolean; name?: string };
      const allowWorked = !!r.ok || r.name !== "NotAllowedError";
      console.log(
        allowWorked
          ? "PERM_ALLOW_OK"
          : "PERM_ALLOW_FAIL " + JSON.stringify(r),
      );
      console.log(
        seenKinds.has("camera") && seenKinds.has("microphone")
          ? "PERM_KINDS_OK"
          : "PERM_KINDS_FAIL camera=" + seenKinds.has("camera") +
              " mic=" + seenKinds.has("microphone"),
      );
      console.log("PERM_DONE_OK");
      // Settle the reports before tearing the window down.
      setTimeout(() => main()?.terminate(), 300);
      return { ok: true };
    });
  })
  .build();

if (root) {
  await tjs.writeFile(root.replace(/\/+$/, "") + "/index.html", pageHtml);
}
await app.run().catch((e) => console.log("[perm] ERROR", String(e)));
