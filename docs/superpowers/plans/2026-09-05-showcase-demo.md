# Ztron Showcase 新手演示应用实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `examples/showcase` 交付一个面向新手应用开发者的交互式 kitchen-sink 演示应用：32 张功能卡片（点按钮真跑）+ 卡片内嵌最小代码片段 + 一键跳转线上文档站。

**Architecture:** 与 hello 同构的 ztron 应用（`ztron.conf.json` 单窗口 + tjs 后端注册插件 + Vite 前端）。前端用「demo 注册表」抽象：每个 demo 是 `{ id, title, description, code, docPath, mount(area, out) }` 纯数据项，`main.ts` 按分类渲染侧边栏导航与卡片。视觉继承官网品牌令牌（深色、紫青渐变）。

**Tech Stack:** TypeScript + Vite + `@zturnlibs/ztron-api` + 原生 DOM/CSS（无框架、无 CSS 框架）。规格：`docs/superpowers/specs/2026-09-05-showcase-demo-design.md`。

## Global Constraints

- 平台：macOS only（框架宿主现状）；UI 文案全部中文；窗口 label 固定 `main`；应用标识固定 `com.ztron.showcase`。
- 命令 id 统一前缀 `showcase:`；示例代码片段里的命令 id 必须与 `src/commands.ts`/`src/main.ts` 实际注册的一致。
- 前端零框架：原生 DOM + 单个 `frontend/src/style.css`；禁止引入 React/Vue/Tailwind/图标库包。
- 视觉：深色主题锁定；颜色/字体/圆角令牌**逐字取自** `website/src/styles/tokens.css`（`--bg #0a0c10` / `--surface #11141b` / `--elevated #161a23` / `--text-1 #e6eaf2` / `--text-2 #9aa3b2` / `--accent-from #8b5cf6` / `--accent-to #22d3ee` / `--ok #34d399` / `--bad #f87171` / `--code-bg #0d1017` / radius 10px）；图标仅允许 3 枚 Tabler Icons 内联 SVG（book/copy/external-link，strokeWidth 2）；UI 可见文案**零破折号（—）**、零 emoji、无装饰性状态圆点。
- 动效：只动 transform/opacity，150-250ms ease-out；`prefers-reduced-motion` 全量禁用。
- 验证基线：每个任务结束跑 `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`；涉及 UI 的任务追加 dev 人工点验（先决条件：原生链已构建，`pnpm --filter @zturnlibs/ztron-example-hello dev` 可跑）。
- 测试策略（规格第 6 节）：无新增单测；冒烟 tag `SHOWCASE_OK:<卡片数>` 经 `showcase:report` 上报，`ztron check --expect SHOWCASE_OK` 可门禁。
- 提交信息用 conventional commits（`feat(examples): ...`），每个任务至少一次提交。

## File Structure

```
examples/showcase/
├── package.json                      # Create (Task 1) —— @zturnlibs/ztron-example-showcase
├── tsconfig.json                     # Create (Task 1) —— 覆盖 src + frontend/src
├── ztron.conf.json                   # Create (Task 1) —— 单窗口 main 1024x680
├── capabilities/
│   └── default.json                  # Create (Task 1) —— 全量 ACL（对齐 hello 权限面）
├── src/
│   ├── tjs-extra.d.ts                # Create (Task 1) —— 复制 hello 同名文件
│   ├── commands.ts                   # Create (Task 1) —— greet/add/echo defineCommand
│   ├── main.ts                       # Create (Task 1) —— AppBuilder + 插件 + showcase:* 命令
│   └── ztron-commands.ts             # Create (Task 1, codegen 生成)
└── frontend/
    ├── index.html                    # Create (Task 2) —— 侧边栏 + 内容区骨架
    └── src/
        ├── style.css                 # Create (Task 2) —— 品牌令牌 + 组件样式
        ├── demo-ui.ts                # Create (Task 2) —— Demo/Output 接口 + act/field/output/icon
        ├── doc-links.ts              # Create (Task 2) —— docUrl()
        ├── main.ts                   # Create (Task 2) —— CATALOG 装载 + 侧边栏/卡片渲染 + 冒烟
        └── demos/
            ├── core.ts               # Create (Task 3) —— 4 demos
            ├── window.ts             # Create (Task 4) —— 3 demos
            ├── fs.ts                 # Create (Task 5) —— 3 demos
            ├── dialogs.ts            # Create (Task 6) —— 4 demos
            ├── net.ts                # Create (Task 7) —— 3 demos
            ├── menu-tray.ts          # Create (Task 8) —— 3 demos
            ├── data.ts               # Create (Task 9) —— 3 demos
            └── system.ts             # Create (Task 10) —— 9 demos
docs/zh/start/examples.md             # Modify (Task 11) —— 表格加行 + 小节
docs/en/start/examples.md             # Modify (Task 11) —— en 镜像
README.md                             # Modify (Task 11) —— Documentation 小节一行
```

**共享接口（所有 demo 任务依赖，先记牢）：**

```ts
// frontend/src/demo-ui.ts
export interface Output {
  root: HTMLPreElement;                       // 结果输出区（.card-out）
  info(msg: string): void;                    // 普通过程消息
  ok(msg: string): void;                      // 成功（绿色）
  fail(msg: string): void;                    // 失败（红色）
}
export interface Demo {
  id: string;            // 如 "fs.watch"
  title: string;         // 卡片标题（中文）
  description: string;   // 一句话说明
  code: string;          // 展示用最小片段（文档字符串，不参与编译）
  docPath: string;       // 文档站相对路径，如 "/plugins/fs.html"
  mount(area: HTMLElement, out: Output): void;
}
export function act(out: Output, label: string, run: () => Promise<void> | void): HTMLButtonElement;
export function field(labelText: string, placeholder?: string, value?: string): HTMLLabelElement;
export function fieldValue(f: HTMLLabelElement): string;
export function output(): Output;
export function icon(name: "book" | "copy" | "external"): SVGSVGElement;
export function extractError(e: unknown): string;
```

每个 `demos/*.ts` 导出一个命名数组（如 `export const coreDemos: Demo[]`），`main.ts` 的 CATALOG 引用。`act` 在点击时自动禁用按钮、捕获异常并以 `out.fail(extractError(e))` 展示，demo 代码只写成功路径（演示 scope 拒绝的 demo 自行 try/catch）。

---

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

### Task 2: 前端骨架 —— 品牌令牌、demo-ui、doc-links、路由与冒烟

**Files:**
- Create: `examples/showcase/frontend/index.html`
- Create: `examples/showcase/frontend/src/style.css`、`demo-ui.ts`、`doc-links.ts`、`main.ts`

**Interfaces:**
- Consumes: Task 1 的 `showcase:report` 命令；`@zturnlibs/ztron-api` 的 `openUrl`/`writeClipboardText`/`invoke`。
- Produces: 本计划开头的共享接口（Demo/Output/act/field/output/icon/extractError，逐字照抄）；`doc-links.ts` 的 `docUrl(docPath: string): string`。后续 demo 任务只 import 这些。

- [ ] **Step 1: index.html**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>Ztron Showcase</title>
  </head>
  <body>
    <div id="app">
      <nav id="sidebar">
        <div class="brand">Ztron Showcase</div>
        <div class="brand-sub">点着玩的功能演示，每个卡片都有代码和文档</div>
        <div id="nav"></div>
      </nav>
      <main id="content"></main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: style.css**

