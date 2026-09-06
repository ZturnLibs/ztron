/**
 * Ztron Vue Demo 后端：注册演示涉及的插件 + vue-demo:* 命令。
 * 与 examples/react-demo/src/main.ts 同构（差异：报告命令为
 * vue-demo:report，冒烟 tag 为 VUE_DEMO_OK，品牌串全部换成 vue-demo）。
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
  openerPlugin,
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
  `[vue-demo] backend connected${devUrl ? `, frontend ${devUrl}` : " (inline html)"}`,
);

const inlineHtml = `<!doctype html>
<html>
  <body style="font-family:system-ui;background:#0a0c10;color:#e6eaf2;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h1>Ztron Vue Demo</h1><p>请通过 ztron dev 启动（需 Vite 前端）</p></div>
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

new AppBuilder(runtime, "com.ztron.vue-demo")
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
  .plugin(pathPlugin({ appId: "com.ztron.vue-demo" }))
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
  .plugin(autostartPlugin({ id: "com.ztron.vue-demo" }))
  .plugin(
    windowStatePlugin({
      file: `${tjs.tmpDir}/ztron_vue_demo_window_state.json`,
      restoreOnStartup: false,
    }),
  )
  .plugin(singleInstancePlugin({ identifier: "com.ztron.vue-demo" }))
  .plugin(websocketPlugin())
  .plugin(localIpPlugin())
  .plugin(networkPlugin())
  .plugin(openerPlugin())
  .setup((app) => {
    // P2 dev：CLI 重建前端后刷新页面（与 showcase 同款 near-HMR 轮询）。
    // 仅在 dev server 不可用（inline html / 构建监视器模式）时才会启用：
    // Vite dev server 模式下前端编辑走 Vite 自己的 HMR 通道，不经过这里。
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
            console.log("[vue-demo] frontend changed -> page reloaded");
          }
        } catch {
          /* reload file may not exist yet */
        }
      }, 400);
    }

    // 前端冒烟上报：ztron check --expect VUE_DEMO_OK 解析这行日志。
    // check 模式（CLI 注入 ZTRON_CHECK=1）：上报即收尾退出（showcase 同款：
    // 停 near-HMR 轮询 → terminate 主 webview → 显式 exit），让 harness 在
    // 子进程退出后给出确定性判定；交互式 ztron dev（无该变量）窗口保持常开。
    app.command("vue-demo:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[vue-demo] frontend reported: "${received}"`);
      if (
        tjs.env.ZTRON_CHECK === "1" &&
        received?.split(":")[0] === "VUE_DEMO_OK"
      ) {
        if (reloadTimer) clearInterval(reloadTimer);
        ctx.webview.terminate();
        setTimeout(() => tjs.exit(0), 300);
      }
    });

    // 事件演示：连续 emit 3 次 tick（120ms 间隔）。
    app.command("vue-demo:emit-ticks", async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 120));
        app.emit("vue-demo:tick", { n: i });
      }
      return "started";
    });

    // Channel 演示：向通道推 1..8（与 react-demo 的 react-demo:stream 同模式，
    // 同步发送，结束后 end 关闭通道）。
    app.command("vue-demo:stream", (args, ctx) => {
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
