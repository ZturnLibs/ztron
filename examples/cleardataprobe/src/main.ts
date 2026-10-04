/**
 * cleardataprobe — clearBrowsingData verification spike (GAP H10, win32).
 * Requires ZTRON_SCHEME_ROOT (writable dir; ci.sh mktemp -d's one): the
 * backend writes the probe pages there and the window loads
 * ztron://localhost/ — NavigateToString html: pages get an opaque origin
 * where localStorage throws and cookies are ignored, so real origins are
 * mandatory. URL-loaded pages carry no embedded bootstrap; they talk
 * through the raw window.__ZTRON_IPC__ envelope (schemeprobe pattern).
 *
 * Self-driving:
 *   1. CLEAR_SEED_OK — ztron://localhost/ seeds localStorage("dl")=v
 *      (round-trips through the IPC envelope);
 *   2. HTTP_SEED_OK — a second seed on a REAL http origin (local
 *      tjs.serve): localStorage("hl")=v AND cookie hk=v both take;
 *   3. CLEAR_DATA_OK — after w.clearBrowsingData() (host
 *      webview_clear_data -> ICoreWebView2Profile2::ClearBrowsingDataAll,
 *      cross-checked by a diag pass that also runs the explicit
 *      ClearBrowsingData(kinds) variant) a FRESH-RENDERER window reads
 *      the http origin back as ls=null, ck="".
 *
 * Platform findings this probe documents (WebView2 Runtime 154.0.4258):
 *   - the LIVE document's renderer storage cache survives the clear, so
 *     the reader must be a second webview (fresh renderer process);
 *   - custom-scheme (ztron://) DOM storage is NOT cleared even though
 *     both clear variants report success — the informational
 *     `ztron:// fresh renderer` line shows ls="v" persisting; standard
 *     http(s) origins clear correctly on both channels.
 *
 * Run: ZTRON_SCHEME_ROOT=<dir> ztron check --expect CLEAR_SEED_OK \
 *        --expect HTTP_SEED_OK --expect CLEAR_DATA_OK
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
  writeFile: (path: string, data: string) => Promise<void>;
  serve: (opts: {
    fetch: (req: { url: string }) => unknown;
    port?: number;
  }) => { port: number; close(): Promise<void> | void };
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const root = tjs.env.ZTRON_SCHEME_ROOT ?? "";
if (!root) {
  console.log("CLEAR_ENV_FAIL:no ZTRON_SCHEME_ROOT");
}

const indexHtml = `<!doctype html>
<html><head></head><body><h1>cleardataprobe</h1>
<script>
(function () {
  var ipc = function (cmd, payload) {
    return window.__ZTRON_IPC__({
      cmd: cmd,
      payload: payload,
      __ZTRON_INVOKE_KEY__: "probe",
    });
  };
  try { localStorage.setItem("dl", "v"); } catch (e) {}
  try { document.cookie = "ck=v; path=/"; } catch (e) {}
  function report() {
    var ls = null, ck = "";
    try { ls = localStorage.getItem("dl"); } catch (e) {}
    try { ck = document.cookie; } catch (e) {}
    ipc("dl_state", { ls: ls, ck: ck }).catch(function () {});
  }
  report();
  var n = 60;
  var iv = setInterval(function () { report(); if (--n <= 0) clearInterval(iv); }, 500);
  ipc("run", {}).catch(function () {});
})();
</script></body></html>`;

/* Read-only page: the post-clear navigation lands here. A fresh document
   re-pulls its storage area from the storage backend — if the persistent
   layer was actually cleared, localStorage.getItem("dl") is null even
   though the pre-clear document's in-memory area kept "v" alive. */
const readHtml = `<!doctype html>
<html><head></head><body><h1>cleardataprobe:read</h1>
<script>
(function () {
  var ipc = function (cmd, payload) {
    return window.__ZTRON_IPC__({
      cmd: cmd,
      payload: payload,
      __ZTRON_INVOKE_KEY__: "probe",
    });
  };
  setTimeout(function () {
    var ls = null;
    try { ls = localStorage.getItem("dl"); } catch (e) {}
    ipc("dl_read", { ls: ls }).catch(function () {});
  }, 500);
})();
</script></body></html>`;

type Snap = { ls: string | null; ck: string };
let snap: Snap = { ls: null, ck: "" };
let read: { ls: string | null } | null = null;
let hSeed: { ls: string | null; ck: string } | null = null;
let hRead: { ls: string | null; ck: string } | null = null;

