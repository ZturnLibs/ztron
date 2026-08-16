/**
 * Ztron hello — M3 backend.
 *
 * Two modes:
 *  - With a Vite frontend (CLI sets ZTRON_DEV_URL): loads the dev server URL;
 *    the page uses `@ztron/api` (invoke/events/Channel/fs/path/window).
 *  - Without: falls back to the inline-html M2 spike (scoped fs + path).
 */
import {
  AppBuilder,
  fsPlugin,
  pathPlugin,
  httpPlugin,
  osPlugin,
  storePlugin,
  logPlugin,
  shellPlugin,
  updaterPlugin,
  compareVersions,
  sqlPlugin,
  autostartPlugin,
  windowStatePlugin,
  singleInstancePlugin,
  websocketPlugin,
  localIpPlugin,
  networkPlugin,
  uploadPlugin,
  persistedScopePlugin,
  loadCapabilities,
} from "@ztron/core";
import { greet, add, echo } from "./commands.js";
import { HostRuntime } from "@ztron/runtime-ffi";

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);
const devUrl = tjs.env.ZTRON_SCHEME_URL ?? tjs.env.ZTRON_DEV_URL;
const invokeKey =
  tjs.env.ZTRON_INVOKE_KEY ?? Math.random().toString(36).slice(2);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(
  `[m3] backend connected${devUrl ? `, frontend ${devUrl}` : " (inline html)"}`,
);

const inlineHtml = `<!doctype html>
<html>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h1>Hello Ztron</h1><p id="status">inline-html fallback (no frontend)</p></div>
  </body>
</html>`;

const done = new Set<string>();

// P21: fresh log-file state for every dev run so the spike's rotation
// checks are deterministic (keepOne leaves at most `.log` + `.log.old`).
try {
  const spikeLogDir = `${tjs.homeDir}/Library/Logs/com.ztron.hello`;
  const stale = await tjs.readDir(spikeLogDir);
  for (const e of stale) {
    if (e.name.endsWith(".log") || e.name.includes(".log.")) {
      await tjs.remove(`${spikeLogDir}/${e.name}`);
    }
  }
} catch {
  /* first run: no log dir yet */
}

const capabilities = await loadCapabilities(
  tjs.env.ZTRON_CAPABILITIES_DIR ?? "./capabilities",
);

// Persisted-scope: base fs scope is $TMP/**; pre-seed an extra allow entry so
// the spike can prove a path outside $TMP is granted after a "restart".
// NOTE: the seed must complete BEFORE the plugin is constructed — the plugin
// loads the file in its constructor; a fire-and-forget write here races the
// load and loses on a cold start (file not yet there → scope not applied).
await tjs.writeFile(
  `${tjs.tmpDir}/ztron_persisted_scope.json`,
  new TextEncoder().encode(
    JSON.stringify({ allow: ["$HOME/ztron-persisted-spike/**"] }),
  ),
);

const persisted = persistedScopePlugin({
  file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
  scope: { allow: ["$TMP/**"] },
});
const psScope = persisted.scope;

const confJson = tjs.env.ZTRON_CONF;
const conf = confJson
  ? (JSON.parse(confJson) as Parameters<AppBuilder["fromConfig"]>[0])
  : {};
/* No dev server (offline dev): the declared frontend window falls back to
   the inline spike html. */
if (!devUrl) {
  for (const w of conf.windows ?? []) {
    if (w.url === "frontend") {
      delete w.url;
      w.html = inlineHtml;
    }
  }
}

