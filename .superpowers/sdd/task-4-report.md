# Task 4 Report: demos/window.ts（3 卡：窗口控制 / 多窗口 / 事件与显示器）

**Status: DONE_WITH_CONCERNS**
**Commit: `1906af3` — `feat(examples): showcase window demos - control/multiwin/monitors`**
**Branch: `feat/showcase`**

## What was done

### Step 1 — `examples/showcase/frontend/src/demos/window.ts`（新建）
按 brief 逐字写入 3 张卡片，`export const windowDemos: Demo[]`：
- `window.control`（窗口控制）：改标题 / 居中 / 置顶 1.2 秒 / 全屏切换。
- `window.multi`（多窗口 WebviewWindow）：运行时创建 `showcase-second` 窗口 → 改题 → 列出 label → 2.5 秒后销毁。
- `window.monitors`（窗口事件与显示器）：onMoved 监听 8 秒计数；availableMonitors + currentMonitor 枚举（当前显示器 `>` 标记、缩放、工作区）。

**与 brief 的唯一偏差（2 处，必要）**：`win.onMoved(...)` 前加了 `await`。
原因：`Window.onMoved` 返回 `Promise<UnlistenFn>`（与真实 Tauri 一致），brief 原文
`const un = win.onMoved(...)` / `un()` 无法通过 typecheck 硬门禁
（TS2349: `Promise<UnlistenFn>` has no call signatures）。同步修正了 `mount` 内编译代码
与 `code` 文档片段（保持教学示例正确）。位置：
`examples/showcase/frontend/src/demos/window.ts:105`（code 片段）与 `:121`（mount）。

### Step 2 — `examples/showcase/frontend/src/main.ts`（登记）
- import 加在 `./demos/core` 之后：`import { windowDemos } from "./demos/window";`
- CATALOG 在「核心」条目后追加：`{ category: "窗口", demos: windowDemos },`

### Step 3 — typecheck
`pnpm --filter @zturnlibs/ztron-example-showcase typecheck` → **exit 0** ✅
（首次运行暴露上述 onMoved 的 TS2349，最小修复后通过。）

### Step 4 — dev 真机运行（timeout 60 有界）
```
[ztron] vite dev server: http://127.0.0.1:5174
[ztron] running backend via .../tjs on port 53172
[showcase] backend connected, frontend http://127.0.0.1:5174
[showcase] frontend reported: "SHOWCASE_OK:7"     ← 硬门禁信号：4 core + 3 window 卡
```
- 原生链路（vite → ztron-host → tjs 后端 → 前端上报）**成功启动**，`SHOWCASE_OK:7` 已出现。
- 逐卡点验（改标题看标题栏 / 居中 / 置顶压制 / 全屏进出 / 第二窗口出现-改题-消失 /
  拖动 info 计数 / 显示器列表对照「关于本机」）→ **deferred to interactive pass**（需真人在 GUI 操作）。

### Step 5 — Commit
仅 `git add examples/showcase/frontend`，按 brief 原文提交，产出 `1906af3`（2 files, +131）。
工作区中其他未跟踪/已修改文件（`.superpowers/sdd/*.md`、`.playwright-mcp/`）未纳入本次提交。

## 发现的 Native 宿主 Bug（非本任务范围，需另立任务修复）

有界运行中，`SHOWCASE_OK:7` 上报之后 AppKit 抛出未捕获异常并终止应用：
```
NSGenericException: NSWindowStyleMaskFullScreen set on a window outside of a full screen transition.
  ztron-host  wnd_set_style_mask  (host_macos.c:622)
  ztron-host  handle_window_op    (host_macos.c:953 set_fullscreen 分支)
```
**根因**：`/Users/zyj/Zturn/Ztron/native/host/host_macos.c:953-957` 的 `set_fullscreen`
op 直接用 `setStyleMask:` 增删 `NS_FULLSCREEN_MASK`。macOS 不允许在非全屏过渡期直接改该
mask，必然抛异常（表现为「点全屏切换 → 应用崩溃」）。触发链：demo「全屏切换」→
`win.setFullscreen(...)` → `plugin:window|set_fullscreen` → 崩溃。前端代码语义正确
（Tauri/tao 在 macOS 上走 `toggleFullScreen:`），**修复应在宿主**：改用
`toggleFullScreen:`（host_macos.c:1961 的 cmd+shift+F 快捷键已在用）或 NSWindow 全屏
过渡 API。另注：window-state 插件的启动恢复路径
（`packages/core/src/plugins/window-state.ts:151-153`）同样会踩中此 bug，修复时应一并覆盖。

## Self-review

- [x] window.ts 三卡齐全、导出 `windowDemos: Demo[]`
- [x] CATALOG 登记「窗口」分类（import 位置、条目顺序均按 brief Step 2）
- [x] typecheck exit 0（硬门禁）
- [x] SHOWCASE_OK:7（4+3 卡）
- [x] 只提交 examples/showcase/frontend；未触碰 `/Users/zyj/Zturn/tauri`（全程只读约束遵守）
- [x] 偏差仅 `await onMoved`（2 处），已在报告中说明理由
- [x] 提交信息与 brief Step 5 一致（conventional commit）
- 本报告文件覆盖了上一 SDD 轮次的旧报告（publish workflow，commit `a8cbf3c`），符合报告契约；旧内容在 git 历史中。
