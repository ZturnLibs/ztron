---
title: Architecture Overview
---

Ztron is a Tauri-style cross-platform desktop framework rewritten in TypeScript, built on
[txiki.js](https://txikijs.org) (an ~2MB embedded JS runtime) and the system
WebView (binding the C API of `webview/webview` via `tjs:ffi`).

## Two-Process Data Flow

The framework consists of two processes communicating over TCP/JSON (the Plan A
native host approach):

- **ztron-host (native C process)**: holds the system WebView and GUI
  capabilities, owning native-side resources such as windows, tray, menus, and
  dialogs.
- **tjs backend (txiki.js process)**: an async JS backend hosting
  `@zturnlibs/ztron-core`'s IPC, events, commands, ACL capability layer, plugins, and
  the updater.

The frontend is a plain Vite page that calls capabilities like
`invoke/listen/Channel/fs/http/os/store/log/shell` via `@zturnlibs/ztron-api`; at
packaging time the backend is compiled into a standalone executable with
`tjs compile`, and `ztron build` then produces a macOS `.app` (signed).

## The Five Packages

| Package | Responsibility |
| --- | --- |
| `@zturnlibs/ztron-api` | Frontend API (translated from `@tauri-apps/api`) + fs/path/http/os/store/log/shell/updater/window/tray/menu/dialog wrappers |
| `@zturnlibs/ztron-core` | Main-process core: IPC, events, Channel, commands, plugins, ACL capability layer, PathScope, 25 plugins, MockRuntime test facility |
| `@zturnlibs/ztron-runtime-ffi` | `HostRuntime` socket adapter (Plan A) + FFI reference bindings |
| `@zturnlibs/ztron-inject` | `window.__TAURI_INTERNALS__` bootstrap (embedded into page HTML) |
| `@zturnlibs/ztron-cli` | `dev`/`build`/`codegen`/`init`; vite build + `ztron-host` + tjs backend |

## How the Processes Cooperate

After startup, the backend connects to the host via the `runtime-ffi` socket;
every frontend `invoke` enters the IPC channel through the injected script
`window.__TAURI_INTERNALS__` (embedded by the `inject` package), and the
backend's command/plugin system replies following Tauri's protocol semantics.
Window creation, event broadcasting, and Channel streaming data all travel over
the same TCP/JSON path.

## Further Reading

- Architecture decisions, milestones, and risk records are in the repo root's `DESIGN.md`
- Capability gaps versus Tauri and the phased plan are in `ROADMAP.md`
- For a fast start see "Quick Start"; for command-call details see [Calling Backend Commands](/guide/ipc)

适用版本：`ztron 0.1.0`
