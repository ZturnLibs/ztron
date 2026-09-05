# Ztron Showcase —— 新手功能演示应用设计

- 日期：2026-09-05
- 状态：设计稿（待用户审阅）
- 定位：`examples/` 下第五个可运行示例，面向**新手应用开发者**的交互式
  kitchen-sink（对标 Electron API Demos / Tauri 官方示例集）
- 关联：`2026-09-03-onboarding-journey-design.md`（互补——该设计做发布/CLI/
  文档旅程，本设计交付「玩中学」的 API 演示载体，可挂入其 W3 文档旅程）

## 1. 目标与非目标

### 目标

给「刚用 Ztron 写自己第一个应用的开发者」一个可运行的桌面应用，做到三件事：

1. **玩**：每个功能一张交互卡片，点按钮真跑（真开对话框、真读剪贴板、
   真发 HTTP、真创建第二个窗口），结果就地显示；
2. **看代码**：每张卡片内嵌该功能的最小 API 用法片段（与实现同文件，天然
   不漂移），新手复制即可用；
3. **查文档**：每张卡片一个「📖 文档」按钮，经 `opener.openUrl` 跳转到
   线上文档站对应页面（zh 默认）。

同时把 demo 应用自身当作教学样本：`ztron.conf.json`、`capabilities/` ACL、
`defineCommand` typed command、插件注册——新手看完源码就知道自己项目该长什么样。

### 非目标（YAGNI）

- **不做自动化回归**：hello 已是 85-check 回归基线，showcase 不进
  `ztron check` 主链，仅留一条轻量 smoke tag（`SHOWCASE_OK`）防止 dev 链路烂掉；
- **不做语法高亮库**：代码片段用 `<pre><code>` + 等宽字体单色即可，不引入
  highlight.js/shiki（后续演进）；
- **不做前端框架**：与 hello 一致用原生 DOM + 一个极小 helper，不引入
  React/Svelte，降低「demo 本身」的理解成本；
- **不做文档内容内嵌/搜索/en 切换**：只做「跳转到 zh 文档页」一个动作；
- **不覆盖移动端插件**（barcode-scanner/biometric/geolocation/haptics/nfc
  仅在 api 包有 stub，无桌面实现，不演示）。

## 2. 现状事实（设计依据）

- 现有 4 个 examples 全是**贡献者视角的自动化演练**：hello（85 检查回归）、
  multiwin、menuprobe、bench——没有面向新手的「人工交互式」演示；
- 文档站 Rspress：zh 默认无前缀、en 挂 `/en/`，base `/ztron/docs/`，
  发布于 `https://zturnlibs.github.io/ztron/docs/`；`docs/zh/plugins/_meta.json`
  有完整插件目录（fs/http/dialog/tray/menu/… 共 38 页），每个 demo 都能找到
  对应文档页；
- `@zturnlibs/ztron-api` 导出表面已确认（`packages/api/src/index.ts`）：
  invoke/listen/emit/Channel、Window/WebviewWindow、fs/path、http(fetch/
  fetchStream)、shell(Command)、store/sql/log、clipboard、dialog(open/save/
  message/ask/confirm)、notification、TrayIcon/Menu、global-shortcut、
  websocket、network/local-ip、opener、autostart、single-instance、deep-link、
  window-state、positioner、updater、os/app/process 等；
- ACL 形态：`capabilities/*.json` + `loadCapabilities()`（见 hello
  `capabilities/main.json` 的权限清单写法）；
- 应用骨架形态：`ztron.conf.json`（windows[] 声明）+ `src/main.ts`（
  AppBuilder + 插件注册）+ `frontend/`（Vite 页面 + `@zturnlibs/ztron-api`）。

## 3. 方案对比

| 方案 | 内容 | 取舍 |
| --- | --- | --- |
| **A. `examples/showcase` 独立 kitchen-sink 应用（推荐）** | 新增第五个 example，单窗口侧边栏导航 + 分类 demo 卡片 | 与现有 examples 形态一致；hello 回归基线零风险；demo 与源码同库同版本 |
| B. 改造 hello 为交互式 | 把 hello 的 85 项检查改成可点界面 | ❌ 破坏回归基线语义：`ztron check` 依赖 hello 的确定性输出；自动化检查与人工演示是两种形态，揉在一起两头不讨好 |
| C. 文档站内嵌在线 demo | Rspress 页面里嵌 iframe 演示 | ❌ 文档站是纯静态，起不了原生窗口/托盘/对话框，只能演前端部分；文档构建链也复杂化 |

**推荐 A**。

## 4. 架构

### 4.1 文件布局

