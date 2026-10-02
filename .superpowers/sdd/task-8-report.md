# Task 8 Report: demos/menu-tray.ts（3 卡：应用菜单 / 托盘 / 全局快捷键）

**Status: DONE**

## What was done

1. **Step 1 — Created `examples/showcase/frontend/src/demos/menu-tray.ts`**
   - Written verbatim from the brief (verified: `diff` of the brief's code block
     against the file → identical, `VERBATIM_MATCH`).
   - Exports `menuTrayDemos: Demo[]` with 3 cards:
     - `menu.app` 应用菜单 — `setAppMenu` + `setItemAccelerator("quit", "CmdOrCtrl+Q")` + `setItemChecked("zoom", ...)` toggle.
     - `menu.tray` 系统托盘 TrayIcon — `TrayIcon.create({ title: "Z", tooltip })`, `setIconAsTemplate(true)`, 5s dwell, `destroy()`.
     - `menu.shortcut` 全局快捷键 — `registerShortcut("showcase-demo", "Cmd+Shift+J")`, `isRegistered`, `onShortcut` handler with 10s window, then `unregisterShortcut` + unlisten.
   - API imports (`setAppMenu`, `Menu`, `TrayIcon`, `registerShortcut`, `unregisterShortcut`, `isRegistered`, `onShortcut`) all confirmed present in `packages/api/src/index.ts` (lines 127–253).

2. **Step 2 — CATALOG registration in `examples/showcase/frontend/src/main.ts`**
   - Import `import { menuTrayDemos } from "./demos/menu-tray";` added next to the existing demo imports (after `netDemos`).
   - Entry `{ category: "菜单与托盘", demos: menuTrayDemos },` appended after the 网络 entry.

3. **Step 3 — Typecheck (hard gate)**
   - `pnpm --filter @zturnlibs/ztron-example-showcase typecheck` → **exit 0**.

4. **Step 4 — Bounded dev run**
   - Command: `ZTRON_TJS=.../native/txiki.js/build/tjs timeout 75 pnpm dev` in `examples/showcase`.
   - Native chain booted fully: vite dev server on 127.0.0.1:5173, backend via tjs on port 51712, host connected.
   - Success signal observed: `[showcase] frontend reported: "SHOWCASE_OK:20"` (17 existing + 3 menu-tray cards). The trailing `ELIFECYCLE ... exit code 1` is just the `timeout 75` kill — expected.

5. **Step 5 — Commit**
   - `5d308ed` — `feat(examples): showcase menu-tray demos - appmenu/tray/global-shortcut`
   - Only `examples/showcase/frontend` staged (2 files changed, 130 insertions). Branch: `feat/showcase`.

## Deferred to interactive pass (GUI needs a human)

Per-card native interaction checks could not be automated in the bounded run:

- 应用菜单：菜单栏出现 New Window / View（含 Zoom 勾选、Small/Large 单选、分隔线）/ Quit；Cmd+Shift+Q 加速键生效（按下会退出应用，属预期，重跑 dev 即可）；Zoom 勾选切换后打开 View 菜单核对。
- 托盘：菜单栏右上角 Z 图标出现，5 秒后消失。
- 全局快捷键：切到其他应用按 Cmd+Shift+J，10 秒窗口内出现 `触发：showcase-demo` info 行。

## Concerns

- None blocking. Note: the verbatim brief imports `Menu` in `menu-tray.ts` without using it; typecheck passes (no `noUnusedLocals` enforcement in the frontend tsconfig), and the brief mandated verbatim contents, so it was kept as-is.
- Housekeeping note: `task-8-report.md` previously held stale content from an unrelated earlier run ("CI docs job" on feat/docs); it was overwritten with this report per task instructions.
- Constraint honored: `/Users/zyj/Zturn/tauri` untouched (read-only reference). No app-menu quit interaction performed during the dev run.
