# Task 6 Report: demos/dialogs.ts（4 卡：文件对话框 / 消息对话框 / 通知 / 剪贴板）

**Status: DONE**

## What was done

Executed brief Steps 1-5 in order on branch `feat/showcase` (no new branches).
(This file previously held a stale report from an earlier journey iteration about
`docs/start/quick-start.md` on `feat/onboarding`; overwritten per task instructions.)

### Step 1 — Created `examples/showcase/frontend/src/demos/dialogs.ts`
- Transcribed verbatim from the brief (verified: `diff` of the brief's fenced code block
  vs the committed file → identical).
- 4 demos exported as `dialogDemos: Demo[]`:
  - `dialog.file` — 文件对话框 open / save（filters: txt/md/json；取消返回 null）
  - `dialog.message` — message / ask / confirm（ask/confirm 返回随点击变化的布尔）
  - `dialog.notification` — isPermissionGranted → requestPermission → sendNotification，
    权限被拒时按设计输出红色提示（dev 裸二进制常见）
  - `dialog.clipboard` — 文本/HTML 读写往返 + 清除；输入框取值用 `fieldValue(text)`

### Contract check（brief 注明的 field/fieldValue 修正点）
- The brief's clipboard card already used `fieldValue(text)` — correct as-is.
- Scanned the entire brief for any remaining `.value` on a `field(...)` result:
  **none found** (the other 3 cards have no `field` inputs). No corrections needed;
  file is a pure verbatim transcription.

### Step 2 — Registered in `examples/showcase/frontend/src/main.ts`
- Import added next to existing demo imports: `import { dialogDemos } from "./demos/dialogs";`
- CATALOG entry appended after the 文件 entry:
  `{ category: "对话框与通知", demos: dialogDemos },`
- Total card count now 14 (核心 4 + 窗口 3 + 文件 3 + 对话框与通知 4).

### Step 3 — Typecheck (hard gate)
```
pnpm --filter @zturnlibs/ztron-example-showcase typecheck
> tsc -p tsconfig.json --noEmit
exit 0
```

### Step 4 — Bounded dev run (real native chain)
```
cd examples/showcase && ZTRON_TJS=.../native/txiki.js/build/tjs timeout 75 pnpm dev
[ztron] vite dev server: http://127.0.0.1:5173
[ztron] starting host: .../native/libs/ztron-host
[ztron] running backend via .../tjs on port 49949
[showcase] backend connected, frontend http://127.0.0.1:5173
[showcase] frontend reported: "SHOWCASE_OK:14"
```
- Success signal present: **`SHOWCASE_OK:14`** = 10 previous + 4 new dialog cards.
- The trailing `ELIFECYCLE Command failed with exit code 1` is the expected `timeout 75`
  kill of the blocking dev process, not a boot failure — the native chain fully booted
  (vite + host + tjs backend + frontend report all seen).
- Per-card click expectations (real dialog popups, ask/confirm result varying by click,
  notification appearing in notification center — including the by-design red hint when
  permission is denied in the dev bare binary, clipboard interop with Notes/备忘录)
  **deferred to interactive pass** — they need a human at the GUI.

### Step 5 — Commit
```
55d6aa7 feat(examples): showcase dialog demos - open-save/message-ask-confirm/notification/clipboard
2 files changed, 145 insertions(+)
```
Scoped to `examples/showcase/frontend` only (per brief); unrelated dirty files in the
worktree (.superpowers/sdd/*, .playwright-mcp/) left untouched.

## Constraints honored
- `/Users/zyj/Zturn/tauri` never touched (read-only rule).
- No new unit tests (per task constraints; TDD N/A).
- API surface verified before writing: all 13 imports exist in
  `packages/api/src/index.ts` — dialog (`open/save/message/ask/confirm` from
  `src/dialog.ts`), notification trio (`src/notification.ts`), clipboard aliases
  `writeClipboardText/readClipboardText/writeClipboardHtml/readClipboardHtml/clearClipboard`
  (`src/clipboard.ts` re-exported with `*Clipboard*` names at index.ts:215-224).
  Option-object shapes (`filters: string[]`, `kind: "info"`, `{ title, body }`) match the
  API signatures.

## Verification summary
- typecheck: exit 0 (hard gate passed)
- dev run: `SHOWCASE_OK:14` reported by frontend over the real native chain
- file verbatim vs brief: diff clean

## Concerns
- None blocking. Only the expected deferral: interactive per-card GUI verification
  (dialogs actually popping, notification grant flow, clipboard interop with another app)
  awaits a human pass.