```css
/* Ztron Showcase —— 令牌逐字继承官网 website/src/styles/tokens.css（品牌一致性）。
   深色主题锁定（与官网一致）；圆角体系：容器 10px、交互控件 8px。 */
:root {
  --bg: #0a0c10;
  --surface: #11141b;
  --elevated: #161a23;
  --border: rgba(255, 255, 255, 0.08);
  --text-1: #e6eaf2;
  --text-2: #9aa3b2;
  --accent-from: #8b5cf6;
  --accent-to: #22d3ee;
  --ok: #34d399;
  --bad: #f87171;
  --code-bg: #0d1017;
  --grad: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  --font-ui: system-ui, -apple-system, "PingFang SC", "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Consolas, monospace;
  --radius: 10px;
  --radius-ctl: 8px;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; }
body {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.6;
  background: var(--bg);
  color: var(--text-1);
}
#app { display: flex; height: 100vh; }

/* 侧边栏 */
#sidebar {
  width: 220px;
  flex: none;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--surface);
  border-right: 1px solid var(--border);
}
.brand {
  padding: 18px 16px 4px;
  font-size: 16px;
  font-weight: 700;
  background: var(--grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand-sub { padding: 0 16px 12px; font-size: 12px; color: var(--text-2); }
.nav-category { padding: 12px 16px 4px; font-size: 12px; color: var(--text-2); }
.nav-item {
  display: block;
  width: 100%;
  padding: 6px 16px 6px 24px;
  font: inherit;
  font-size: 13px;
  text-align: left;
  color: var(--text-2);
  background: none;
  border: 0;
  border-left: 2px solid transparent;
  cursor: pointer;
  transition:
    color 0.15s ease-out,
    background-color 0.15s ease-out,
    border-color 0.15s ease-out;
}
.nav-item:hover { color: var(--text-1); background: var(--elevated); }
.nav-item.active {
  color: var(--text-1);
  background: var(--elevated);
  border-left-color: var(--accent-to);
}

/* 内容区与卡片 */
#content { flex: 1; overflow-y: auto; padding: 24px 28px 48px; }
.empty { color: var(--text-2); padding: 40px 0; }
.card {
  max-width: 760px;
  padding: 20px 22px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.card-title { margin: 0; font-size: 18px; font-weight: 650; }
.card-desc { margin: 6px 0 0; font-size: 13px; color: var(--text-2); max-width: 65ch; }
.card-area { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin-top: 16px; }
.card-out {
  width: 100%;
  min-height: 38px;
  margin: 14px 0 0;
  padding: 10px 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
}
.card-out:empty::before { content: "运行按钮后，结果会显示在这里"; color: rgba(154, 163, 178, 0.55); }
.card-out.ok { color: var(--ok); }
.card-out.fail { color: var(--bad); }
.card-code { position: relative; margin: 14px 0 0; }
.card-code pre {
  margin: 0;
  padding: 12px 14px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
  overflow-x: auto;
}
.card-code .copy { position: absolute; top: 8px; right: 8px; }

/* 控件 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--text-1);
  background: var(--elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
  cursor: pointer;
  transition:
    transform 0.12s ease-out,
    border-color 0.15s ease-out,
    background-color 0.15s ease-out;
}
.btn:hover { border-color: rgba(255, 255, 255, 0.2); }
.btn:active { transform: translateY(1px); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary { background: var(--grad); border: 0; color: #0a0c10; font-weight: 600; }
.field { display: flex; flex-direction: column; gap: 4px; }
.field span { font-size: 12px; color: var(--text-2); }
.field input {
  width: 220px;
  padding: 7px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--text-1);
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-ctl);
}
.field input:focus { outline: none; border-color: var(--accent-to); }
svg.icon {
  width: 15px;
  height: 15px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}
```

- [ ] **Step 3: demo-ui.ts**

```ts
/**
 * demo-ui —— showcase 前端的全部 UI 原语。
 * 每个 demo = 一个 Demo 注册项；act/field/output 负责控件与结果展示，
 * demo 代码只写成功路径（act 自动捕获异常并以红色显示）。
 */

export interface Output {
  root: HTMLPreElement;
  info(msg: string): void;
  ok(msg: string): void;
  fail(msg: string): void;
}

export interface Demo {
  id: string;
  title: string;
  description: string;
  /** 展示给读者的最小用法片段（文档字符串，不参与编译） */
  code: string;
  /** 文档站相对路径，如 "/plugins/fs.html" */
  docPath: string;
  mount(area: HTMLElement, out: Output): void;
}

/** Tauri 风格 rejection payload（{ error }）转可读字符串 */
export function extractError(e: unknown): string {
  if (e && typeof e === "object" && "error" in e) {
    return String((e as { error: unknown }).error);
  }
  return String(e);
}

export function output(): Output {
  const root = document.createElement("pre");
  root.className = "card-out";
  const write = (msg: string, cls: string) => {
    root.className = `card-out ${cls}`.trim();
    root.textContent += (root.textContent ? "\n" : "") + msg;
    root.scrollTop = root.scrollHeight;
  };
  return {
    root,
    info: (msg) => write(msg, ""),
    ok: (msg) => write(msg, "ok"),
    fail: (msg) => write(msg, "fail"),
  };
}

/** 带自动错误捕获与 busy 态的按钮 */
export function act(
  out: Output,
  label: string,
  run: () => Promise<void> | void,
): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = label;
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await run();
    } catch (e) {
      out.fail(extractError(e));
    } finally {
      b.disabled = false;
    }
  });
  return b;
}

/** label 在上的输入框（无 placeholder-as-label）。返回包裹 label，取值用 fieldValue() */
export function field(labelText: string, placeholder = "", value = ""): HTMLLabelElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const cap = document.createElement("span");
  cap.textContent = labelText;
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(cap, input);
  return wrap;
}

/** 读取 field() 包裹内输入框的当前值 */
export function fieldValue(f: HTMLLabelElement): string {
  return (f.querySelector("input") as HTMLInputElement).value;
}

/** Tabler Icons (MIT) 内联 SVG，strokeWidth 2；本应用仅用这 3 枚 */
export function icon(name: "book" | "copy" | "external"): SVGSVGElement {
  const paths: Record<typeof name, string> = {
    book: '<path d="M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 5a9 9 0 0 1 9 0a9 9 0 0 1 9 0"/><path d="M3 5v14a9 9 0 0 1 9 0a9 9 0 0 1 9 0v-14a9 9 0 0 0 -9 0a9 9 0 0 0 -9 0z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2"/>',
    external: '<path d="M11 7h-5a2 2 0 0 0 -2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-5"/><path d="M10 14l10 -10"/><path d="M15 4h5v5"/>',
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.classList.add("icon");
  svg.innerHTML = paths[name];
  return svg;
}
```

注意 `field()` 里有一段占位 style 代码，删掉它（上面的最终版应不含 `const style...` 三行；写文件时直接不写这三行）。最终版：

```ts
export function field(labelText: string, placeholder = "", value = ""): HTMLInputElement {
  const wrap = document.createElement("label");
  wrap.className = "field";
  const cap = document.createElement("span");
  cap.textContent = labelText;
  const input = document.createElement("input");
  input.placeholder = placeholder;
  input.value = value;
  wrap.append(cap, input);
  return input;
}
```

- [ ] **Step 4: doc-links.ts**

```ts
/** 文档站地址（zh 默认语言，en 挂 /en/ 前缀）。docPath 见规格第 5 节对照表。 */
const DOCS_BASE = "https://zturnlibs.github.io/ztron/docs";

export function docUrl(docPath: string): string {
  return DOCS_BASE + docPath;
}
```

- [ ] **Step 5: frontend/src/main.ts（CATALOG 先空，冒烟为 0 卡）**

```ts
import "./style.css";
import { invoke, openUrl, writeClipboardText } from "@zturnlibs/ztron-api";
import { icon, output, type Demo } from "./demo-ui";
import { docUrl } from "./doc-links";

/** 分类目录：Task 3-10 逐个补充 demos/* 模块后在此登记 */
const CATALOG: { category: string; demos: Demo[] }[] = [];

const nav = document.getElementById("nav")!;
const content = document.getElementById("content")!;

function renderCard(demo: Demo): void {
  content.innerHTML = "";

  const card = document.createElement("article");
  card.className = "card";

  const header = document.createElement("div");
  header.className = "card-header";
  const heading = document.createElement("div");
  const title = document.createElement("h2");
  title.className = "card-title";
  title.textContent = demo.title;
  const desc = document.createElement("p");
  desc.className = "card-desc";
  desc.textContent = demo.description;
  heading.append(title, desc);
  const docBtn = document.createElement("button");
  docBtn.className = "btn";
  docBtn.append(icon("book"), document.createTextNode("文档"));
  docBtn.addEventListener("click", () => {
    const url = docUrl(demo.docPath);
    void openUrl(url).catch(() => window.open(url, "_blank"));
  });
  header.append(heading, docBtn);

  const area = document.createElement("div");
  area.className = "card-area";
  const out = output();

  const codeWrap = document.createElement("div");
  codeWrap.className = "card-code";
  const pre = document.createElement("pre");
  pre.textContent = demo.code;
  const copyBtn = document.createElement("button");
  copyBtn.className = "btn copy";
  copyBtn.append(icon("copy"), document.createTextNode("复制"));
  copyBtn.addEventListener("click", () => {
    void writeClipboardText(demo.code);
  });
  codeWrap.append(pre, copyBtn);

  card.append(header, area, out.root, codeWrap);
  content.append(card);
  demo.mount(area, out);
}

function renderNav(): void {
  nav.innerHTML = "";
  let first = true;
  for (const { category, demos } of CATALOG) {
    const cap = document.createElement("div");
    cap.className = "nav-category";
    cap.textContent = category;
    nav.append(cap);
    for (const demo of demos) {
      const item = document.createElement("button");
      item.className = "nav-item";
      item.textContent = demo.title;
      item.addEventListener("click", () => {
        nav.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
        item.classList.add("active");
        renderCard(demo);
      });
      if (first) {
        item.classList.add("active");
        renderCard(demo);
        first = false;
      }
      nav.append(item);
    }
  }
  if (CATALOG.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "demo 模块尚未登记（见 frontend/src/main.ts 的 CATALOG）";
    content.append(empty);
  }
}

renderNav();

// 冒烟：卡片渲染完成后上报卡片总数，供 ztron check --expect SHOWCASE_OK 门禁
void invoke("showcase:report", {
  received: `SHOWCASE_OK:${CATALOG.reduce((n, c) => n + c.demos.length, 0)}`,
});
```