```
examples/showcase/
├── ztron.conf.json          # 单主窗口（label "main"，1000x680，侧边栏布局），url: "frontend"
├── capabilities/
│   └── default.json         # 全量 ACL（本身就是教学样本，逐权限注释用途），windows: ["main"]
├── package.json             # @zturnlibs/ztron-example-showcase，dev 脚本同 hello
├── tsconfig.json
├── src/                     # ---- tjs 后端 ----
│   ├── main.ts              # AppBuilder + 全插件注册 + loadCapabilities
│   ├── commands.ts          # defineCommand 示例（greet/add/echo，codegen 教学）
│   └── tjs-extra.d.ts
└── frontend/                # ---- Vite 前端 ----
    ├── index.html           # 骨架：侧边栏 + 内容区 + 卡片容器
    └── src/
        ├── main.ts          # demo 注册表装载 + 路由（分类→卡片切换）
        ├── demo-ui.ts       # 极小 helper：button/field/output/card 布局
        ├── doc-links.ts     # docUrl(path) → 线上文档站 URL 常量与拼接
        └── demos/
            ├── core.ts      # invoke / events / channel
            ├── window.ts    # Window 控制 / 多窗口 / 窗口事件 / 显示器
            ├── fs.ts        # fs 读写 / 目录 / watch / path / convertFileSrc
            ├── net.ts       # http fetch / fetchStream / websocket
            ├── dialogs.ts   # dialog 五件套 / notification / clipboard
            ├── menu-tray.ts # menu / TrayIcon / global-shortcut
            ├── data.ts      # store / sql / log
            └── system.ts    # os/app/process / shell / opener / 单实例 /
                              # deep-link / autostart / window-state /
                              # positioner / network / updater(check)
```

### 4.2 Demo 注册机制（核心抽象）

每个 demo 是一个纯数据 + 挂载函数的注册项，一个 demo 一个对象：

```ts
// frontend/src/demo-ui.ts 导出的 Demo 接口
export interface Demo {
  id: string;            // 如 "dialog.open"
  title: string;         // 卡片标题，如 "文件对话框 open/save"
  description: string;   // 一句话说明这个演示做什么
  code: string;          // 最小 API 用法片段（展示在卡片下方 <pre><code>）
  docPath: string;       // 文档站相对路径，如 "/plugins/dialog.html"
  mount(root: HTMLElement): void; // 挂载交互控件，demo 逻辑在此
}
```

- `main.ts` 里按分类聚合：`const CATALOG: { category: string; demos: Demo[] }[]`，
  渲染侧边栏分类 + 卡片；点击分类切换，单窗口内路由，无 hash 路由库；
- **代码不漂移**：`code` 字段与 `mount` 里的真实调用写在同一个 demo 模块内，
  审查时肉眼可对照；不搞「从源码抽片段」的构建魔法（YAGNI）；
- `demo-ui.ts` 只提供 4-5 个函数（`el()` 元素工厂、`button(label, fn)`、
  `textOutput()` 结果区、`kv()` 键值展示），每个 demo 的 `mount` 控制在
  20-40 行，新手读一个文件就懂一个功能。

### 4.3 文档链接

```ts
// frontend/src/doc-links.ts
const DOCS_BASE = "https://zturnlibs.github.io/ztron/docs";
export const docUrl = (docPath: string) => `${DOCS_BASE}${docPath}`;
```

- 卡片头部「📖 文档」按钮：`openUrl(docUrl(demo.docPath))`（opener 插件）在
  系统默认浏览器打开 zh 文档页；opener 失败时降级 `window.open`；
- `docPath` 与 `docs/zh/plugins/_meta.json` 一一对应，实现计划中附对照表。

### 4.4 错误处理（本身是教学点）

- 每张卡片固定有「结果输出区」；`mount` 内所有按钮 handler 统一
  try/catch，错误以红色文本 + 完整 message 显示在输出区；
- ACL 拒绝、scope 越界等错误原样展示——新手第一次遇到「permission denied」
  就地看到具体原因，比文档更有体感。

### 4.5 后端

- `src/main.ts`：注册 demo 涉及的全部插件（与 hello 同模式：fsPlugin/
  httpPlugin/… + `loadCapabilities`）；
- `src/commands.ts`：3 个 `defineCommand`（greet/add/echo），同时演示
  `ztron codegen` 产物（`ztron-commands.ts`）在前端的调用——invoke 卡片
  直接引用生成绑定；
- `capabilities/default.json` 权限清单 = demo 全集所需，文件内注释逐项
  说明（ACL 教学样本）。

## 5. Demo 清单（分类 × 文档页对照）

> 实现按批次交付：批次 1（core/window/fs/dialogs）先行，批次 2
> （net/data/menu-tray/system）跟进。每条都保证有对应文档页。

