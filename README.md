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

| Package              | Role                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@ztron/api`         | Frontend API (translated from `@tauri-apps/api`) + fs/path/http/os/store/log/shell/updater/window/tray/menu/dialog wrappers     |
| `@ztron/core`        | Main-process core: IPC, events, Channel, commands, plugins, ACL capability layer, PathScope, 25 plugins, MockRuntime test infra |
| `@ztron/runtime-ffi` | `HostRuntime` socket adapter (Plan A) + FFI reference bindings                                                                  |
| `@ztron/inject`      | `window.__TAURI_INTERNALS__` bootstrap (embedded into page HTML)                                                                |
| `@ztron/cli`         | `dev`/`build`/`codegen`/`init`; vite build + `ztron-host` + tjs backend                                                         |

## Status (M0–P5 complete)

| Phase | Delivered                                                                                                                                                                                                                  | Verified                                                                                                                                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0    | FFI + Plan A two-process host (async unlocked)                                                                                                                                                                             | sync + async round trip                                                                                                                                                                                                                                                                                         |
| M1    | events + Channel streaming + window commands                                                                                                                                                                               | `M1_EVENTS_CHANNEL_WINDOW_OK`                                                                                                                                                                                                                                                                                   |
| M2    | plugin base + `PathScope` + `ztron init`                                                                                                                                                                                   | `M2_FS_SCOPE_PATH_OK`                                                                                                                                                                                                                                                                                           |
| M3    | `@ztron/api` in a real Vite frontend                                                                                                                                                                                       | `M3_API_FRONTEND_OK`                                                                                                                                                                                                                                                                                            |
| M4    | `tjs compile` packaging + macOS `.app`                                                                                                                                                                                     | packaged app passes                                                                                                                                                                                                                                                                                             |
| P0    | window states/events/opacity/transparent/decorations, tray, menu, dialogs                                                                                                                                                  | `WIN_STATE_OK` `WIN_EVENT_OK` `OPACITY_OK` `TRANSPARENT_OK` `DECORATIONS_OK` `TRAY_OK` `MENU_OK` `DIALOG_REG_OK`                                                                                                                                                                                                |
| P1    | ACL permissions, capabilities auto-load, scoped http, CSP                                                                                                                                                                  | `ACL_DENY_OK` `HTTP_SCOPE_DENY_OK`                                                                                                                                                                                                                                                                              |
| P2    | `ztron://` custom scheme (WKURLSchemeHandler) + Vite dev server full module-level HMR + convertFileSrc                                                                                                                     | `CONVERT_FILE_SRC_OK`, `[vite] page reload` (hot-accept modules update in place)                                                                                                                                                                                                                                |
| P3    | plugin ecosystem: os/store/log/shell/sql/autostart/clipboard/positioner/window-state/notification/global-shortcut/single-instance/deep-link/websocket/local-ip/network/upload/persisted-scope/menu/tray/dialog/updater/app | `OS_OK` `STORE_OK` `LOG_OK` `SHELL_OK` `SQL_OK` `AUTOSTART_OK` `CLIPBOARD_OK` `POSITIONER_OK` `WINDOW_STATE_PLUGIN_OK` `NOTIFICATION_OK` `SHORTCUT_OK` `SINGLE_INSTANCE_OK` `DEEP_LINK_OK` `WS_OK` `LOCAL_IP_OK` `NETWORK_OK` `UPLOAD_OK` `PERSISTED_SCOPE_OK` `MENU_OK` `TRAY_OK` `DIALOG_REG_OK` `UPDATER_OK` |
| P4    | `ztron codegen` typed commands + MockRuntime tests + three-layer 100% coverage                                                                                                                                             | `CODEGEN_OK` + 50/51 unit tests                                                                                                                                                                                                                                                                                 |
| P5    | updater + macOS signing + versioned-dylib packaging + Win/Linux host skeletons                                                                                                                                             | `UPDATER_OK`, packaged app passes                                                                                                                                                                                                                                                                               |
| P6    | multi-window architecture: host webview registry + label routing + `WebviewWindow`                                                                                                                                         | `MULTI_WINDOW_OK` (runtime creation of a 2nd webview blocked by the webview lib during run loop — see DESIGN.md)                                                                                                                                                                                                |
| P7    | window v2 batch 2 (Tauri-aligned): size constraints, minimizable/maximizable/closable + is*, isDecorated/isFocused, skipTaskbar, alwaysOnBottom, contentProtected, requestUserAttention, dock progress/badge, backgroundColor, titleBarStyle | `WIN_BUTTONS_OK` `WIN_V2_EXTRAS_OK` `DOCK_V2_OK`                                                                                                                                                                                                                                                              |
| P8    | spike ledger repair (httpPlugin registration, persisted-scope seed race, fs.makeDir recursive, HttpScope root-path glob) + `transformImage`/`ImageLike` + tray icon-by-rid fix | `HTTP_OK` `HTTP_SCOPE_DENY_OK` `PERSISTED_SCOPE_OK` `TRANSFORM_IMAGE_OK` — 62/62 deterministic                                                                                                                                                |
| P9    | multi-window runtime unlock (P6.3): GUI-thread label re-resolution, per-window events/preventClose, registry cleanup on close, per-handle query routing; `examples/multiwin` e2e | `SECOND_WINDOW_OK label=second` `SECOND_OPS_OK` `MULTI_WINDOW_RUNTIME_OK` — hello spike 62/62 no regression                                                                                                                                  |

Final spike: **62 deterministic checks, all pass** (`FULL_OK`; `WIN_EVENT_OK`/`WIN_QUERY2_OK` are key-window bonuses on top).

## Tests

```
pnpm test       # 55 tests: 54 pass / 1 skip (surface + unit + core)
pnpm test:unit  # unit suite only
```

Three layers target 100% coverage of features + API:

- **surface** — the framework registers exactly the manifest commands and
  `@ztron/api` exports exactly the manifest values (no missing, no extra)
- **unit** — every command routed through `MockRuntime` + an in-memory `tjs`
  stub; PathScope/HttpScope and the ACL are exhaustively tested; a coverage
  ledger asserts every command is unit- or spike-covered
- **integration** — the 58-check spike drives the real host + webview

See `tests/README.md` for the design.

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

## Remaining (needs target platforms / deep water)

- Windows (WebView2) / Linux (WebKitGTK) host compile + NSIS/AppImage packaging
- Developer ID signing / notarization; mobile (Android/iOS)
- Multi-window runtime: second window creation works end-to-end
  (`examples/multiwin`); per-window events + preventClose + registry cleanup
  ship (see DESIGN.md §75)
- IPC MessagePack (JSON current)
