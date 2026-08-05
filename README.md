# Ztron

A Tauri-style cross-platform desktop framework **rewritten in TypeScript** on top of
[txiki.js](https://txikijs.org) (tiny JS runtime, ~2MB) + system WebView
([webview/webview](https://github.com/webview/webview) via `tjs:ffi`).

See [DESIGN.md](./DESIGN.md) for the full architecture, milestones and risks.

## Packages

| Package              | Role                                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `@ztron/api`         | Frontend transport layer (translated from `@tauri-apps/api/core`) + event/window/fs/path wrappers     |
| `@ztron/core`        | Main-process core: IPC, commands, events, state, plugins, PathScope capability layer, fs/path plugins |
| `@ztron/runtime-ffi` | Runtime backend: FFI bindings (reference) + `HostRuntime` socket adapter (Plan A, production path)    |
| `@ztron/inject`      | WebView bootstrap (`window.__TAURI_INTERNALS__`, embedded into page HTML)                             |
| `@ztron/cli`         | Two-process orchestration: spawn `ztron-host` + tjs backend                                           |

## Status

- [x] Monorepo skeleton + design doc
- [x] **M0** — spike: FFI → webview C API works, window opens, sync IPC round trip
- [x] **Plan A** — native host shim (`ztron-host`) + tjs backend over socket; async commands work
- [x] **M1** — events + Channel streaming + window command set (`M1_EVENTS_CHANNEL_WINDOW_OK`)
- [x] **M2** — plugin base + PathScope capability layer (scoped fs + path) + `ztron init` (`M2_FS_SCOPE_PATH_OK`)
- [ ] M3 — `@ztron/api` in a real bundler frontend (Vite)
- [ ] M4 — `tjs compile` packaging + 3-platform verification

## Quick start (after M0)

```bash
pnpm install
pnpm --filter @ztron/example-hello dev
```
