# Ztron

A Tauri-style cross-platform desktop framework **rewritten in TypeScript** on top of
[txiki.js](https://txikijs.org) (tiny JS runtime, ~2MB) + system WebView
([webview/webview](https://github.com/webview/webview) via `tjs:ffi`).

See [DESIGN.md](./DESIGN.md) for the full architecture, milestones and risks.

## Packages

| Package              | Role                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `@ztron/api`         | Frontend transport layer (translated from `@tauri-apps/api/core`) |
| `@ztron/core`        | Main-process core: IPC, commands, events, state, plugins          |
| `@ztron/runtime-ffi` | WebView runtime backend (`tjs:ffi` → webview C API)               |
| `@ztron/inject`      | WebView init script (`window.__TAURI_INTERNALS__`)                |
| `@ztron/cli`         | `dev` / `build` orchestration                                     |

## Status

- [x] Monorepo skeleton + design doc
- [x] **M0** — spike complete: FFI → webview C API works, window opens, sync IPC round trip works (`SPIKE_RESULT: SYNC_ROUNDTRIP_OK`)
- [ ] M1 — async command responses + `@ztron/api` binding (blocked on event-loop integration, see DESIGN.md §10)
- [ ] M2 — events + Channel streaming + window commands
- [ ] M3 — plugin base + capability layer + CLI dev
- [ ] M4 — `tjs compile` packaging + 3-platform verification

## Quick start (after M0)

```bash
pnpm install
pnpm --filter @ztron/example-hello dev
```
