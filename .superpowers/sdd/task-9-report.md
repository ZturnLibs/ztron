# Task 9 Report: demos/data.ts（3 卡：Store / SQL / 日志）

**Status: DONE**

**Commit:** `144d030` — `feat(examples): showcase data demos - store/sql/log`（分支 `feat/showcase`，2 files changed：新建 `data.ts` + 修改 `main.ts`）

## Steps executed

### Step 1: 写 demos/data.ts ✅
- 新建 `/Users/zyj/Zturn/Ztron/examples/showcase/frontend/src/demos/data.ts`。
- 内容与 brief 代码块**逐字节一致**（用 `diff` 对 brief 14-124 行代码块校验，`VERBATIM_MATCH`）。
- 3 个 demo：`data.store`（键值存储 Store）、`data.sql`（SQLite 数据库）、`data.log`（结构化日志）。
- 前置核实：`@zturnlibs/ztron-api` 确实导出 `store`、`Database`、`logger`、`attachConsole`、`path`（`packages/api/src/index.ts` 72/75/85/175/177/179/208 行）。

### Step 2: CATALOG 登记 ✅
- `/Users/zyj/Zturn/Ztron/examples/showcase/frontend/src/main.ts`：
  - import 加在 `menu-tray` 之后：`import { dataDemos } from "./demos/data";`
  - CATALOG 末尾（菜单与托盘之后）追加 `{ category: "数据", demos: dataDemos },`

### Step 3: typecheck ✅
- `pnpm --filter @zturnlibs/ztron-example-showcase typecheck` → **exit 0**。

### Step 4: dev 运行（真机原生窗口）✅
- 命令：`cd examples/showcase && ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs timeout 75 pnpm dev 2>&1 | head -50`
- 原生链路完整启动：vite 5173 → `ztron-host` → tjs backend (port 52678) → `backend connected`。
- 关键信号：**`[showcase] frontend reported: "SHOWCASE_OK:23"`**（原 20 卡 + 新 3 数据卡 = 23）。
- 末尾 `ELIFECYCLE Command failed` 是 timeout 75s 杀掉阻塞型 dev 进程的预期表现，非故障。

### Step 5: Commit ✅
- 仅 `git add examples/showcase/frontend`，按 brief 原文提交；未夹带 `.superpowers/` 等无关改动。

## Deferred to interactive pass（需人工在 GUI 点验）

以下逐卡点击验证无法由无头流程完成，留待人工交互：
- **store**：set 后 get 读回同值；clear 后 get 为空。
- **sql**：插入两条后「查询全部」出两行（`1: …` / `2: …`）；空库时显示 `(空表)`。
- **log**：终端 stdout 与 `~/Library/Logs/com.ztron.showcase/` 均有记录；attachConsole 回显带 `[WARN]`（未收到时 UI 会提示「未收到回显（可再试一次）」）。

## Concerns

无。typecheck 与 SHOWCASE_OK:23 两个硬门禁均通过；只读参考目录 `/Users/zyj/Zturn/tauri` 全程未写入。

注：本文件原为另一轮 SDD（docs-deploy workflow，commit `02ea3f5`）的 Task 9 报告，按本次任务指定路径覆盖。