| 分类 | Demo（卡片） | 关键 API | docPath |
| --- | --- | --- | --- |
| 核心 | 调用后端命令 | `invoke` + codegen 绑定 | `/guide/ipc.html` |
| 核心 | 事件收发 | `listen` / `emit` / `emitTo` | `/plugins/event.html` |
| 核心 | Channel 流式 | `Channel`（后端进度推送） | `/guide/ipc.html` |
| 窗口 | 窗口控制 | `Window`：setTitle/setSize/fullscreen/center… | `/plugins/window.html` |
| 窗口 | 多窗口 | `WebviewWindow` 创建/销毁第二窗口 | `/plugins/webview-window.html` |
| 窗口 | 窗口事件与显示器 | `onMoved/onResized`、`availableMonitors` | `/plugins/dpi.html` |
| 文件 | 读写文本/二进制 | `fs.readTextFile/writeFile/readFile` | `/plugins/fs.html` |
| 文件 | 目录浏览与路径 | `fs.readDir`、`path.appDataDir()`、`BaseDirectory` | `/plugins/path.html` |
| 文件 | 文件监听 | `fs.watch` → WatchEvent | `/plugins/fs.html` |
| 网络 | HTTP 请求 | `http.fetch` | `/plugins/http.html` |
| 网络 | 流式下载 | `fetchStream` → ReadableStream 进度 | `/plugins/http.html` |
| 网络 | WebSocket | `connect/sendMessage` 回环演示 | `/plugins/websocket.html` |
| 对话框 | 文件对话框 | `open` / `save` | `/plugins/dialog.html` |
| 对话框 | 消息对话框 | `message` / `ask` / `confirm` | `/plugins/dialog.html` |
| 对话框 | 系统通知 | `sendNotification` + 权限查询 | `/plugins/notification.html` |
| 对话框 | 剪贴板 | 读写文本/图片/HTML | `/plugins/clipboard.html` |
| 菜单 | 应用菜单 | `Menu` 构建/勾选/加速键 | `/plugins/menu.html` |
| 菜单 | 托盘 | `TrayIcon`：图标/气泡/菜单/模板图标 | `/plugins/tray.html` |
| 菜单 | 全局快捷键 | `registerShortcut` 捕获全局按键 | `/plugins/global-shortcut.html` |
| 数据 | 键值存储 | `Store` set/get/onChanged + 持久化 | `/plugins/store.html` |
| 数据 | SQLite | `Database` 建表/插入/查询 | `/plugins/sql.html` |
| 数据 | 日志 | `logger` 多 target + `attachLogger` | `/plugins/log.html` |
| 系统 | 应用信息 | `os`/`app`/`process`：版本/平台/内存 | `/plugins/os.html` |
| 系统 | 执行命令 | `Command` 输出捕获 + 交互式 stdin | `/plugins/shell.html` |
| 系统 | 打开 URL/文件 | `openUrl`/`openPath`/`revealItemInDir` | `/plugins/opener.html` |
| 系统 | 单实例 | `isPrimaryInstance` + 二实例回调 | `/plugins/single-instance.html` |
| 系统 | 深层链接 | `onDeepLink`（说明注册前提） | `/plugins/deep-link.html` |
| 系统 | 开机自启 | `enableAutostart` 开关 | `/plugins/autostart.html` |
| 系统 | 窗口状态记忆 | `saveWindowState/restoreWindowState` | `/plugins/window-state.html` |
| 系统 | 网络信息 | `network` + `getLocalIpv4` | `/plugins/network.html` |
| 系统 | 更新器 | `updater.check()`（无签名环境如实报错） | `/plugins/updater.html` |

说明：updater 卡片刻意保留——真实 check 在无签名环境会失败，卡片如实展示
该错误本身就是「更新器依赖签名/endpoint」的活文档；卡片描述里写明前提。

## 6. 验证与测试

- **跑通**：`pnpm --filter @ztronlibs/ztron-example-showcase dev` 出窗口，
  每张卡片人工点验（人工演示型应用的本命验证）；
- **smoke tag**：前端 mount 完成、目录渲染出全部分类后报
  `SHOWCASE_OK:<n-demos>`，可用 `ztron check --expect SHOWCASE_OK` 做最低
  限度回归（不进 hello 的 FULL_OK 主链）；
- **静态检查**：`pnpm typecheck`（workspace 脚本）通过；不新增单测
  （demo 无可断言的业务逻辑，交互验证靠人工 + smoke）；
- **文档**：`docs/zh/start/examples.md` 与 en 镜像各加 showcase 条目；
  `README.md` Examples 小节提一行。

## 7. 后续演进（非本期）

- 代码片段语法高亮（highlight.js 或极简 tokenizer）；
- en 文档切换按钮（读文档站 /en/ 镜像）；
- 「复制代码」按钮 + 剪贴板 API 自举（用 Ztron 复制 Ztron 的示例代码）；
- 按 onboarding 设计的 `ztron init` 模板化：`ztron init --template showcase`。
