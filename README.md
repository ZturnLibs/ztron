# Ztron

A Tauri-style cross-platform desktop framework **rewritten in TypeScript** on top of
[txiki.js](https://txikijs.org) (tiny JS runtime, ~2MB) + system WebView
([webview/webview](https://github.com/webview/webview) via `tjs:ffi`).

See [DESIGN.md](./DESIGN.md) for the full architecture, milestones and risks.

## Packages

| Package              | Role                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@ztron/api`         | Frontend transport layer (translated from `@tauri-apps/api/core`) + event/window/fs/path wrappers          |
| `@ztron/core`        | Main-process core: IPC, commands, events, state, plugins, PathScope capability layer, fs/path plugins      |
| `@ztron/runtime-ffi` | Runtime backend: FFI bindings (reference) + `HostRuntime` socket adapter (Plan A, production path)         |
| `@ztron/inject`      | WebView bootstrap (`window.__TAURI_INTERNALS__`, embedded into page HTML)                                  |
| `@ztron/cli`         | Two-process orchestration: `vite build` → `file://` frontend + `ztron-host` + tjs backend; `init` scaffold |

## Status

- [x] Monorepo skeleton + design doc
- [x] **M0** — spike: FFI → webview C API works, window opens, sync IPC round trip
- [x] **Plan A** — native host shim (`ztron-host`) + tjs backend over socket; async commands work
- [x] **M1** — events + Channel streaming + window command set (`M1_EVENTS_CHANNEL_WINDOW_OK`)
- [x] **M2** — plugin base + PathScope capability layer (scoped fs + path) + `ztron init` (`M2_FS_SCOPE_PATH_OK`)
- [x] **M3** — `@ztron/api` in a real Vite frontend over `file://` (`M3_API_FRONTEND_OK`)
- [x] **M4** — `tjs compile` packaging + macOS `.app` (packaged app passes `M3_API_FRONTEND_OK`)
- [ ] Windows/Linux packaging (webview backend + bundling per-platform)

## Quick start

```bash
pnpm install
pnpm --filter @ztron/example-hello dev     # dev: vite build + host + backend
pnpm --filter @ztron/example-hello build   # package ZtronApp.app (after build-native.sh)
```

## What has been proven (M0–M4)

A from-scratch TS/Web rewrite of the Tauri architecture now runs end-to-end on macOS:

1. **Runtime (Plan A)**: two-process model — a native C host (`ztron-host`) owns the
   system WebView + GUI loop; the txiki.js backend runs its own event loop over a
   socket, so **async commands / timers / IO all work**.
2. **Framework**: IPC (JSON + callback ids + native Promise semantics via
   `webview_return`), events, Channel streaming, commands, plugins, state.
3. **Capability layer**: `PathScope` gates file access (`$HOME/$TMP/$CWD` expansion,
   symlink-safe canonicalization, allow/deny).
4. **Frontend**: `@ztron/api` is a faithful port of the `@tauri-apps/api` surface
   (invoke / listen / Channel / window / fs / path) and runs in a real Vite page.
5. **Packaging**: `tjs compile` produces a standalone backend binary; `ztron build`
   assembles a macOS `.app`.

Verified outputs: `M1_EVENTS_CHANNEL_WINDOW_OK`, `M2_FS_SCOPE_PATH_OK`,
`M3_API_FRONTEND_OK` (dev and packaged).

**Open items**: Windows/Linux backends + bundlers; dev HMR (custom scheme host
instead of `vite build` + `file://`).
