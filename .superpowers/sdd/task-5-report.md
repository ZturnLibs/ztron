# Task 5 Report: demos/fs.ts（3 卡：读写 / 目录与路径 / watch）

**Status: DONE**

## What was done

Executed the brief (`/Users/zyj/Zturn/Ztron/.superpowers/sdd/task-5-brief.md`) Steps 1-5 in order on branch `feat/showcase`. (This file previously held an old journey's Task 5 report; overwritten per report contract.)

### Step 1: Created `examples/showcase/frontend/src/demos/fs.ts`
- Content copied **verbatim** from the brief's Step 1 code block (verified via `diff` against the extracted brief block → `VERBATIM_MATCH`).
- Exports `fsDemos: Demo[]` with 3 cards: `fs.rw`（文件读写）, `fs.path`（目录列表与路径）, `fs.watch`（文件监听 watch）.
- Pre-checked API surface against `/Users/zyj/Zturn/Ztron/packages/api/src/fs.ts` and `packages/api/src/path.ts`: `fs.writeText/readText/writeFile/readFile/readDir/watch` and `path.tempDir/homeDir/appDataDir/join` all exist; `DirEntry` = `{ name, isDirectory, isFile }`; `watch` returns `Promise<() => Promise<void>>` (unwatch); `WatchEvent` = `{ type: "modify" | "rename", path }`. All match the brief's usage.

### Step 2: CATALOG registration in `examples/showcase/frontend/src/main.ts`
- Import added next to existing demo imports: `import { fsDemos } from "./demos/fs";`
- Entry appended after the 窗口 entry: `{ category: "文件", demos: fsDemos },`

### Step 3: typecheck
- `pnpm --filter @zturnlibs/ztron-example-showcase typecheck` → `tsc -p tsconfig.json --noEmit`, **exit 0**. (Hard gate passed.)

### Step 4: dev run (bounded)
- `cd examples/showcase && ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs timeout 75 pnpm dev 2>&1 | head -50`
- Native chain booted fully: vite dev server on 127.0.0.1:5173, backend via tjs on a dynamic port, ztron-host started, `[showcase] backend connected`, and the success signal appeared:
  `[showcase] frontend reported: "SHOWCASE_OK:10"` (4 core + 3 window + 3 fs = 10 cards; confirms the new 文件 category's 3 cards are registered and included in the smoke-report count).
- Trailing `ELIFECYCLE Command failed` is expected — that is `timeout 75` killing the intentionally blocking dev process.
- Per-card click expectations (three green outputs; Chinese text round-trip without mojibake; watch card captures modify on repeated runs): **deferred to interactive pass** — needs a human at the real native window; the automated bounded run cannot click GUI buttons.

### Step 5: Commit
- `git add examples/showcase/frontend && git commit -m "feat(examples): showcase fs demos - rw/dirs/watch"`
- Commit: `5ac945e` on `feat/showcase` (2 files changed, 105 insertions; only `examples/showcase/frontend` staged — no unrelated files).

## Self-review against the brief
- fs.ts verbatim: pass (diff clean).
- CATALOG pattern matches existing entries; import placement matches the brief's Step 2 pattern: pass.
- Typecheck exit 0: pass.
- SHOWCASE_OK:10 success signal observed: pass.
- Conventional commit message exactly as specified: pass.
- No files written under `/Users/zyj/Zturn/tauri` (read-only reference respected): pass.
- No new unit tests (per task constraints): n/a.

## Concerns
- None blocking. Only open item: human interactive verification of the 3 fs cards' button clicks in the native window (deferred to interactive pass, as instructed).
