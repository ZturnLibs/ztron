/**
 * Ztron Showcase 后端：注册 demo 涉及的全部插件 + showcase:* 命令。
 * 结构与 examples/hello 同构，命令清单见仓库 docs 的 showcase 章节。
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
  sqlPlugin,
  autostartPlugin,
  windowStatePlugin,
  singleInstancePlugin,
  websocketPlugin,
  localIpPlugin,
  networkPlugin,
  loadCapabilities,
} from "@zturnlibs/ztron-core";
import { greet, add, echo } from "./commands.js";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);
const devUrl = tjs.env.ZTRON_SCHEME_URL ?? tjs.env.ZTRON_DEV_URL;
const invokeKey =
  tjs.env.ZTRON_INVOKE_KEY ?? Math.random().toString(36).slice(2);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(
  `[showcase] backend connected${devUrl ? `, frontend ${devUrl}` : " (inline html)"}`,
);

const inlineHtml = `<!doctype html>
<html>
  <body style="font-family:system-ui;background:#0a0c10;color:#e6eaf2;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h1>Ztron Showcase</h1><p>请通过 ztron dev 启动（需 Vite 前端）</p></div>
  </body>
</html>`;

const capabilities = await loadCapabilities(
  tjs.env.ZTRON_CAPABILITIES_DIR ?? "./capabilities",
);

const confJson = tjs.env.ZTRON_CONF;
const conf = confJson
  ? (JSON.parse(confJson) as Parameters<AppBuilder["fromConfig"]>[0])
  : {};
if (!devUrl) {
  for (const w of conf.windows ?? []) {
    if (w.url === "frontend") {
      delete w.url;
      w.html = inlineHtml;
    }
  }
}

new AppBuilder(runtime, "com.ztron.showcase")
  .configure({ invokeKey, capabilities })
  .fromConfig(conf, { frontendUrl: devUrl ?? undefined })
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
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
  .plugin(pathPlugin({ appId: "com.ztron.showcase" }))
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
  .plugin(logPlugin({ level: "info", targets: ["stdout", "file", "webview"] }))
  .plugin(
    updaterPlugin({
      currentVersion: "0.1.0",
      scope: { allow: [{ url: "http://localhost:*/*" }] },
    }),
  )
  .plugin(sqlPlugin({ scope: { allow: ["$TMP/**"] } }))
  .plugin(autostartPlugin({ id: "com.ztron.showcase" }))
  .plugin(
    windowStatePlugin({
      file: `${tjs.tmpDir}/ztron_showcase_window_state.json`,
      restoreOnStartup: false,
    }),
  )
  .plugin(singleInstancePlugin({ identifier: "com.ztron.showcase" }))
  .plugin(websocketPlugin())
  .plugin(localIpPlugin())
  .plugin(networkPlugin())
  .setup((app) => {
    // P2 dev：CLI 重建前端后刷新页面（与 hello 同款 near-HMR 轮询）
    let reloadTimer: ReturnType<typeof setInterval> | undefined;
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
            console.log("[showcase] frontend changed -> page reloaded");
          }
        } catch {
          /* reload file may not exist yet */
        }
      }, 400);
    }

    // 本地回声服务器：/echo 原样返回 body；/stream 以 8 块、120ms 间隔
    // 推进式返回，供流式 fetch 卡片演示「头先到、body 持续到」。
    let echoPort = 0;
    void (async () => {
      try {
        const server = (await tjs.serve({
          port: 0,
          listenIp: "127.0.0.1",
          fetch: async (req: { text(): Promise<string>; url: string }) => {
            if (req.url.includes("/stream")) {
              const enc = new TextEncoder();
              const body = new ReadableStream<Uint8Array>({
                async start(c: {
                  enqueue(x: Uint8Array): void;
                  close(): void;
                }) {
                  for (let i = 0; i < 8; i++) {
                    c.enqueue(enc.encode(`chunk-${i};`));
                    await new Promise((r) => setTimeout(r, 120));
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
        })) as { port: number };
        echoPort = server.port;
      } catch {
        /* non-fatal：流式卡片会在运行时显示失败原因 */
      }
    })();

    app.command("showcase:echo-port", () => echoPort);

    // 前端冒烟上报：ztron check --expect SHOWCASE_OK 解析这行日志。
    // check 模式（CLI 注入 ZTRON_CHECK=1）：上报即收尾退出（hello 同款——
    // 停 near-HMR 轮询 → terminate 主 webview → 显式 exit），让 harness 在
    // 子进程退出后给出确定性判定；交互式 ztron dev（无该变量）窗口保持常开。
    app.command("showcase:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[showcase] frontend reported: "${received}"`);
      if (
        tjs.env.ZTRON_CHECK === "1" &&
        received?.split(":")[0] === "SHOWCASE_OK"
      ) {
        if (reloadTimer) clearInterval(reloadTimer);
        ctx.webview.terminate();
        setTimeout(() => tjs.exit(0), 300);
      }
    });

    // 事件卡片：连续 emit 3 次 tick（120ms 间隔）。
    app.command("showcase:emit-ticks", async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 120));
        app.emit("showcase:tick", { n: i });
      }
      return "started";
    });

    // Channel 卡片：向通道推 1..8（与 hello 的 m3:stream 同模式，同步发送）。
    app.command("showcase:stream", (args, ctx) => {
      const { ch } = args as { ch?: { kind: "channel"; id: number } };
      if (!ch) return "no-channel";
      const handle = ctx.getChannel(ch.id);
      if (!handle) return "no-handle";
      for (let i = 1; i <= 8; i++) {
        handle.send(i);
      }
      handle.end();
      return "streamed";
    });

    app.commandDef(greet);
    app.commandDef(add);
    app.commandDef(echo);
  })
  .build()
  .run();
