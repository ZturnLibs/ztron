### Task 4: 中文「指南」7 页 + CLI 参考

**Files:**
- Create: `docs/zh/guide/_meta.json` 及 7 个指南页、`docs/zh/reference/_meta.json`、`docs/zh/reference/cli.md`

**Interfaces:**
- Consumes: Task 3 的侧边栏/首页链接目标（`/guide/architecture`、`/reference/cli`）；事实源见 Global Constraints
- Produces: 路由 `/guide/*`、`/reference/cli`（zh）

- [ ] **Step 1: 写 `docs/zh/guide/_meta.json` 与 `docs/zh/reference/_meta.json`**

```json
[
  { "text": "架构总览", "link": "/guide/architecture" },
  { "text": "调用后端命令", "link": "/guide/ipc" },
  { "text": "事件与 Channel", "link": "/guide/events" },
  { "text": "窗口", "link": "/guide/window" },
  { "text": "配置 ztron.conf.json", "link": "/guide/config" },
  { "text": "安全模型", "link": "/guide/security" },
  { "text": "从 Tauri 迁移", "link": "/guide/tauri-migration" }
]
```

```json
[
  { "text": "CLI 参考", "link": "/reference/cli" }
]
```

- [ ] **Step 2: `docs/zh/guide/architecture.md`** —— 贴 README 四框图 + 双进程数据流说明（ztron-host（C，窗口/托盘/菜单）↔ TCP/JSON ↔ tjs backend（@ztron/core IPC/插件/ACL））；五包职责表（照 README Packages 表：api/core/runtime-ffi/inject/cli）；「深入阅读」链接仓库 `DESIGN.md`。

- [ ] **Step 3: `docs/zh/guide/ipc.md`** —— 必含以下真实代码（摘自 `examples/hello/src/commands.ts` 与 `src/main.ts`）：

```ts
// src/commands.ts —— 类型化命令（可被 ztron codegen 识别）
import { defineCommand } from "@ztron/core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});
```

```ts
// src/main.ts —— 注册（setup 回调内）
app.commandDef(greet);            // 类型化
app.command("m3:echo-port", () => echoPort);  // 内联
```

```ts
// frontend/src/main.ts —— 前端调用
import { invoke } from "@ztron/api";
const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });
```

并说明 `ztron codegen` 生成 `src/ztron-commands.ts` 类型绑定后 `g.invoke("my:greet", { name: "codegen" })` 的用法（同源：hello 前端第 103–110 行）；一段「命令为何受能力约束」预告链接 ../guide/security。

- [ ] **Step 4: `docs/zh/guide/events.md`** —— listen/once/emit/emitTo 代码示例（基于 `packages/api/src/event.ts` 真实签名：`listen<T>(event, cb, options?) → Promise<UnlistenFn>`，`UnlistenFn = () => Promise<void>`）；窗口事件名表（原样列 `window.ts` 的 `WindowEventName` 11 项：resize/move/focus/blur/close-requested/scale-change/theme-changed/drag-enter/drag-over/drag-drop/drag-leave）；一句带过插件监听器 `plugin:*|__listener` 契约（详解留 P2 插件页）。

- [ ] **Step 5: `docs/zh/guide/window.md`** —— 声明式：摘录 `examples/hello/ztron.conf.json` 双窗配置（main 窗 `url: "frontend"` + conf-second 窗 `html` 内联，含 width/height/minWidth/titleBarStyle/alwaysOnTop/x/y 字段展示）；运行时：`WebviewWindow`（`@ztron/api`，multiwin 示例运行时创建/销毁第二窗，验证锚点 `SECOND_WINDOW_OK`）；平台边界注记：运行时多窗创建在 macOS 已解锁、webview 库在运行循环中的限制历史见 `DESIGN.md` §75。