/* http-origin control leg: standard http(s) origin served from a local
   tjs.serve instance — the shape of origin WebView2's clear logic is
   documented and tested against. localStorage AND cookies both work on
   http, so both channels get a real assertion here. */
const hSeedHtml = `<!doctype html>
<html><head></head><body><h1>hseed</h1>
<script>
(function () {
  var n = 0;
  function go() {
    try {
      localStorage.setItem("hl", "v");
      document.cookie = "hk=v; path=/";
      window.__ZTRON_IPC__({
        cmd: "hl_seed",
        payload: {
          ls: localStorage.getItem("hl"),
          ck: document.cookie,
        },
        __ZTRON_INVOKE_KEY__: "probe",
      }).then(function () {}, go);
    } catch (e) {
      if (++n < 6) setTimeout(go, 400);
    }
  }
  setTimeout(go, 300);
})();
</script></body></html>`;

const hReadHtml = `<!doctype html>
<html><head></head><body><h1>hread</h1>
<script>
(function () {
  var n = 0;
  function go() {
    try {
      window.__ZTRON_IPC__({
        cmd: "hl_read",
        payload: {
          ls: localStorage.getItem("hl"),
          ck: document.cookie,
        },
        __ZTRON_INVOKE_KEY__: "probe",
      }).then(function () {}, go);
    } catch (e) {
      if (++n < 6) setTimeout(go, 400);
    }
  }
  setTimeout(go, 300);
})();
</script></body></html>`;

