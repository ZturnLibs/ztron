### Task 1: 示例脚手架 + tjs 后端 + codegen

**Files:**
- Create: `examples/showcase/package.json`、`tsconfig.json`、`ztron.conf.json`、`capabilities/default.json`
- Create: `examples/showcase/src/tjs-extra.d.ts`（复制自 hello）、`src/commands.ts`、`src/main.ts`
- Create (生成): `examples/showcase/src/ztron-commands.ts`

**Interfaces:**
- Consumes: `@zturnlibs/ztron-core` 的 `AppBuilder`/各 plugin 工厂/`loadCapabilities`/`defineCommand`；`@zturnlibs/ztron-runtime-ffi` 的 `HostRuntime`（用法与 `examples/hello/src/main.ts` 完全同构）。
- Produces: 后端命令 `showcase:greet|add|echo`（typed）、`showcase:report`、`showcase:emit-ticks`、`showcase:stream`、`showcase:echo-port`。前端任务靠这些 id 调用。

- [ ] **Step 1: 确认 workspace 覆盖 examples/**

Run: `cat pnpm-workspace.yaml`
Expected: `packages` 列表含 `examples/*`（hello 已在 workspace，通常已覆盖）。若没有，把 `examples/*` 加进列表。

- [ ] **Step 2: 创建 package.json 与 tsconfig.json**

`examples/showcase/package.json`：

```json
{
  "name": "@zturnlibs/ztron-example-showcase",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "dev": "ztron dev --entry src/main.ts"
  },
  "dependencies": {
    "@zturnlibs/ztron-api": "workspace:*",
    "@zturnlibs/ztron-core": "workspace:*",
    "@zturnlibs/ztron-runtime-ffi": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2",
    "@zturnlibs/ztron-cli": "workspace:*"
  }
}
```

`examples/showcase/tsconfig.json`（与 hello 的差异：lib 加 `DOM`，include 覆盖前端，rootDir 放宽到目录，因为本示例的主代码就是前端）：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "outDir": "dist",
    "rootDir": ".",
    "noEmit": true
  },
  "include": ["src", "frontend/src"]
}
```

注意：base 已有 `declaration: true`，与 noEmit 冲突时以 noEmit 优先不会报错；若 tsc 抱怨，删除 build 脚本里的输出用法即可（本示例永不产出 dist）。

- [ ] **Step 3: 创建 ztron.conf.json 与 capabilities/default.json**

`examples/showcase/ztron.conf.json`：

```json
{
  "entry": "src/main.ts",
  "frontend": "frontend",
  "identifier": "com.ztron.showcase",
  "version": "0.1.0",
  "windows": [
    {
      "label": "main",
      "title": "Ztron Showcase",
      "width": 1024,
      "height": 680,
      "minWidth": 760,
      "minHeight": 480,
      "url": "frontend",
      "titleBarStyle": "visible",
      "resizable": true
    }
  ]
}
```

`examples/showcase/capabilities/default.json`（权限面 = hello 的已验证清单；JSON 无法写注释，各项用途记录在规格第 4.5 节与本计划 Task 11 的文档里）：

```json
{
  "identifier": "main-capabilities",
  "description": "Showcase 全量权限：core/path/fs/http/os/store/log/shell/updater/sql/autostart/window-state/single-instance/websocket/local-ip/network/persisted-scope/fs-watch/fs-binary。",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "path:default",
    "fs:write-default",
    "fs:allow-copy",
    "fs:allow-rename",
    "fs:allow-stat",
    "fs:allow-make-dir",
    "fs:allow-watch",
    "fs:allow-read-file",
    "fs:allow-write-file",
    "http:default",
    "os:default",
    "store:write",
    "log:default",
    "shell:default",
    "updater:default",
    "sql:default",
    "autostart:default",
    "window-state:write",
    "single-instance:default",
    "websocket:default",
    "local-ip:default",
    "network:default",
    "persisted-scope:default"
  ]
}
```

- [ ] **Step 4: 创建 src/tjs-extra.d.ts、src/commands.ts、src/main.ts**

复制 hello 的 tjs 全局声明（逐字节一致，不要手写）：

```bash
cp examples/hello/src/tjs-extra.d.ts examples/showcase/src/tjs-extra.d.ts
```

`examples/showcase/src/commands.ts`：

```ts
/**
 * Showcase typed commands —— `ztron codegen` 的扫描对象。
 * 每个命令用 defineCommand 声明，生成 src/ztron-commands.ts 类型绑定。
 */
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("showcase:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});

export const add = defineCommand("showcase:add", {
  args: {} as { a: number; b: number },
  result: 0 as number,
  handler: (args) => args.a + args.b,
});

export const echo = defineCommand("showcase:echo", {
  args: {} as { msg?: string },
  result: "" as string,
  handler: (args) => `echo:${args.msg ?? ""}`,
});
```

`examples/showcase/src/main.ts`（与 hello 同构；差异点：无 persisted-scope 预置、无 spike 专用检查命令、日志 level 用 info）：

```ts
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
    app.command("showcase:report", (_args) => {
      const { received } = _args as { received?: string };
      console.log(`[showcase] frontend reported: "${received}"`);
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
```

- [ ] **Step 5: 安装依赖并生成 codegen 绑定**

Run: `pnpm install && cd examples/showcase && pnpm exec ztron codegen && cd ../..`
Expected: 输出含 `[ztron] codegen: 3 command(s) -> src/ztron-commands.ts`；`examples/showcase/src/ztron-commands.ts` 出现且 `KnownCommands` 含 `showcase:greet/add/echo`。

- [ ] **Step 6: typecheck 通过**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`
Expected: exit 0（此时 frontend/src 还不存在，include 只命中 src）。

- [ ] **Step 7: Commit**

```bash
git add examples/showcase pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(examples): showcase scaffold - backend plugins, showcase:* commands, capabilities"
```

---

