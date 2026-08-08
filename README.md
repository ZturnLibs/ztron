# Ztron

A Tauri-style cross-platform desktop framework **rewritten in TypeScript** on top of
[txiki.js](https://txikijs.org) (tiny JS runtime, ~2MB) + system WebView
([webview/webview](https://github.com/webview/webview) via `tjs:ffi`).

See [DESIGN.md](./DESIGN.md) for the full architecture, milestones, findings and risks;
[ROADMAP.md](./ROADMAP.md) for the capability gap vs Tauri and the phased plan.

## Architecture

```
┌────────────────────────┐  TCP/JSON   ┌──────────────────────────────────┐
│ ztron-host (native C)   │◄───────────►│ tjs backend (txiki.js, async)    │
│ system WebView + GUI    │             │ @ztron/core: IPC/events/commands │
│ window/tray/menu/dialog │             │  ACL + plugins + updater         │
└────────────────────────┘             └──────────────────────────────────┘
        frontend: Vite page → @ztron/api → invoke/listen/Channel/fs/http/os/store/log/shell
        packaging: tjs compile backend → ztron build → macOS .app (signed)
```

## Packages

| Package              | Role                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `@ztron/api`         | Frontend API (translated from `@tauri-apps/api`) + fs/path/http/os/store/log/shell/updater/window/tray/menu/dialog wrappers    |
| `@ztron/core`        | Main-process core: IPC, events, Channel, commands, plugins, ACL capability layer, PathScope, 8 plugins, MockRuntime test infra |
| `@ztron/runtime-ffi` | `HostRuntime` socket adapter (Plan A) + FFI reference bindings                                                                 |
| `@ztron/inject`      | `window.__TAURI_INTERNALS__` bootstrap (embedded into page HTML)                                                               |
| `@ztron/cli`         | `dev`/`build`/`codegen`/`init`; vite build + `ztron-host` + tjs backend                                                        |

## Status (M0–P5 complete)

| Phase | Delivered                                                                                                                         | Verified                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0    | FFI + Plan A two-process host (async unlocked)                                                                                    | sync + async round trip                                                                                                                                                     |
| M1    | events + Channel streaming + window commands                                                                                      | `M1_EVENTS_CHANNEL_WINDOW_OK`                                                                                                                                               |
| M2    | plugin base + `PathScope` + `ztron init`                                                                                          | `M2_FS_SCOPE_PATH_OK`                                                                                                                                                       |
| M3    | `@ztron/api` in a real Vite frontend                                                                                              | `M3_API_FRONTEND_OK`                                                                                                                                                        |
| M4    | `tjs compile` packaging + macOS `.app`                                                                                            | packaged app passes                                                                                                                                                         |
| P0    | window states/events/opacity/transparent/decorations, tray, menu, dialogs                                                         | `WIN_STATE_OK` `WIN_EVENT_OK` `OPACITY_OK` `TRANSPARENT_OK` `DECORATIONS_OK` `TRAY_OK` `MENU_OK` `DIALOG_REG_OK`                                                            |
| P1    | ACL permissions, capabilities auto-load, scoped http, CSP                                                                         | `ACL_DENY_OK` `HTTP_SCOPE_DENY_OK`                                                                                                                                          |
| P2    | near-HMR (auto-reload watcher)                                                                                                    | `page reloaded`                                                                                                                                                             |
| P3    | plugin ecosystem: os/store/log/shell/sql/autostart/clipboard/positioner/window-state/notification/global-shortcut/single-instance | `OS_OK` `STORE_OK` `LOG_OK` `SHELL_OK` `SQL_OK` `AUTOSTART_OK` `CLIPBOARD_OK` `POSITIONER_OK` `WINDOW_STATE_PLUGIN_OK` `NOTIFICATION_OK` `SHORTCUT_OK` `SINGLE_INSTANCE_OK` |
| P4    | `ztron codegen` typed commands + MockRuntime tests                                                                                | `CODEGEN_OK` + 6/6 unit tests                                                                                                                                               |
| P5    | updater + macOS signing + Win/Linux host skeletons                                                                                | `UPDATER_OK`                                                                                                                                                                |

Final spike: **36 checks, all pass** (`FULL_OK`).

## Quick start

```bash
pnpm install
scripts/build-native.sh                 # builds tjs + ztron-host + webview lib (macOS)
pnpm --filter @ztron/example-hello dev  # dev: vite build + host + backend
pnpm --filter @ztron/example-hello build  # package + ad-hoc sign ZtronApp.app
node --experimental-strip-types --test tests/core.test.ts  # unit tests
```

New project (inside the monorepo so `@ztron/*` resolves):

```bash
node packages/cli/dist/index.js init my-app   # scaffolds src/main.ts + frontend/
cd my-app
node ../packages/cli/dist/index.js dev --entry src/main.ts
node ../packages/cli/dist/index.js codegen    # typed invoke bindings for your commands
```

## Remaining (needs target platforms)

- Windows (WebView2) / Linux (WebKitGTK) host compile + NSIS/AppImage packaging
- Developer ID signing / notarization; mobile (Android/iOS)
- Full Vite HMR (custom `ztron://` scheme host); multi-window; deep-link (bundle Info.plist)