type ClearDiag = {
  ctl: number;
  core: number;
  qi13: number;
  profile: number;
  qi2: number;
  clear: number;
  invoked: number;
  invoke_hr: number;
  clear_kinds: number;
  invoked_kinds: number;
  invoke_hr_kinds: number;
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = new AppBuilder(runtime, "com.ztron.cleardataprobe")
  .configure({ invokeKey: "probe" })
  .window({
    label: "main",
    title: "cleardataprobe",
    width: 480,
    height: 320,
    url: root ? "ztron://localhost/" : "about:blank",
    html: root ? undefined : "<h1>cleardataprobe (no scheme root)</h1>",
  })
  .setup((app) => {
    console.log("[cdprobe] setup registered");

    app.command("dl_state", (args) => {
      const p = (args ?? {}) as Partial<Snap>;
      snap = { ls: p.ls ?? null, ck: p.ck ?? "" };
      return { ok: true };
    });

    app.command("dl_read", (args) => {
      const p = (args ?? {}) as { ls?: string | null };
      read = { ls: p.ls ?? null };
      return { ok: true };
    });

    app.command("hl_seed", (args) => {
      const p = (args ?? {}) as Partial<Snap>;
      hSeed = { ls: p.ls ?? null, ck: p.ck ?? "" };
      return { ok: true };
    });

    app.command("hl_read", (args) => {
      const p = (args ?? {}) as Partial<Snap>;
      hRead = { ls: p.ls ?? null, ck: p.ck ?? "" };
      return { ok: true };
    });

    app.command("run", async () => {
      console.log("[cdprobe] run fired");
      const w = app.getWebview("main");
      const httpBase = `http://127.0.0.1:${server.port}`;

      /* 1: ztron:// seed. localStorage works on the custom scheme; cookies
         do not apply there at all (assignments are ignored), which is why
         the http control leg below carries the cookie assertion. */
      let seededLs = false;
      let seededCk = false;
      let first = "";
      for (let i = 0; i < 24; i++) {
        first = `ls=${JSON.stringify(snap.ls)} ck=${JSON.stringify(snap.ck)}`;
        seededLs = snap.ls === "v";
        seededCk = snap.ck.includes("ck=v");
        if (seededLs) break;
        await sleep(500);
      }
      console.log(
        seededLs
          ? `CLEAR_SEED_OK ls=${seededLs} ck=${seededCk}`
          : `CLEAR_SEED_FAIL ${first}`,
      );
      if (!seededLs) {
        w?.terminate();
        return { ok: true };
      }

      /* 2: http origin seed — localStorage AND cookie are both live on a
         standard origin, so both channels get a real assertion there. */
      hSeed = null;
      w?.loadUrl(`${httpBase}/hseed`);
      let httpSeededLs = false;
      let httpSeededCk = false;
      for (let i = 0; i < 24; i++) {
        await sleep(500);
        if (hSeed) {
          httpSeededLs = hSeed.ls === "v";
          httpSeededCk = hSeed.ck.includes("hk=v");
          if (httpSeededLs && httpSeededCk) break;
        }
      }
      console.log(
        httpSeededLs
          ? `HTTP_SEED_OK ck=${httpSeededCk}`
          : `HTTP_SEED_FAIL ${JSON.stringify(hSeed)}`,
      );
      if (!httpSeededLs) {
        w?.terminate();
        return { ok: true };
      }

      /* 3: production clear -> webview_clear_data -> ClearBrowsingDataAll.
         The LIVE document's in-memory storage area survives (WebView2 keeps
         renderer caches on clear — observed, not assumed), so the
         assertions read a FRESH renderer. */
      w?.clearBrowsingData();

      let liveEverCleared = false;
      let last = "";
      for (let i = 0; i < 6; i++) {
        await sleep(500);
        last = `ls=${JSON.stringify(snap.ls)} ck=${JSON.stringify(snap.ck)}`;
        if (snap.ls !== "v") {
          liveEverCleared = true;
          break;
        }
      }
      console.log(
        `[cdprobe] live doc after clear: ${liveEverCleared ? "evicted" : "kept (renderer cache)"} ${last}`,
      );

      /* 4: diag re-clear (All + explicit site-data kinds) and poll until
         the kinds handler has fired — the reader must observe settled
         state, and the diag line documents every hop's HRESULT. */
      await sleep(1000);
      let d: ClearDiag | null = null;
      for (let i = 0; i < 20; i++) {
        try {
          d = (await sendReq("webview_clear_data_diag")) as ClearDiag;
        } catch {
          break;
        }
        if (d.invoked_kinds === 1) break;
        await sleep(500);
      }
      if (d) {
        console.log(
          `[cdprobe] diag All(invoked=${d.invoked} hr=${d.invoke_hr}) ` +
            `kinds(invoked=${d.invoked_kinds} hr=${d.invoke_hr_kinds} ` +
            `clear_hr=${d.clear_kinds}) hops ctl=${d.ctl} core=${d.core} ` +
            `qi13=${d.qi13} profile=${d.profile} qi2=${d.qi2}`,
        );
      } else {
        console.log("[cdprobe] diag: request failed");
      }

      /* 5: fresh-renderer reads. http origin first — that is the
         assertion surface (CLEAR_DATA_OK); the ztron:// readback is
         informational because this WebView2 runtime demonstrably does
         not clear custom-scheme DOM storage even on success. */
      hRead = null;
      await app.createWindow({
        label: "reader",
        title: "reader",
        width: 360,
        height: 240,
        url: `${httpBase}/hread`,
      });
      let hl: string | null = "pending";
      let hk: string | null = "pending";
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        if (hRead) {
          hl = hRead.ls;
          hk = hRead.ck;
          break;
        }
      }
      const httpCleared = hl === null && !(hk ?? "").includes("hk=v");
      console.log(
        httpCleared
          ? `CLEAR_DATA_OK fresh renderer: http ls=${JSON.stringify(hl)} ck=${JSON.stringify(hk)}`
          : `CLEAR_DATA_FAIL fresh renderer: http ls=${JSON.stringify(hl)} ck=${JSON.stringify(hk)}`,
      );

      read = null;
      app
        .getWebview("reader")
        ?.loadUrl(root ? "ztron://localhost/read.html" : "about:blank");
      let readLs: string | null = "pending";
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        if (read) {
          readLs = read.ls;
          break;
        }
      }
      console.log(
        `[cdprobe] ztron:// fresh renderer ls=${JSON.stringify(readLs)} (informational)`,
      );

      await sleep(300);
      app.getWebview("reader")?.terminate();
      w?.terminate();
      return { ok: true };
    });
  })
  .build();

const htmlResp = (body: string) => {
  const g = globalThis as unknown as {
    Response: new (
      body: string,
      init: { headers: Record<string, string> },
    ) => unknown;
  };
  return new g.Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
const server = tjs.serve({
  fetch: (req) =>
    htmlResp(req.url.includes("/hread") ? hReadHtml : hSeedHtml),
});

if (root) {
  await tjs.writeFile(
    root.replace(/\/+$/, "") + "/index.html",
    indexHtml,
  );
  await tjs.writeFile(
    root.replace(/\/+$/, "") + "/read.html",
    readHtml,
  );
}
await app.run()
  .catch((e) => console.log("[cdprobe] ERROR", String(e)))
  .finally(() => {
    try {
      server.close();
    } catch {
      /* already gone */
    }
  });
