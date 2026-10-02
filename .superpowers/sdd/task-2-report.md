# Task 2 Report: 前端骨架 —— 品牌令牌、demo-ui、doc-links、路由与冒烟

**Status:** DONE
**Commit:** `eadb77a` on `feat/showcase` (`feat(examples): showcase frontend shell - brand tokens, demo registry router, doc/copy buttons`)

## What was implemented

All five files created verbatim from the brief (`/Users/zyj/Zturn/Ztron/.superpowers/sdd/task-2-brief.md`):

- `examples/showcase/frontend/index.html` — zh 文档结构：侧边栏（渐变字标 + 副标题 + `#nav`）与 `#content`，入口 `/src/main.ts`。
- `examples/showcase/frontend/src/style.css` — 品牌令牌（与官网 tokens 逐字一致：深色锁定、渐变、圆角 10px/8px 体系）、侧边栏、卡片、控件、`prefers-reduced-motion` 降级。
- `examples/showcase/frontend/src/demo-ui.ts` — 共享接口 `Demo`/`Output` 与原语 `extractError`/`output`/`act`/`field`/`icon`（Tabler MIT 内联 SVG 3 枚：book/copy/external）。`field()` 采用 brief 标注的最终版（无占位 `const style` 三行）。
- `examples/showcase/frontend/src/doc-links.ts` — `docUrl(docPath)`，`DOCS_BASE = "https://zturnlibs.github.io/ztron/docs"`。
- `examples/showcase/frontend/src/main.ts` — `CATALOG` 为空数组；路由：nav 渲染、首项自动激活并 `renderCard`（文档按钮 openUrl 失败回退 window.open、复制按钮 writeClipboardText）；空态文案；冒烟 `invoke("showcase:report", { received: "SHOWCASE_OK:0" })`。

## Verification

### Step 6 typecheck

```
$ pnpm --filter @zturnlibs/ztron-example-showcase typecheck
> tsc -p tsconfig.json --noEmit
EXIT=0
```

未报 `*.css` 模块错误，故未创建 `frontend/src/globals.d.ts`（brief 预授权项，无需启用）。

### Step 7 dev 冒烟

裸跑 `pnpm dev` 报 `tjs not found on PATH`。Task 1 构建的运行时位于 `/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs`，按 CLI 提示用 `ZTRON_TJS` 指向后重跑（无任何代码改动）：

```
$ cd examples/showcase && ZTRON_TJS=.../native/txiki.js/build/tjs timeout 45 pnpm dev
[ztron] vite dev server: http://127.0.0.1:5173
[ztron] bundling .../examples/showcase/src/main.ts
[ztron] starting host: .../native/libs/ztron-host
[ztron] running backend via .../native/txiki.js/build/tjs on port 64982
[showcase] backend connected, frontend http://127.0.0.1:5173
[showcase] frontend reported: "SHOWCASE_OK:0"
```

- native host 启动、backend 打印 connected 行、前端经 IPC 上报 `SHOWCASE_OK:0`（空目录 0 卡，符合预期）。无堆栈跟踪；末尾 `ELIFECYCLE` 为 timeout SIGTERM 终止，非错误。
- 补充渲染验证（`screencapture` 无屏幕录制权限，改用浏览器加载同一 Vite 页面）：DOM 快照含侧边栏字标/副标题与空态文案「demo 模块尚未登记（见 frontend/src/main.ts 的 CATALOG）」；截图确认深色主题与渐变字标。浏览器控制台仅 2 条环境性报错：favicon 404；`window.__ZTRON_IPC__ is not a function`（纯浏览器无 IPC 桥，native 窗口内上报已成功，不适用）。
- `SHOWCASE_OK:0` 的上报发生在 `renderNav()` 追加空态之后，代码层面证明渲染路径已执行。

### UI 文案规则

可见文案全部中文（品牌名 "Ztron Showcase" 为专有名词）；无 emoji、无装饰性状态圆点；「——」仅出现在 brief 逐字要求的代码注释中（style.css 头注释、demo-ui.ts 文档注释），非可见 UI。

## Deviations

1. **Step 7 需 `ZTRON_TJS` 环境变量**：`tjs` 未装上 PATH，改用 Task 1 产物路径 `ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs`。仅环境变量，无代码偏离。后续任务跑 dev 需同样设置。
2. 其余全部照 brief 逐字执行；`field()` 使用 brief 明确标注的最终版。

## Notes for later tasks

- 后续 demo 任务只需新增 `frontend/src/demos/*` 并在 `main.ts` 的 `CATALOG` 登记；共享接口从 `./demo-ui` import，文档地址用 `docUrl(docPath)`。
- 冒烟门禁期望值随卡片数变化：`SHOWCASE_OK:<卡片总数>`。
- （本文件原为旧 SDD 周期的 `ztron doctor` 报告，已被本任务报告覆盖。）

## Review fix: `field()` 返回包裹 label + `fieldValue()` 辅助

**Commit:** `cf061f8` on `feat/showcase`（`fix(examples): showcase field() returns labeled wrapper + fieldValue helper`），对应计划修订 `7729639`。

**What changed**（仅 `examples/showcase/frontend/src/demo-ui.ts`）：

- 评审发现原 `field()` 构建 `.field` label 包裹（caption span + input）后只返回游离的 `input`。demo 后续 `area.append(field(...))` 会把 input 从包裹中移走，caption 被静默丢弃，`.field span` / `.field input` 选择器永不命中。CATALOG 为空的当下不触发，但每个 demo 任务都继承该契约。
- 修复（逐字按修订后计划）：`field()` 改为返回 `HTMLLabelElement` 包裹；新增 `fieldValue(f: HTMLLabelElement): string`，经 `f.querySelector("input")` 读取当前值。返回类型与 JSDoc 同步更新。

**Verification:**

```
$ pnpm --filter @zturnlibs/ztron-example-showcase typecheck
> tsc -p tsconfig.json --noEmit
EXIT=0
```

无其他文件改动；后续 demo 任务取值一律用 `fieldValue(field(...))`。

