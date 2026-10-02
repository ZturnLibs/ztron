# Task 7 Report: demos/net.ts（3 卡：fetch / fetchStream / websocket）

**Status: DONE**
**Commit: `4cac925` — `feat(examples): showcase net demos - fetch/stream/websocket`（branch `feat/showcase`）**

(Replaces the stale onboarding-journey Task 7 report — that project was merged
via PR #8; this file now tracks the showcase Task 7.)

## What was done

1. **Step 1 — Created `examples/showcase/frontend/src/demos/net.ts`**
   - Written verbatim from the brief (verified via `diff` against the brief's code block: exact match).
   - Exports `netDemos: Demo[]` with 3 demos:
     - `net.fetch` — HTTP 请求 fetch（`http.fetch("https://api.github.com/zen")` + 越界域名 scope 拒绝演示，用 `extractError`）。
     - `net.stream` — 流式下载 fetchStream（`invoke<number>("showcase:echo-port")` → `fetchStream("http://localhost:{port}/stream")` → reader 循环统计 chunk 段数与头部/总耗时）。
     - `net.websocket` — WebSocket（`wss://ws.postman-echo.com/raw` 回声往返，8 秒超时竞速，`out.fail` 兜底离线场景）。
   - Pre-verified the API surface in `packages/api/src` before writing: `http`/`fetchStream` (`http.ts`), `websocket.connect/onMessage/sendMessage/disconnect` with `{ id, message }` event shape (`websocket.ts`), all exported from `@zturnlibs/ztron-api`. Matches the brief's imports.

2. **Step 2 — Registered in `examples/showcase/frontend/src/main.ts` CATALOG**
   - Added `import { netDemos } from "./demos/net";` next to the existing demo imports.
   - Appended `{ category: "网络", demos: netDemos },` after the 对话框与通知 entry (last position).

3. **Step 3 — typecheck: PASS**
   - `pnpm --filter @zturnlibs/ztron-example-showcase typecheck` → exit 0.

4. **Step 4 — dev 冒烟: PASS**
   - `cd examples/showcase && ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs timeout 90 pnpm dev` booted the full native chain (vite @ 127.0.0.1:5173, ztron-host, tjs backend on port 50603) and reported:
     - `[showcase] frontend reported: "SHOWCASE_OK:17"` — 14 prior cards + 3 net cards.
   - The trailing `ELIFECYCLE Command failed` is only the bounded `timeout 90` killing the app after the smoke signal; not a real failure.

5. **Step 5 — Commit**
   - `git add examples/showcase/frontend` only (no unrelated working-tree changes included); committed on `feat/showcase` as `4cac925` with the brief's exact message.

## Deferred to interactive pass

Per-card click verification needs a human at the native GUI and was not automatable here:
- `net.fetch`「GET api.github.com/zen」→ expect GitHub zen 格言（离线时红色报错属网络问题）。
- `net.fetch`「越界域名」→ expect 绿色「符合预期被拒绝」。
- `net.stream`「流式读取本地 /stream」→ expect 8 段 chunk、头部耗时明显小于总耗时。
- `net.websocket`「连接回声服务器并收发」→ expect「往返成功：hello ztron」（离线红色属预期）。

## Constraints honored

- `/Users/zyj/Zturn/tauri` untouched (read-only reference; no operations performed there).
- No new unit tests (per task constraints); TDD n/a.