- [ ] **Step 6: typecheck**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`
Expected: exit 0。若报 `*.css` 模块找不到：在 `frontend/src/` 新建 `globals.d.ts` 内容为 `declare module "*.css";` 后重跑。

- [ ] **Step 7: dev 人工点验（空目录态）**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase dev`
Expected: 窗口出现，深色侧边栏（渐变字标「Ztron Showcase」），内容区显示空态文案；终端无报错。确认后 Ctrl+C 退出。

- [ ] **Step 8: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase frontend shell - brand tokens, demo registry router, doc/copy buttons"
```

---

### Task 3: demos/core.ts（4 卡：关于本应用 / invoke / 事件 / Channel）

**Files:**
- Create: `examples/showcase/frontend/src/demos/core.ts`
- Modify: `examples/showcase/frontend/src/main.ts`（CATALOG 登记）

**Interfaces:**
- Consumes: 共享接口（见计划开头）；后端命令 `showcase:greet/add/echo/emit-ticks/stream`。
- Produces: `export const coreDemos: Demo[]`（4 项，id: `app.about` / `core.invoke` / `core.events` / `core.channel`）。

- [ ] **Step 1: 写 demos/core.ts（完整文件）**

```ts
import { invoke, listen, Channel, getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const about: Demo = {
  id: "app.about",
  title: "关于本应用",
  description: "读取应用元数据（名称/版本/标识符），这是最简单的三个 API。",
  code: `import { getName, getVersion, getIdentifier } from "@zturnlibs/ztron-api";

const name = await getName();            // "com.ztron.showcase"
const version = await getVersion();      // "0.1.0"
const identifier = await getIdentifier();
console.log(name, version, identifier);`,
  docPath: "/plugins/app.html",
  mount(area, out) {
    area.append(
      act(out, "读取应用信息", async () => {
        const [name, version, id] = await Promise.all([
          getName(),
          getVersion(),
          getIdentifier(),
        ]);
        out.ok(`name: ${name}\nversion: ${version}\nidentifier: ${id}`);
      }),
    );
  },
};

const invokeDemo: Demo = {
  id: "core.invoke",
  title: "调用后端命令 invoke",
  description: "前端 invoke 后端命令；配合 ztron codegen 可生成类型安全的命令绑定。",
  code: `// 后端 src/commands.ts：defineCommand 声明
export const greet = defineCommand("showcase:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => \`hello, \${args.name}\`,
});

// 前端：直接 invoke
import { invoke } from "@zturnlibs/ztron-api";
const msg = await invoke<string>("showcase:greet", { name: "Ztron" });

// 或运行 ztron codegen 后用生成的类型绑定（本示例已生成）
import { invoke as typed } from "../src/ztron-commands.js";
const msg2 = await typed("showcase:greet", { name: "Ztron" });`,
  docPath: "/guide/ipc.html",
  mount(area, out) {
    const name = field("你的名字", "世界");
    area.append(
      name,
      act(out, "greet", async () => {
        out.ok(await invoke("showcase:greet", { name: fieldValue(name) || "世界" }));
      }),
      act(out, "add(2, 3)", async () => {
        out.ok(`2 + 3 = ${await invoke("showcase:add", { a: 2, b: 3 })}`);
      }),
    );
  },
};

const events: Demo = {
  id: "core.events",
  title: "事件 listen / emit",
  description: "后端 emit 全局事件、前端 listen 订阅；跨进程消息的另一种形态。",
  code: `import { listen } from "@zturnlibs/ztron-api";

const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
  console.log("tick", e.payload.n);
});
// 不再需要时取消订阅
unlisten();`,
  docPath: "/plugins/event.html",
  mount(area, out) {
    area.append(
      act(out, "订阅并触发 3 次 tick", async () => {
        let last = 0;
        const unlisten = await listen<{ n: number }>("showcase:tick", (e) => {
          last = e.payload.n;
          out.info(`收到 tick ${e.payload.n}`);
        });
        await invoke("showcase:emit-ticks", {});
        await new Promise((r) => setTimeout(r, 500));
        unlisten();
        out.ok(`最后一次 tick = ${last}，已取消订阅`);
      }),
    );
  },
};

const channel: Demo = {
  id: "core.channel",
  title: "Channel 流式数据",
  description: "Channel 让后端持续向前端推送消息，适合下载进度、日志流等场景。",
  code: `import { invoke, Channel } from "@zturnlibs/ztron-api";

const channel = new Channel<number>((progress) => {
  console.log(\`收到 \${progress}/8\`);
});
// 后端拿到 ch 后多次 handle.send()，前端逐条收到；handle.end() 结束
await invoke("showcase:stream", { ch: channel });`,
  docPath: "/guide/ipc.html",
  mount(area, out) {
    area.append(
      act(out, "开始接收 1..8", async () => {
        const got: number[] = [];
        const ch = new Channel<number>((m) => {
          got.push(m);
          out.info(`收到 ${m}/8`);
        });
        await invoke("showcase:stream", { ch });
        out.ok(`流结束，共 ${got.length} 条消息：${got.join(",")}`);
      }),
    );
  },
};

export const coreDemos: Demo[] = [about, invokeDemo, events, channel];
```

- [ ] **Step 2: CATALOG 登记**

`frontend/src/main.ts` 顶部加 import，并把 CATALOG 换成：

```ts
import { coreDemos } from "./demos/core";

const CATALOG: { category: string; demos: Demo[] }[] = [
  { category: "核心", demos: coreDemos },
];
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`
Expected: exit 0。

- [ ] **Step 4: dev 人工点验**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase dev`
Expected 逐卡：
1. 关于本应用：点按钮输出 name/version/identifier 三行（绿色）。
2. invoke：输入「张三」点 greet 输出 `hello, 张三`；add 输出 `2 + 3 = 5`。
3. 事件：点按钮后依次 info 三行 tick、最后 ok「已取消订阅」。
4. Channel：点按钮后 info 8 行、ok「共 8 条」。
每张卡片「文档」按钮能打开对应文档页；代码区「复制」后可在别处粘贴。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase core demos - about/invoke/events/channel"
```

---

### Task 4: demos/window.ts（3 卡：窗口控制 / 多窗口 / 事件与显示器）

**Files:**
- Create: `examples/showcase/frontend/src/demos/window.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`Window`/`WebviewWindow`/`getAllWindows`/`availableMonitors`/`currentMonitor`。
- Produces: `export const windowDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/window.ts（完整文件）**

```ts
import {
  Window,
  WebviewWindow,
  getAllWindows,
  availableMonitors,
  currentMonitor,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";

const winControl: Demo = {
  id: "window.control",
  title: "窗口控制",
  description: "Window 是操控当前窗口的句柄：标题、位置、置顶、全屏等。",
  code: `import { Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTitle("新标题");
await win.center();
await win.setAlwaysOnTop(true);   // 置顶
await win.setAlwaysOnTop(false);
await win.setFullscreen(true);    // 全屏（Esc 退出）
const title = await win.getTitle();`,
  docPath: "/plugins/window.html",
  mount(area, out) {
    const win = Window.getCurrent();
    area.append(
      act(out, "改标题", async () => {
        await win.setTitle(`Ztron @ ${new Date().toLocaleTimeString()}`);
        out.ok("标题已更新（看窗口标题栏）");
      }),
      act(out, "居中", async () => {
        await win.center();
        out.ok("窗口已居中");
      }),
      act(out, "置顶 1.2 秒", async () => {
        await win.setAlwaysOnTop(true);
        await new Promise((r) => setTimeout(r, 1200));
        await win.setAlwaysOnTop(false);
        out.ok("已置顶并取消");
      }),
      act(out, "全屏切换", async () => {
        const fs = await win.isFullscreen();
        await win.setFullscreen(!fs);
        out.ok(fs ? "已退出全屏" : "已进入全屏");
      }),
    );
  },
};

const multiwin: Demo = {
  id: "window.multi",
  title: "多窗口 WebviewWindow",
  description: "运行时创建第二个原生窗口，操控它，然后销毁。label 是窗口路由主键。",
  code: `import { WebviewWindow, getAllWindows } from "@zturnlibs/ztron-api";

const second = new WebviewWindow("tools", {
  title: "第二个窗口",
  width: 360,
  height: 240,
  html: "<p>我是运行时创建的窗口</p>",
});
await second.create();
await second.setTitle("改过的标题");
const all = await getAllWindows();   // label 列表
await second.destroy();`,
  docPath: "/plugins/webview-window.html",
  mount(area, out) {
    area.append(
      act(out, "创建第二个窗口（2.5 秒后销毁）", async () => {
        const second = new WebviewWindow("showcase-second", {
          title: "第二个窗口",
          width: 360,
          height: 240,
          html: '<p style="font-family:system-ui;padding:16px">我是运行时创建的窗口</p>',
        });
        await second.create();
        await second.setTitle("第二个窗口（已改题）");
        const all = await getAllWindows();
        out.info(`当前窗口：${all.map((w) => w.label).join("、")}`);
        await new Promise((r) => setTimeout(r, 2500));
        await second.destroy();
        out.ok("第二个窗口已销毁");
      }),
    );
  },
};

const monitors: Demo = {
  id: "window.monitors",
  title: "窗口事件与显示器",
  description: "监听窗口移动事件；枚举显示器（名称/缩放/工作区）。",
  code: `import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
const un = await win.onMoved(() => console.log("窗口移动了"));

const monitors = await availableMonitors();
const cur = await currentMonitor();
console.log(monitors.map((m) => \`\${m.name} @\${m.scaleFactor}x\`));
un();`,
  docPath: "/plugins/dpi.html",
  mount(area, out) {
    const win = Window.getCurrent();
    area.append(
      act(out, "监听移动（8 秒，拖动窗口试试）", async () => {
        let times = 0;
        const un = await win.onMoved(() => {
          times++;
          out.info(`移动事件 x${times}`);
        });
        out.info("监听已挂上，拖动窗口标题栏");
        await new Promise((r) => setTimeout(r, 8000));
        un();
        out.ok(times > 0 ? `共捕获 ${times} 次移动` : "没等到移动事件（可再试一次）");
      }),
      act(out, "枚举显示器", async () => {
        const list = await availableMonitors();
        const cur = await currentMonitor();
        const lines = list.map(
          (m) =>
            `${cur && m.name === cur.name ? ">" : " "} ${m.name} @${m.scaleFactor}x work=${m.workArea.width}x${m.workArea.height}`,
        );
        out.ok(lines.join("\n"));
      }),
    );
  },
};

export const windowDemos: Demo[] = [winControl, multiwin, monitors];
```

- [ ] **Step 2: CATALOG 登记**

```ts
import { windowDemos } from "./demos/window";
// CATALOG 追加：
  { category: "窗口", demos: windowDemos },
```

- [ ] **Step 3: typecheck** — Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck`；Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 改标题看标题栏；居中；置顶后其他窗口压不住它；全屏进出；第二个窗口出现/改题/消失；拖动主窗口时 info 行数增加；显示器列表与「关于本机」一致。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase window demos - control/multiwin/monitors"
```

---

### Task 5: demos/fs.ts（3 卡：读写 / 目录与路径 / watch）

**Files:**
- Create: `examples/showcase/frontend/src/demos/fs.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`fs`/`path`（scope：`$TMP/**` 已放行）。
- Produces: `export const fsDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/fs.ts（完整文件）**

```ts
import { fs, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const readWrite: Demo = {
  id: "fs.rw",
  title: "文件读写",
  description: "fs 写/读文本与二进制；路径受 ACL scope 约束（本应用放行 $TMP/**）。",
  code: `import { fs } from "@zturnlibs/ztron-api";

await fs.writeText("$TMP/ztron_demo.txt", "你好 Ztron");
const text = await fs.readText("$TMP/ztron_demo.txt");

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
await fs.writeFile("$TMP/ztron_demo.bin", bytes);
const back = await fs.readFile("$TMP/ztron_demo.bin");`,
  docPath: "/plugins/fs.html",
  mount(area, out) {
    const content = field("文件内容", "你好 Ztron");
    area.append(
      content,
      act(out, "写入并读回", async () => {
        await fs.writeText("$TMP/ztron_showcase.txt", fieldValue(content));
        const back = await fs.readText("$TMP/ztron_showcase.txt");
        out.ok(`读回：${back}`);
      }),
      act(out, "二进制写读", async () => {
        const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        await fs.writeFile("$TMP/ztron_showcase.bin", magic);
        const back = await fs.readFile("$TMP/ztron_showcase.bin");
        const same = magic.every((b, i) => back[i] === b);
        out.ok(`读回 ${back.length} 字节，逐字节一致：${same}`);
      }),
    );
  },
};

const dirs: Demo = {
  id: "fs.path",
  title: "目录列表与路径",
  description: "readDir 列目录；path 拼路径并取系统目录（临时/家/应用数据）。",
  code: `import { fs, path } from "@zturnlibs/ztron-api";

const entries = await fs.readDir("$TMP");   // { name, isDirectory, isFile }[]
const temp = await path.tempDir();
const home = await path.homeDir();
const appData = await path.appDataDir();    // ~/Library/Application Support/<appId>
const joined = await path.join(temp, "a", "b.txt");`,
  docPath: "/plugins/path.html",
  mount(area, out) {
    area.append(
      act(out, "列出临时目录前 8 项", async () => {
        const entries = await fs.readDir("$TMP");
        const names = entries
          .slice(0, 8)
          .map((e) => `${e.isDirectory ? "[目录] " : "[文件] "}${e.name}`);
        out.ok(
          `$TMP 共 ${entries.length} 项：\n${names.join("\n")}${entries.length > 8 ? "\n…" : ""}`,
        );
      }),
      act(out, "系统目录", async () => {
        const [temp, home, appData] = await Promise.all([
          path.tempDir(),
          path.homeDir(),
          path.appDataDir(),
        ]);
        out.ok(`temp: ${temp}\nhome: ${home}\nappData: ${appData}`);
      }),
    );
  },
};

const watchDemo: Demo = {
  id: "fs.watch",
  title: "文件监听 watch",
  description: "fs.watch 监听文件变化（底层 FSEvents），返回取消监听函数。",
  code: `import { fs } from "@zturnlibs/ztron-api";

const unwatch = await fs.watch("$TMP/ztron_watch.txt", (ev) => {
  console.log(ev.type, ev.path);   // "modify" | ...
});
await fs.writeText("$TMP/ztron_watch.txt", "v2");  // 触发 modify
unwatch();`,
  docPath: "/plugins/fs.html",
  mount(area, out) {
    area.append(
      act(out, "监听并改写文件", async () => {
        await fs.writeText("$TMP/ztron_showcase_watch.txt", "v1");
        const events: string[] = [];
        const unwatch = await fs.watch("$TMP/ztron_showcase_watch.txt", (ev) => {
          events.push(ev.type);
          out.info(`事件：${ev.type}`);
        });
        await new Promise((r) => setTimeout(r, 400));
        await fs.writeText("$TMP/ztron_showcase_watch.txt", "v2");
        await new Promise((r) => setTimeout(r, 1500));
        unwatch();
        out.ok(events.length > 0 ? `共 ${events.length} 个事件（${[...new Set(events)].join("、")}），已取消监听` : "未捕获事件（可再试一次）");
      }),
    );
  },
};

export const fsDemos: Demo[] = [readWrite, dirs, watchDemo];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "文件", demos: fsDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 三个按钮全部绿色输出；把内容改成中文再写读，UTF-8 不乱码；watch 卡两次运行都应捕获 modify。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase fs demos - rw/dirs/watch"
```

---

### Task 6: demos/dialogs.ts（4 卡：文件对话框 / 消息对话框 / 通知 / 剪贴板）

**Files:**
- Create: `examples/showcase/frontend/src/demos/dialogs.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`open`/`save`/`message`/`ask`/`confirm`/`sendNotification`/`isPermissionGranted`/`requestPermission`/剪贴板五函数。
- Produces: `export const dialogDemos: Demo[]`（4 项）。

- [ ] **Step 1: 写 demos/dialogs.ts（完整文件）**

```ts
import {
  open,
  save,
  message,
  ask,
  confirm,
  sendNotification,
  isPermissionGranted,
  requestPermission,
  writeClipboardText,
  readClipboardText,
  writeClipboardHtml,
  readClipboardHtml,
  clearClipboard,
} from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const fileDialogs: Demo = {
  id: "dialog.file",
  title: "文件对话框 open / save",
  description: "原生打开/保存对话框；返回所选路径，取消返回 null。",
  code: `import { open, save } from "@zturnlibs/ztron-api";

const file = await open({
  title: "选择一个文件",
  filters: ["txt", "md", "json"],   // 扩展名过滤
});
if (file) console.log("选中：", file);

const target = await save({ title: "保存到哪里" });`,
  docPath: "/plugins/dialog.html",
  mount(area, out) {
    area.append(
      act(out, "打开文件", async () => {
        const file = await open({ title: "选择一个文件", filters: ["txt", "md", "json"] });
        out.ok(file ? `选中：${file}` : "已取消");
      }),
      act(out, "保存对话框", async () => {
        const target = await save({ title: "保存到哪里" });
        out.ok(target ? `目标：${target}` : "已取消");
      }),
    );
  },
};

const msgDialogs: Demo = {
  id: "dialog.message",
  title: "消息对话框 message / ask / confirm",
  description: "系统级提示框：message 纯提示；ask/confirm 带按钮，返回布尔值。",
  code: `import { message, ask, confirm } from "@zturnlibs/ztron-api";

await message({ title: "提示", message: "Hello Ztron", kind: "info" });
const yes = await ask({ title: "确认", message: "继续吗？" });
const ok = await confirm({ title: "确认", message: "保存修改？" });`,
  docPath: "/plugins/dialog.html",
  mount(area, out) {
    area.append(
      act(out, "message(info)", async () => {
        await message({ title: "Ztron Showcase", message: "这是一个原生消息框", kind: "info" });
        out.ok("message 已关闭");
      }),
      act(out, "ask", async () => {
        const yes = await ask({ title: "确认", message: "Ztron 好用吗？" });
        out.ok(`你选择了：${yes ? "是" : "否"}`);
      }),
      act(out, "confirm", async () => {
        const ok = await confirm({ title: "确认", message: "保存这份草稿？" });
        out.ok(`confirm 返回：${ok}`);
      }),
    );
  },
};

const notif: Demo = {
  id: "dialog.notification",
  title: "系统通知",
  description: "先查/请求通知权限再发送（未授权时 send 会静默失败）。",
  code: `import {
  sendNotification, isPermissionGranted, requestPermission,
} from "@zturnlibs/ztron-api";

let granted = await isPermissionGranted();
if (!granted) granted = await requestPermission();
if (granted) {
  await sendNotification({ title: "Ztron", body: "来自 showcase 的通知" });
}`,
  docPath: "/plugins/notification.html",
  mount(area, out) {
    area.append(
      act(out, "发一条通知", async () => {
        let granted = await isPermissionGranted();
        if (!granted) granted = await requestPermission();
        if (!granted) {
          out.fail("通知权限未授予（dev 裸二进制常见，打包 .app 后可授权）");
          return;
        }
        await sendNotification({ title: "Ztron Showcase", body: "这是一条系统通知" });
        out.ok("通知已发出（看屏幕右上角）");
      }),
    );
  },
};

const clipboardDemo: Demo = {
  id: "dialog.clipboard",
  title: "剪贴板",
  description: "读写文本与 HTML，支持清除；写完可去任意应用粘贴验证。",
  code: `import {
  writeClipboardText, readClipboardText,
  writeClipboardHtml, readClipboardHtml, clearClipboard,
} from "@zturnlibs/ztron-api";

await writeClipboardText("来自 Ztron");
const text = await readClipboardText();

await writeClipboardHtml("<b>加粗</b>");
const html = await readClipboardHtml();
await clearClipboard();`,
  docPath: "/plugins/clipboard.html",
  mount(area, out) {
    const text = field("要写的文本", "来自 Ztron Showcase");
    area.append(
      text,
      act(out, "写文本", async () => {
        await writeClipboardText(fieldValue(text));
        out.ok("已写入剪贴板，去别处粘贴试试");
      }),
      act(out, "读文本", async () => {
        out.ok(`剪贴板：${(await readClipboardText()) ?? "(空)"}`);
      }),
      act(out, "HTML 往返", async () => {
        await writeClipboardHtml("<b>ztron-html</b>");
        out.ok(`读回 HTML：${await readClipboardHtml()}`);
      }),
      act(out, "清除", async () => {
        await clearClipboard();
        out.ok("已清除");
      }),
    );
  },
};

export const dialogDemos: Demo[] = [fileDialogs, msgDialogs, notif, clipboardDemo];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "对话框与通知", demos: dialogDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 四卡逐个点：对话框真弹出、ask/confirm 返回随点击变化；通知出现在系统通知中心（权限被拒时红色提示属预期）；剪贴板与备忘录互贴成功。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase dialog demos - open-save/message-ask-confirm/notification/clipboard"
```

---

### Task 7: demos/net.ts（3 卡：fetch / fetchStream / websocket）

**Files:**
- Create: `examples/showcase/frontend/src/demos/net.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`http`/`fetchStream`/`websocket`；后端 `showcase:echo-port`（Task 1 已建，含 /stream 端点）。
- Produces: `export const netDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/net.ts（完整文件）**

```ts
import { http, fetchStream, websocket, invoke } from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";

const fetchDemo: Demo = {
  id: "net.fetch",
  title: "HTTP 请求 fetch",
  description: "经后端代理的 fetch，受 scope 白名单约束（已放行 api.github.com 与 localhost）；越界域名直接被拒。",
  code: `import { http } from "@zturnlibs/ztron-api";

const resp = await http.fetch("https://api.github.com/zen");
console.log(resp.status, resp.ok, resp.body);

// scope 未放行的域名会抛错（见本卡片第二个按钮）
await http.fetch("https://evil.example.com/steal");`,
  docPath: "/plugins/http.html",
  mount(area, out) {
    area.append(
      act(out, "GET api.github.com/zen", async () => {
        const resp = await http.fetch("https://api.github.com/zen");
        out.ok(`status ${resp.status}\n${resp.body}`);
      }),
      act(out, "越界域名（scope 拒绝演示）", async () => {
        try {
          await http.fetch("https://evil.example.com/steal");
          out.ok("竟然放行了？请检查 http scope 配置");
        } catch (e) {
          out.ok(`符合预期被拒绝：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

const streamDemo: Demo = {
  id: "net.stream",
  title: "流式下载 fetchStream",
  description: "响应头先返回，body 以 chunk 持续推送（ReadableStream），适合大文件与进度条。",
  code: `import { fetchStream } from "@zturnlibs/ztron-api";

const resp = await fetchStream(url);   // 头部先到
const reader = resp.body.getReader();
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  console.log("收到 chunk", value.length, "字节");
}`,
  docPath: "/plugins/http.html",
  mount(area, out) {
    area.append(
      act(out, "流式读取本地 /stream", async () => {
        const port = await invoke<number>("showcase:echo-port", {});
        const t0 = Date.now();
        const resp = await fetchStream(`http://localhost:${port}/stream`);
        const headMs = Date.now() - t0;
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let chunks = 0;
        let text = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          chunks++;
          text += dec.decode(value);
        }
        out.ok(
          `头部 ${headMs}ms 到达，body 分 ${chunks} 段、共 ${Date.now() - t0}ms 读尽：\n${text}`,
        );
      }),
    );
  },
};

const wsDemo: Demo = {
  id: "net.websocket",
  title: "WebSocket",
  description: "经后端托管的 WebSocket（连接/发消息/收消息/断开）；用公共回声服务器演示往返，需外网。",
  code: `import { websocket } from "@zturnlibs/ztron-api";

const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
websocket.onMessage((e) => console.log("收到：", e.message));
await websocket.sendMessage(id, "hello ztron");
await websocket.disconnect(id);`,
  docPath: "/plugins/websocket.html",
  mount(area, out) {
    area.append(
      act(out, "连接回声服务器并收发", async () => {
        const echoed = new Promise<string>((resolve) => {
          void websocket.onMessage((e) => resolve(e.message));
        });
        const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
        await websocket.sendMessage(id, "hello ztron");
        const msg = await Promise.race([
          echoed,
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ]);
        await websocket.disconnect(id);
        if (msg && msg.includes("hello ztron")) {
          out.ok(`往返成功：${msg}`);
        } else {
          out.fail(`8 秒内未收到回声（需外网）：${msg}`);
        }
      }),
    );
  },
};

export const netDemos: Demo[] = [fetchDemo, streamDemo, wsDemo];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "网络", demos: netDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — fetch 输出 GitHub zen 格言（离线时红色报错属网络问题）；stream 输出 8 段 chunk 序列且头耗时应明显小于总耗时；websocket 打印回声（离线红色属预期）。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase net demos - fetch/stream/websocket"
```

---

### Task 8: demos/menu-tray.ts（3 卡：应用菜单 / 托盘 / 全局快捷键）

**Files:**
- Create: `examples/showcase/frontend/src/demos/menu-tray.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`setAppMenu`/`Menu`/`TrayIcon`/`registerShortcut`/`unregisterShortcut`/`isRegistered`/`onShortcut`。
- Produces: `export const menuTrayDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/menu-tray.ts（完整文件）**

```ts
import {
  setAppMenu,
  Menu,
  TrayIcon,
  registerShortcut,
  unregisterShortcut,
  isRegistered,
  onShortcut,
} from "@zturnlibs/ztron-api";
import { act, type Demo } from "../demo-ui";

const menuDemo: Demo = {
  id: "menu.app",
  title: "应用菜单",
  description: "构建原生应用菜单栏：子菜单、勾选/单选、分隔线、加速键；点击 View 菜单可见。",
  code: `import { setAppMenu } from "@zturnlibs/ztron-api";

const menu = await setAppMenu([
  { id: "new", text: "New Window" },
  { id: "sep", text: "-", separator: true },
  { id: "view", text: "View", children: [
    { id: "zoom", text: "Zoom", type: "check", checked: true },
    { id: "s", text: "Small", type: "radio", checked: true },
    { id: "l", text: "Large", type: "radio" },
  ]},
  { id: "quit", text: "Quit" },
]);
await menu.setItemAccelerator("quit", "CmdOrCtrl+Q");
await menu.setItemChecked("zoom", false);`,
  docPath: "/plugins/menu.html",
  mount(area, out) {
    let menu: Awaited<ReturnType<typeof setAppMenu>> | null = null;
    let zoomChecked = true;
    area.append(
      act(out, "安装示例菜单", async () => {
        menu = await setAppMenu([
          { id: "new", text: "New Window" },
          { id: "sep", text: "-", separator: true },
          {
            id: "view",
            text: "View",
            children: [
              { id: "zoom", text: "Zoom", type: "check", checked: true },
              { id: "s", text: "Small", type: "radio", checked: true },
              { id: "l", text: "Large", type: "radio" },
            ],
          },
          { id: "quit", text: "Quit" },
        ]);
        await menu.setItemAccelerator("quit", "CmdOrCtrl+Q");
        out.ok("已安装（看屏幕顶部菜单栏），quit 已绑定 CmdOrCtrl+Q");
      }),
      act(out, "切换 Zoom 勾选", async () => {
        if (!menu) {
          out.fail("请先安装示例菜单");
          return;
        }
        zoomChecked = !zoomChecked;
        await menu.setItemChecked("zoom", zoomChecked);
        out.ok(`Zoom 已切换为${zoomChecked ? "勾选" : "不勾选"}（打开 View 菜单核对）`);
      }),
    );
  },
};

const trayDemo: Demo = {
  id: "menu.tray",
  title: "系统托盘 TrayIcon",
  description: "在菜单栏创建托盘：模板图标自适应深浅色、悬停提示、显隐控制。",
  code: `import { TrayIcon } from "@zturnlibs/ztron-api";

const tray = await TrayIcon.create({
  title: "Z",
  tooltip: "Ztron Showcase 托盘",
});
await tray.setIconAsTemplate(true);   // macOS 模板图标
await tray.setVisible(false);
await tray.destroy();`,
  docPath: "/plugins/tray.html",
  mount(area, out) {
    area.append(
      act(out, "创建托盘（5 秒后销毁）", async () => {
        const tray = await TrayIcon.create({ title: "Z", tooltip: "Ztron Showcase 托盘" });
        out.info("托盘已出现在菜单栏右上角（标题 Z）");
        await tray.setIconAsTemplate(true);
        await new Promise((r) => setTimeout(r, 5000));
        await tray.destroy();
        out.ok("托盘已销毁");
      }),
    );
  },
};

const shortcut: Demo = {
  id: "menu.shortcut",
  title: "全局快捷键",
  description: "注册系统级快捷键，应用在后台也能收到触发事件；注册后切到别的应用按 Cmd+Shift+J 试试。",
  code: `import { registerShortcut, isRegistered, onShortcut } from "@zturnlibs/ztron-api";

await registerShortcut("showcase", "Cmd+Shift+J");
console.log("已注册：", await isRegistered("showcase"));

const un = await onShortcut((e) => {
  console.log("触发：", e.shortcutId);   // "showcase"
});
// await unregisterShortcut("showcase"); un();`,
  docPath: "/plugins/global-shortcut.html",
  mount(area, out) {
    area.append(
      act(out, "注册 Cmd+Shift+J（10 秒窗口）", async () => {
        await registerShortcut("showcase-demo", "Cmd+Shift+J");
        const reg = await isRegistered("showcase-demo");
        out.info(`注册${reg ? "成功" : "失败"}，切到其他应用按 Cmd+Shift+J`);
        let firedSeen = false;
        const fired = await onShortcut((e) => {
          firedSeen = true;
          out.info(`触发：${e.shortcutId}`);
        });
        await new Promise((r) => setTimeout(r, 10000));
        await unregisterShortcut("showcase-demo");
        await fired();
        out.ok(firedSeen ? "捕获到全局触发" : "10 秒内未触发（快捷键可能被其他应用占用）");
      }),
    );
  },
};

export const menuTrayDemos: Demo[] = [menuDemo, trayDemo, shortcut];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "菜单与托盘", demos: menuTrayDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — 菜单栏出现 New Window/View/Quit 且 Cmd+Shift+Q 生效（按下会退出应用，属预期，重跑 dev 即可）；Zoom 勾选切换可在菜单里核对；托盘 Z 图标出现又消失；全局快捷键在切走后触发有 info 行。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase menu-tray demos - appmenu/tray/global-shortcut"
```

---

### Task 9: demos/data.ts（3 卡：Store / SQL / 日志）

**Files:**
- Create: `examples/showcase/frontend/src/demos/data.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`store`/`Database`/`logger`/`attachConsole`/`path`。
- Produces: `export const dataDemos: Demo[]`（3 项）。

- [ ] **Step 1: 写 demos/data.ts（完整文件）**

```ts
import { store, Database, logger, attachConsole, path } from "@zturnlibs/ztron-api";
import { act, field, fieldValue, type Demo } from "../demo-ui";

const storeDemo: Demo = {
  id: "data.store",
  title: "键值存储 Store",
  description: "JSON 文件落盘的持久化 KV；写一次，重启应用后读取仍在。",
  code: `import { store } from "@zturnlibs/ztron-api";

const file = await path.tempDir() + "/ztron_store.json";
await store.set(file, "greeting", "hello");
const v = await store.get<string>(file, "greeting");
await store.clear(file);`,
  docPath: "/plugins/store.html",
  mount(area, out) {
    const kv = field("要存的值", "hello-store");
    area.append(
      kv,
      act(out, "set", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        await store.set(file, "greeting", fieldValue(kv) || "hello");
        out.ok(`已写入 ${file}`);
      }),
      act(out, "get", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        out.ok(`读取：${await store.get<string>(file, "greeting")}`);
      }),
      act(out, "clear", async () => {
        const file = `${await path.tempDir()}/ztron_showcase_store.json`;
        await store.clear(file);
        out.ok("已清空");
      }),
    );
  },
};

const sqlDemo: Demo = {
  id: "data.sql",
  title: "SQLite 数据库",
  description: "Database.load 打开（自动创建）SQLite 文件；execute 建表/插数，select 参数化查询。",
  code: `import { Database, path } from "@zturnlibs/ztron-api";

const db = await Database.load(\`\${await path.tempDir()}/app.db\`);
await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello"]);
const rows = await db.select<{ text: string }>("SELECT * FROM notes");
await db.close();`,
  docPath: "/plugins/sql.html",
  mount(area, out) {
    const note = field("便签内容", "第一条便签");
    area.append(
      note,
      act(out, "插入一条", async () => {
        const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
        await db.execute("CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)");
        await db.execute("INSERT INTO notes(text) VALUES(?)", [fieldValue(note)]);
        await db.close();
        out.ok(`已插入「${fieldValue(note)}」`);
      }),
      act(out, "查询全部", async () => {
        const db = await Database.load(`${await path.tempDir()}/ztron_showcase.db`);
        const rows = await db.select<{ id: number; text: string }>(
          "SELECT id, text FROM notes ORDER BY id",
        );
        await db.close();
        out.ok(rows.length ? rows.map((r) => `${r.id}: ${r.text}`).join("\n") : "(空表)");
      }),
    );
  },
};

const logDemo: Demo = {
  id: "data.log",
  title: "结构化日志",
  description: "logger 同时写 stdout/文件/webview 三个 target；attachConsole 把日志回传页面。",
  code: `import { logger, attachConsole } from "@zturnlibs/ztron-api";

await logger.info("来自 showcase");
await logger.error("出错了");

// 把 webview target 的日志接到页面 console
const detach = await attachConsole();
// ...
detach();`,
  docPath: "/plugins/log.html",
  mount(area, out) {
    const msg = field("日志内容", "hello log");
    area.append(
      msg,
      act(out, "写 info / error", async () => {
        await logger.info(fieldValue(msg));
        await logger.error(`${fieldValue(msg)} (error 级别)`);
        out.ok("已写入。终端可见 stdout 版本；文件在 ~/Library/Logs/com.ztron.showcase/");
      }),
      act(out, "attachConsole 回显", async () => {
        let seen: string | null = null;
        const detach = await attachConsole({
          logger: (m: string) => {
            if (m.includes("showcase-log")) seen = m;
          },
        });
        await logger.warn("showcase-log attachConsole 演示");
        await new Promise((r) => setTimeout(r, 500));
        detach();
        out.ok(seen ? `页面收到：${seen}` : "未收到回显（可再试一次）");
      }),
    );
  },
};

export const dataDemos: Demo[] = [storeDemo, sqlDemo, logDemo];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "数据", demos: dataDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。

- [ ] **Step 4: dev 人工点验** — store set 后 get 读回同值；sql 插入两条后查询出两行；log 终端与 `~/Library/Logs/com.ztron.showcase/` 均有记录，attachConsole 回显带 `[WARN]`。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase data demos - store/sql/log"
```

---

### Task 10: demos/system.ts（9 卡：应用信息 / shell / opener / 单实例 / deep-link / 自启 / 窗口状态 / 网络 / 更新器）

**Files:**
- Create: `examples/showcase/frontend/src/demos/system.ts`
- Modify: `examples/showcase/frontend/src/main.ts`

**Interfaces:**
- Consumes: 共享接口；`os`/`shell`/`openUrl`/`openPath`/`revealItemInDir`/`isPrimaryInstance`/`onDeepLink`/`enableAutostart`/`disableAutostart`/`isAutostartEnabled`/`saveWindowState`/`restoreWindowState`/`setPosition`/`getPosition`/`getLocalIpv4`/`getNetworkIpv4`/`getLocalIpv6`/`getPublicIp`/`updater`/`path`。
- Produces: `export const systemDemos: Demo[]`（9 项）。

- [ ] **Step 1: 写 demos/system.ts（完整文件）**

```ts
import {
  os,
  shell,
  path,
  openUrl,
  openPath,
  revealItemInDir,
  isPrimaryInstance,
  onDeepLink,
  enableAutostart,
  disableAutostart,
  isAutostartEnabled,
  saveWindowState,
  restoreWindowState,
  setPosition,
  getPosition,
  getLocalIpv4,
  getNetworkIpv4,
  getLocalIpv6,
  getPublicIp,
  updater,
} from "@zturnlibs/ztron-api";
import { act, extractError, type Demo } from "../demo-ui";

const appInfo: Demo = {
  id: "system.appinfo",
  title: "应用与系统信息",
  description: "os 模块读平台/架构/语言；这是适配平台差异的第一步。",
  code: `import { os } from "@zturnlibs/ztron-api";

const info = await os.info();   // { platform, arch, version, ... }
const type = await os.type();   // "Darwin" / "Windows_NT" / "Linux"
const eol = await os.eol();     // "\\n" 或 "\\r\\n"
const locale = await os.locale();`,
  docPath: "/plugins/os.html",
  mount(area, out) {
    area.append(
      act(out, "读取系统信息", async () => {
        const info = await os.info();
        const [type, eol, locale] = await Promise.all([os.type(), os.eol(), os.locale()]);
        out.ok(
          `platform: ${info.platform}\narch: ${info.arch}\ntype: ${type}\neol: ${JSON.stringify(eol)}\nlocale: ${locale}`,
        );
      }),
    );
  },
};

const shellDemo: Demo = {
  id: "system.shell",
  title: "执行命令 shell",
  description: "运行外部命令并捕获输出；scope 白名单决定允许的程序（本应用放行 echo/pwd/cat/sh）。",
  code: `import { shell } from "@zturnlibs/ztron-api";

const r = await shell.execute("echo", ["hi"]);
console.log(r.stdout, r.stderr, r.code);

// cwd 选项
const r2 = await shell.execute("pwd", [], { cwd: "/tmp" });

// 越权程序（scope 未放行）会抛错
await shell.execute("curl", ["http://example.com"]);`,
  docPath: "/plugins/shell.html",
  mount(area, out) {
    area.append(
      act(out, "echo 你好", async () => {
        const r = await shell.execute("echo", ["你好 shell"]);
        out.ok(`stdout: ${r.stdout.trim()}\ncode: ${r.code}`);
      }),
      act(out, "pwd（带 cwd）", async () => {
        const tmp = await path.tempDir();
        const r = await shell.execute("pwd", [], { cwd: tmp });
        out.ok(`stdout: ${r.stdout.trim()}`);
      }),
      act(out, "越权程序（scope 拒绝演示）", async () => {
        try {
          await shell.execute("curl", ["http://example.com"]);
          out.ok("竟然放行了？请检查 shell scope 配置");
        } catch (e) {
          out.ok(`符合预期被拒绝：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

const openerDemo: Demo = {
  id: "system.opener",
  title: "打开 URL / 文件",
  description: "用系统默认应用打开链接或目录，在访达中定位文件。",
  code: `import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api";

await openUrl("https://zturnlibs.github.io/ztron/");
await openPath("/tmp");               // 访达打开目录
await revealItemInDir("/etc/hosts");  // 定位并选中`,
  docPath: "/plugins/opener.html",
  mount(area, out) {
    area.append(
      act(out, "打开 Ztron 文档站", async () => {
        await openUrl("https://zturnlibs.github.io/ztron/");
        out.ok("已在默认浏览器打开");
      }),
      act(out, "访达打开临时目录", async () => {
        await openPath(await path.tempDir());
        out.ok("访达已打开");
      }),
      act(out, "定位 hosts 文件", async () => {
        await revealItemInDir("/etc/hosts");
        out.ok("访达已定位 /etc/hosts");
      }),
    );
  },
};

const singleInstance: Demo = {
  id: "system.single-instance",
  title: "单实例",
  description: "isPrimaryInstance 判断是否首个实例；二次启动时参数会转交给首实例。",
  code: `import { isPrimaryInstance } from "@zturnlibs/ztron-api";

const primary = await isPrimaryInstance();
if (primary) console.log("我是主实例");
// 再次启动 app 时，第二实例自动退出并把 argv 转交主实例`,
  docPath: "/plugins/single-instance.html",
  mount(area, out) {
    area.append(
      act(out, "查询实例身份", async () => {
        const primary = await isPrimaryInstance();
        out.ok(primary ? "我是主实例（再次启动 app 会转交参数并退出）" : "我是从实例");
      }),
    );
  },
};

const deepLink: Demo = {
  id: "system.deep-link",
  title: "深层链接 deep-link",
  description: "处理 ztron:// 协议 URL。dev 裸二进制注册不了协议，打包 .app 后从浏览器打开 ztron://showcase/hello 可触发。",
  code: `import { onDeepLink } from "@zturnlibs/ztron-api";

const un = await onDeepLink((url) => {
  console.log("收到深层链接：", url);   // "ztron://showcase/hello"
});
un();`,
  docPath: "/plugins/deep-link.html",
  mount(area, out) {
    area.append(
      act(out, "挂监听", async () => {
        await onDeepLink((url) => out.info(`收到：${url}`));
        out.ok("监听已挂上。触发前提：打包 .app 并注册 CFBundleURLTypes（见文档）");
      }),
    );
  },
};

const autostart: Demo = {
  id: "system.autostart",
  title: "开机自启",
  description: "enable / disable / isEnabled 三件套（macOS 写入登录项）。",
  code: `import { enableAutostart, disableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api";

await enableAutostart();
console.log(await isAutostartEnabled());   // true
await disableAutostart();`,
  docPath: "/plugins/autostart.html",
  mount(area, out) {
    area.append(
      act(out, "开启自启", async () => {
        await enableAutostart();
        out.ok(`当前状态：${await isAutostartEnabled()}`);
      }),
      act(out, "关闭自启", async () => {
        await disableAutostart();
        out.ok(`当前状态：${await isAutostartEnabled()}`);
      }),
    );
  },
};

const winState: Demo = {
  id: "system.window-state",
  title: "窗口状态记忆与定位",
  description: "window-state 保存/恢复窗口位置；positioner 把窗口摆到指定坐标。",
  code: `import {
  saveWindowState, restoreWindowState, setPosition, getPosition,
} from "@zturnlibs/ztron-api";

const saved = await saveWindowState();   // { x, y, width, height }
await setPosition(100, 100);
const pos = await getPosition();
await restoreWindowState();              // 回到保存的位置`,
  docPath: "/plugins/window-state.html",
  mount(area, out) {
    area.append(
      act(out, "移到 (100, 100)", async () => {
        await setPosition(100, 100);
        out.ok(`当前位置：${JSON.stringify(await getPosition())}`);
      }),
      act(out, "保存并恢复", async () => {
        const saved = await saveWindowState();
        await setPosition(saved.x + 60, saved.y + 60);
        out.info("窗口已挪动，0.8 秒后恢复…");
        await new Promise((r) => setTimeout(r, 800));
        await restoreWindowState();
        out.ok(`已回到 (${saved.x}, ${saved.y})`);
      }),
    );
  },
};

const network: Demo = {
  id: "system.network",
  title: "网络信息",
  description: "本机 IPv4/IPv6、主网卡地址、公网出口（需外网）。",
  code: `import {
  getLocalIpv4, getLocalIpv6, getNetworkIpv4, getPublicIp,
} from "@zturnlibs/ztron-api";

console.log(await getLocalIpv4());    // 192.168.x.x
console.log(await getNetworkIpv4());  // 主网卡
console.log(await getPublicIp());     // 公网出口（需外网）`,
  docPath: "/plugins/network.html",
  mount(area, out) {
    area.append(
      act(out, "读取网络信息", async () => {
        const v4 = await getLocalIpv4();
        const net = await getNetworkIpv4();
        const v6 = await getLocalIpv6().catch(() => null);
        const pub = await getPublicIp().catch(() => null);
        out.ok(
          `本机 IPv4：${v4}\n主网卡：${net}\nIPv6：${v6 ?? "无"}\n公网出口：${pub ?? "不可达（需外网）"}`,
        );
      }),
    );
  },
};

const updaterDemo: Demo = {
  id: "system.updater",
  title: "应用更新 updater",
  description: "check() 拉取更新清单比对版本。真实更新依赖签名与 endpoint；这里请求一个不存在的端口，展示报错路径。",
  code: `import { updater } from "@zturnlibs/ztron-api";

const result = await updater.check("https://my-app.com/latest.json");
if (result.hasUpdate) {
  console.log(\`新版本 \${result.version}\`);
  // 生产环境：download -> verify -> install
}`,
  docPath: "/plugins/updater.html",
  mount(area, out) {
    area.append(
      act(out, "check（演示失败路径）", async () => {
        try {
          const result = await updater.check("http://localhost:9/latest.json");
          out.ok(JSON.stringify(result));
        } catch (e) {
          out.ok(`如预期失败（无可用更新服务）：${extractError(e).slice(0, 80)}`);
        }
      }),
    );
  },
};

export const systemDemos: Demo[] = [
  appInfo,
  shellDemo,
  openerDemo,
  singleInstance,
  deepLink,
  autostart,
  winState,
  network,
  updaterDemo,
];
```

- [ ] **Step 2: CATALOG 登记** — `{ category: "系统集成", demos: systemDemos },`

- [ ] **Step 3: typecheck** — Expected: exit 0。若 `os.info()` 返回类型的 `arch` 字段名不同（以 `packages/api/src/os.ts` 的 `OsInfo` 为准），用实际字段名替换。

- [ ] **Step 4: dev 人工点验** — 9 卡逐个点：系统信息输出 platform/arch；echo/pwd 绿色、curl 被拒红色转 ok；浏览器/访达动作真实发生；单实例输出主实例；自启开关状态翻转；窗口挪动与恢复；网络信息输出 IP；updater 如期失败转 ok。

- [ ] **Step 5: Commit**

```bash
git add examples/showcase/frontend
git commit -m "feat(examples): showcase system demos - 9 integration cards"
```

---

### Task 11: 文档接入 + 全量冒烟

**Files:**
- Modify: `docs/zh/start/examples.md`、`docs/en/start/examples.md`、`README.md`

**Interfaces:**
- Consumes: 前 10 个任务的完整 showcase；`ztron check` 的 `--expect SHOWCASE_OK` 门禁。
- Produces: 文档站示例页含 showcase 条目；CI 可用的冒烟命令。

- [ ] **Step 1: 更新 docs/zh/start/examples.md**

表格加一行（放 bench 行之后）：

```markdown
| showcase | `@zturnlibs/ztron-example-showcase` | 新手交互式演示：31 张功能卡片 + 代码片段 + 文档直达 | `pnpm --filter @zturnlibs/ztron-example-showcase dev` |
```

文末（bench 小节后）追加小节：

```markdown
## showcase

面向**新手应用开发者**的交互式演示应用（对标 Electron API Demos）：左侧分类导航，
每个功能一张卡片，点按钮真跑、卡片内嵌最小代码片段、「文档」按钮直达文档站对应页面。
覆盖核心 IPC/事件/Channel、窗口与多窗口、fs/path、http/流式/WebSocket、对话框/通知/剪贴板、
菜单/托盘/全局快捷键、store/sql/log、以及系统集成九件套。其 `ztron.conf.json` 与
`capabilities/` 本身就是新手项目的配置范本。冒烟门禁：`ztron check --expect SHOWCASE_OK`。
源码：`examples/showcase/`。
```

注意：若实际卡片数不是 31，以 `frontend/src/main.ts` CATALOG 实际数量为准修正文字。

- [ ] **Step 2: 更新 docs/en/start/examples.md** — 同步英文镜像（表行 + 同等信息的英文小节；如该文件结构与 zh 不一致，按其现有结构等价插入）。

- [ ] **Step 3: README.md 提一行** — 在「## Documentation」小节追加一句：

```markdown
A beginner-friendly interactive demo lives at `examples/showcase/` (run with
`pnpm --filter @zturnlibs/ztron-example-showcase dev`); see [docs/zh/start/examples.md](./docs/zh/start/examples.md).
```

- [ ] **Step 4: 全量 typecheck + 既有测试不回归**

Run: `pnpm --filter @zturnlibs/ztron-example-showcase typecheck && pnpm test:unit`
Expected: 两者 exit 0；单测数不少于改动前（本计划不新增测试，也不应破坏既有 109 通过）。

- [ ] **Step 5: 冒烟门禁**

Run: `cd examples/showcase && pnpm exec ztron check --expect SHOWCASE_OK --timeout 60000; cd ../..`
Expected: 终端出现 `[showcase] frontend reported: "SHOWCASE_OK:31"`（数字=实际卡片数），`check` 输出含 `checks passed` 且 exit 0。若 `check` 无法定位示例入口，先在该目录内跑通 `pnpm dev` 确认 tag 行出现，再检查 `packages/cli/src/index.ts` 的 check 子命令参数（可能需要 `--entry src/main.ts`）。

- [ ] **Step 6: 视觉与文案终检（design-taste 预检清单的应用面）**

dev 起窗口逐项确认：全窗深色无浅色区块；渐变仅出现在字标与（如用）primary 按钮；无 emoji、无 `—`、无装饰圆点；每卡输出区空态提示语可见；`prefers-reduced-motion` 开启时无过渡动画（系统设置里切换验证）。

- [ ] **Step 7: Commit**

```bash
git add docs/zh/start/examples.md docs/en/start/examples.md README.md
git commit -m "docs(examples): showcase entry in start/examples (zh+en) + README pointer"
```

---

## Self-Review 记录

1. **规格覆盖**：规格第 4 节架构 → Task 1/2；第 5 节 31 卡清单 → Task 3-10（逐卡 docPath 一致）；第 6 节验证（dev 点验/SHOWCASE_OK/typecheck/文档 zh+en+README）→ 各任务 Step 与 Task 11；第 0 节视觉（令牌/圆角/图标/动效/反套路）→ Task 2 Step 2-3 + Task 11 Step 6。规格第 4.3 的「openUrl 失败降级 window.open」→ Task 2 renderCard 已含。
2. **占位符**：无 TBD/TODO；所有代码步骤给全量代码，无中间版本残留。
3. **类型一致性**：`Demo.mount(area, out)` 签名在接口定义与全部 31 个 demo 一致；`act(out, label, run)`/`field(label, placeholder?, value?)` 用法一致；`docUrl(docPath)`、`showcase:report|emit-ticks|stream|echo-port|greet|add|echo` 命令 id 前后端一致；`updater.check`/`onShortcut`/`TrayIcon.create`/`os.info` 均已对照 `packages/api/src/*.ts` 实际导出核实。