new AppBuilder(runtime, "com.ztron.hello")
  .configure({ invokeKey, capabilities })
  .fromConfig(conf, {
    frontendUrl: devUrl ?? undefined,
  })
  .plugin(persisted)
  .plugin(fsPlugin({ scope: psScope }))
  .plugin(
    httpPlugin({
      scope: {
        allow: [
          { url: "https://api.github.com/*" },
          { url: "http://localhost:*/*" },
        ],
      },
    }),
  )
  .plugin(pathPlugin({ appId: "com.ztron.hello" }))
  .plugin(
    shellPlugin({
      scope: [
        { program: "echo", args: ["*"] },
        { program: "pwd" },
        { program: "cat" },
        { program: "sh", args: ["**"] },
      ],
    }),
  )
  .plugin(osPlugin())
  .plugin(storePlugin({ scope: { allow: ["$TMP/**"] } }))
  .plugin(
    logPlugin({
      level: "trace",
      targets: ["stdout", "file", "webview"],
      rotationStrategy: "keepOne",
      // Small cap so the spike's 12 pressure lines force several rotations.
      maxFileSize: 400,
    }),
  )
  .plugin(
    updaterPlugin({
      currentVersion: "0.1.0",
      scope: {
        allow: [
          { url: "http://localhost:*/*" },
          { url: "https://httpbin.org/*" },
          { url: "https://api.github.com/*" },
        ],
      },
    }),
  )
  .plugin(sqlPlugin({ scope: { allow: ["$TMP/**"] } }))
  .plugin(autostartPlugin({ id: "com.ztron.hello" }))
  .plugin(
    windowStatePlugin({
      file: `${tjs.tmpDir}/ztron_window_state_test.json`,
      restoreOnStartup: false,
    }),
  )
  .plugin(singleInstancePlugin({ identifier: "com.ztron.hello" }))
  .plugin(websocketPlugin())
  .plugin(localIpPlugin())
  .plugin(networkPlugin())
  .plugin(
    uploadPlugin({
      fileScope: { allow: ["$TMP/**"] },
      urlScope: { allow: [{ url: "http://localhost:*/*" }] },
    }),
  )

  .setup((app) => {
    let reloadTimer: ReturnType<typeof setInterval> | undefined;
    // Local echo server for the upload spike (deterministic, no external dep).
    let echoPort = 0;
    let echoServer: { close(): void } | null = null;
    void (async () => {
      try {
        const server = (await tjs.serve({
          port: 0,
          listenIp: "127.0.0.1",
          fetch: async (req: { text(): Promise<string>; url: string }) => {
            // /stream: a real progressive body — 6 chunks with 45ms gaps so
            // the streaming-fetch spike can prove chunks arrive incrementally
            // (not one buffered blob at the end).
            if (req.url.includes("/stream")) {
              const enc = new TextEncoder();
              const body = new ReadableStream<Uint8Array>({
                async start(c: {
                  enqueue(x: Uint8Array): void;
                  close(): void;
                }) {
                  for (let i = 0; i < 6; i++) {
                    c.enqueue(enc.encode(`part-${i};`));
                    await new Promise((r) => setTimeout(r, 45));
                  }
                  c.close();
                },
              });
              return new Response(body, {
                status: 200,
                headers: { "content-type": "text/plain" },
              });
            }
            const body = await req.text();
            return new Response(body, { status: 200 });
          },
        })) as { port: number; close(): void };
        echoPort = server.port;
        echoServer = server;
      } catch {
        /* non-fatal */
      }
    })();
    app.command("m3:echo-port", () => echoPort);
    // Write a tiny 1x1 PNG for the tray-icon spike (host loads it via NSImage).
    void (async () => {
      try {
        const png = new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63,
          0xfc, 0xcf, 0xc0, 0x50, 0x0f, 0x00, 0x04, 0x85, 0x01, 0x80, 0x84,
          0xa9, 0x8c, 0x21, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
          0xae, 0x42, 0x60, 0x82,
        ]);
        await tjs.writeFile(`${tjs.tmpDir}/ztron_tray_icon.png`, png);
      } catch {
        /* non-fatal */
      }
    })();
    // P2 dev: watch the reload signal file and refresh the page when the CLI
    // rebuilds the frontend (near-HMR; full module HMR needs ztron:// scheme).
    const reloadFile = tjs.env.ZTRON_RELOAD_FILE;
    if (reloadFile && devUrl) {
      let last = "";
      reloadTimer = setInterval(async () => {
        try {
          const bytes = await tjs.readFile(reloadFile);
          const stamp = new TextDecoder().decode(bytes);
          if (stamp !== last) {
            last = stamp;
            app.getWebview("main")?.eval("location.reload()");
            console.log("[dev] frontend changed -> page reloaded");
          }
        } catch {
          /* reload file may not exist yet */
        }
      }, 400);
    }

    // Register typed commands (verified via `ztron codegen`)
    app.commandDef(greet);
    app.commandDef(add);
    app.commandDef(echo);

    app.command("m3:emit-ticks", async () => {
      for (let i = 1; i <= 2; i++) {
        await new Promise((r) => setTimeout(r, 30));
        app.emit("m3:tick", { n: i });
        console.log(`[m3] emitted tick ${i}`);
      }
      return "started";
    });

    app.command("m3:stream", (args, ctx) => {
      const { ch } = args as { ch?: { kind: "channel"; id: number } };
      if (!ch) {
        return "no-channel";
      }
      const handle = ctx.getChannel(ch.id);
      if (!handle) {
        return "no-handle";
      }
      for (let i = 1; i <= 3; i++) {
        handle.send({ n: i });
      }
      handle.end();
      return "streamed";
    });

    app.command("m3:log-rotation", async () => {
      // Trusted backend check (log files are outside the fs scope by design;
      // the log plugin itself owns that directory). Reads sizes of the
      // current file + keepOne backup after the frontend's pressure loop.
      try {
        const dir = `${tjs.homeDir}/Library/Logs/com.ztron.hello`;
        const curStat = await tjs.stat(`${dir}/com.ztron.hello.log`);
        let oldLen = -1;
        try {
          oldLen = (await tjs.stat(`${dir}/com.ztron.hello.log.old`)).size;
        } catch {
          /* no backup yet */
        }
        return { curLen: curStat.size, oldLen };
      } catch {
        return { curLen: -1, oldLen: -1 };
      }
    });

    app.command("m3:has-dialogs", (_args, ctx) => {
      return (
        ctx.app.commands.has("plugin:dialog|open") &&
        ctx.app.commands.has("plugin:dialog|save") &&
        ctx.app.commands.has("plugin:dialog|message")
      );
    });

    app.command("m3:has-process", (_args, ctx) => {
      return (
        ctx.app.commands.has("plugin:process|exit") &&
        ctx.app.commands.has("plugin:process|relaunch")
      );
    });

    // P5: updater spike — serve a local manifest + verify sha256.
    app.command("m3:updater-test", async () => {
      const server = tjs.serve({
        port: 0,
        listenIp: "127.0.0.1",
        fetch: async (req: { url: string }) => {
          if (req.url.includes("latest.json")) {
            return new Response(
              JSON.stringify({
                version: "1.2.0",
                notes: "test update",
                platforms: {
                  darwin: { url: "https://httpbin.org/bytes/16", sha256: "" },
                },
              }),
              { headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("not found", { status: 404 });
        },
      });
      const manifestUrl = `http://127.0.0.1:${server.port}/latest.json`;

      // 1. check: current 0.1.0 vs manifest 1.2.0 -> hasUpdate
      const resp = await fetch(manifestUrl);
      const manifest = JSON.parse(await resp.text()) as { version: string };
      const hasUpdate = compareVersions(manifest.version, "0.1.0") > 0;

      // 2. verify: sha256 of a known file
      const probe = `${tjs.tmpDir}/ztron_updater_probe.txt`;
      await tjs.writeFile(probe, "update-me");
      const bytes = new Uint8Array(await tjs.readFile(probe));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hex = [...new Uint8Array(digest)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const verifyOk =
        hex ===
        "5bf04d1e8b222b899c65ae02ad3e394eab758a3ea4e8d69390b99c80072a8f6a";
      server.close();
      return { hasUpdate, verifyOk };
    });

    app.command("m3:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[m3] frontend reported: "${received}"`);
      const tag = received?.split(":")[0];
      if (tag) {
        done.add(tag);
      }
      // 42 deterministic checks (66 incl. menu-v2 + tray-menu; SECOND_PAGE_OK is the real from the
      // runtime-created window). WIN_EVENT_OK + WIN_QUERY2_OK are bonus: both
      // require the window to become key, which a terminal-launched bare
      // binary cannot reliably do (macOS activation restrictions) — DESIGN §31.
      // NOTIF_PERM_OK + HTTP_STREAM_OK are the final deterministic checks
      // gating FULL_OK (bonus tags can inflate done.size early — DESIGN §88).
      if (done.size >= 81 && done.has("HTTP_STREAM_OK")) {
        console.log(
          "SPIKE_RESULT: FULL_OK (invoke/event/channel/fs/path/http/acl/os/store/log/shell/updater/sql/autostart/clipboard/app/process/websocket/local-ip/network/upload/persisted-scope/win/opacity/transparent/decorations/positioner/window-state/notification/shortcut/single-instance/deep-link/tray/menu/dialog/win-v2-extras/log-rotation)",
        );
        /* Close the echo server so the tjs event loop drains and the backend
           exits once the host run loop stops (otherwise EXIT hangs on the
           listening socket). */
        echoServer?.close();
        /* Stop the near-HMR reload poller so the tjs event loop drains. */
        if (reloadTimer) clearInterval(reloadTimer);
        ctx.webview.terminate();
        /* Exit the backend explicitly: lingering keep-alive sockets
           (updater/upload fetch) would otherwise keep the loop alive. The
           graceful drain path is covered by examples/multiwin. */
        setTimeout(() => tjs.exit(0), 300);
      }
    });
  })
  .build()
  .run();