- [ ] **Step 6: `docs/zh/guide/config.md`** —— 摘录 hello `ztron.conf.json` 全文；核心字段表（P1 子集，来源 `packages/core/src/app.ts` 的 `ProjectConfigFile`）：`entry`/`frontend`/`identifier`/`productName`(appName 别名)/`appName`/`mainBinaryName`/`version`/`csp`(旧顶层，建议用 app.security.csp)/`capabilities`(旧顶层)/`build.{devUrl,frontendDist,beforeDevCommand,beforeBuildCommand,beforeBundleCommand}`/`app.{withGlobalTauri,macOSPrivateApi}`/`app.security.{csp,devCsp,capabilities,assetProtocol.{scope,requireLiteralLeadingDot},freezePrototype}`/`bundle.{active,targets,icon,resources,category,publisher,homepage,shortDescription,longDescription,copyright,license}`/`plugins`/`windows[]`；校验行为说明（未知顶层键告警、违规抛错）；预告 P2 将从类型自动生成全量参考。

- [ ] **Step 7: `docs/zh/guide/security.md`** —— 摘录 `examples/hello/capabilities/main.json` 头部（identifier/description/windows/permissions 数组，含 `core:default`、`fs:write-default`、`http:default` 等真实权限串）；权限串格式 `plugin:permission` 说明；scope 三模型各一段 + 真实示例（PathScope `"$TMP/**"`、HttpScope `{ url: "https://api.github.com/*" }`、store scope `{ allow: ["$TMP/**"] }`，均摘自 hello main.ts）；CSP：`app.security.csp` 注入 + `devCsp` 分离；验证锚点 `ACL_DENY_OK`、`HTTP_SCOPE_DENY_OK`。

- [ ] **Step 8: `docs/zh/guide/tauri-migration.md`** —— 照抄 `DESIGN.md` §9 八行对照表（tauri-runtime-wry→runtime-ffi、tauri core→core、tauri-codegen 注入→inject、ipc/mod.rs→core/ipc、tauri-plugin→TS 插件、tauri-bundler→tjs compile+打包脚本、tauri-utils→schema+注入 CSP、@tauri-apps/api→api）；映射三小节：命令（Rust `#[tauri::command]` → `defineCommand`/`app.command`）、配置（tauri.conf.json 字段 → ztron.conf.json，大部分同名）、前端（`@tauri-apps/api` import 改 `@ztron/api`，invoke/listen 签名不变）；差异注记：IPC 为 JSON（非 MessagePack，对齐 Tauri 桌面 Raw 响应语义）；`withGlobalTauri` 已支持。

- [ ] **Step 9: `docs/zh/reference/cli.md`** —— 7 命令各一节（语法/参数/示例）。命令集与事实（注意：源码 USAGE 字符串缺 codegen/signer，以 `packages/cli/src/index.ts` switch 分支为准共 7 个）：

```text
ztron init [dir]                  在 [dir] 脚手架新项目（默认当前目录）
ztron dev [--entry <file>]        构建 + 在原生 host + tjs backend 下运行
ztron build [--entry <file>]      产出独立可执行文件与 .app
ztron codegen                     扫描 defineCommand，生成 src/ztron-commands.ts 类型绑定
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                  回归运行：解析应用上报检查项，FULL_OK 且 0 FAIL 才 exit 0；
                                  --expect 逗号分隔强制要求的 tag
ztron signer <sub> [--pk-file f] [--sk-file f]
                                  minisign 兼容密钥生成/签名/验证（generate 等子命令；
                                  与 jedisct1/minisign 互验）
ztron version                     打印版本
```

每命令配一个可运行示例（init/dev/codegen/check 用 Task 3 的 hello 用法；signer 用 `ztron signer generate` 生成 minisign.pub/minisign.key）。

- [ ] **Step 10: 构建验证 + 提交**

```bash
pnpm --dir docs run build
git add docs/zh/guide docs/zh/reference
git commit -m "docs(zh): guide section (7 pages) + CLI reference"
```

预期：build exit 0。

---

