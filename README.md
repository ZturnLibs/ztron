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
| P10   | window v2 batch 3: maximize/unmaximize, innerSize, cursor position/warp/visibility, setFocusable, setTheme, setVisibleOnAllWorkspaces, setSimpleFullscreen + CLI dev-URL fix + max-size clear bug (FLT_MAX) | `WIN_V2_B3_OK:inner=800x600` — 64/64, exit 0                                                                                                                                  |
| P11   | menu v2: tray menus (NSStatusItem setMenu), context-menu popup at cursor/coords, item accelerators (CmdOrCtrl parsing), setItemChecked | `MENU_ACCEL_CHECKED_OK` `TRAY_MENU_OK` — 66/66, exit 0                                                                                                                         |
| P12   | window finishing batch: availableMonitors/currentMonitor/primaryMonitor/monitorFromPoint (real NSScreen data), getAllWindows + registry cleanup on close, setTrafficLightPosition, onScaleChanged + onThemeChanged events; shouldClose sender-signature + fwd-orig ordering fixes | `MONITORS_OK:1:Built-in Retina Display@2 workArea=3840x2312` — 67/67, exit 0                                                                       |
| P13   | menu dynamic ops (append/insert/remove/item_info) + PredefinedMenuItem (copy/cut/paste/quit/about/… via first-responder selectors + conventional key equivalents); crash-grade API traps documented (no standardItem:, no removeFromMenu:) | `MENU_DYNAMIC_OK:Second` — 68/68, exit 0                                                                        |
| P14   | declarative windows: ztron.conf.json windows[] (Tauri WindowConfig-aligned startup states), `url: "frontend"` placeholder, dual-layer schema validation (CLI fail-fast + core), AppBuilder.fromConfig, startup-state application | `CONF_WINDOW_OK:From Config` — 69/69, exit 0                                                                     |
| P15   | TrayIcon class API (Tauri-aligned): setVisible (NSStatusItem visible, reusable hide), setIconAsTemplate (adaptive dark/light rendering) + duplicate-ACL guard | `TRAY_CLASS_OK` — 70/70, exit 0                                                                        |
| P16   | fs.watch: real filesystem events end to end (tjs.watch/libuv FSEvents -> Channel stream -> api unwatch fn), scope-gated, WatchEvent aligned | `FS_WATCH_OK:modify` — 71/71, exit 0                                                                        |
| P17   | dmg packaging (hdiutil UDZO, drag-to-Applications layout) + signing-chain fix: Mach-O launcher (sh main executable was unsignable) + backend relocated to Resources (outside the main signature chain) | `.dmg` mounts clean; `codesign --verify` passes; installed app runs launcher->host->backend + exits clean   |
| P18   | shell interactive commands: Command.spawnInteractive + write (stdin) + kill + on("terminated") — cid-based process registry, listeners armed before spawn | `SHELL_INTERACTIVE_OK:echo-me-back` — 72/72, exit 0                                                                       |
| P19   | fs binary IO (readFile/writeFile, base64 wire, chunked codec) + http fetch timeoutMs (AbortSignal.timeout) | `FS_BINARY_OK:15b` — 73/73, exit 0                                                                                                                                                                                                  |                                                                                                                                                |
| P20   | Webview module (`@ztron/api/webview`: getCurrent/getAllWebviews/clearAllBrowsingData/setZoom) + hand-rolled clang Block ABI in plain C (WKWebsiteDataStore 3-arg removal) + core `window\|show`/`hide` backfill | `WEBVIEW_MODULE_OK:1` — 74/74, exit 0                                                                 |                                                                                                                                                |
| P21   | log plugin v2: stdout/stderr/file/webview targets, keepAll/keepOne rotation (maxFileSize), appLogDir file layout + `addPluginListener` (`plugin:*\|__listener` contract, Tauri-true; named events reject `\|`) + api `attachConsole` | `LOG_WEBVIEW_OK` + `LOG_ROTATE_OK:420->242` — 76/76, exit 0 (files on disk verified)                |                                                                                                                                                |
| P22   | plugin parity batch: clipboard readImage/writeImage (PNG bytes + rid re-encode, RFC4648 encoder in C) + clear, UNUserNotificationCenter rewrite (NSUserNotificationCenter was removed in macOS 11 — old sends were silent no-ops) + isPermissionGranted/requestPermission (result-carrying C blocks) + shortcut isRegistered | `CLIPBOARD_IMG_OK:70` `CLIPBOARD_CLEAR_OK` `SHORTCUT_ISREG_OK` `NOTIF_PERM_OK:false` (dev bare binary degrades; .app gets real UN) — 80/80, exit 0 |                                                                                                                                                |
| P23   | http streaming fetch: `fetchStream()` resolves with status+headers immediately, body chunks pushed over a Channel (`{b64}`/`{done}`/`{error}`) and bridged into a `ReadableStream<Uint8Array>` — no full-response buffering, scope + timeoutMs still enforced | `HTTP_STREAM_OK:6c/head1ms/total277ms` — 81/81, exit 0 (progressive delivery proven: head ≪ body tail) |                                                                                                                                                |
| P24   | Raw IPC responses (research-corrected: Tauri v2 desktop has NO MessagePack — the real target is `InvokeResponseBody::Raw`; Ztron's base64-in-JSON mirrors Tauri's own Android recommendation): any command may return `RawResponse`, the injected invoke unwraps it to `Uint8Array` — binary decoding now lives in one place; fs.readFile/clipboard.readImage simplified | existing checks re-verified on the new path: `FS_BINARY_OK:15b` + `CLIPBOARD_IMG_OK:70` — 81 checks, FULL_OK, exit 0 |                                                                                                                                                |
| P26   | File drag & drop: `tauri://drag-enter/over/drop/leave` events (paths + physical position) + `Window.onDragDropEvent` + `setFileDropEnabled`. Native: WKWebView subclass-from-birth with NSDraggingDestination IMPs (dyld-constructor registered, vendored `WKWebView_alloc` hook) — isa-swizzling after init crashes in KVO (`_os_unfair_lock_corruption_abort`) | `DRAG_DROP_ARMED` — 82/82, exit 0; real drops report `DRAG_EVENT_LIVE:<n>:<paths>` opportunistically; multiwin 10x create/destroy stress still green |                                                                                                                                                |
| P27   | dialog v2 (`ask`/`confirm` OK/Cancel alerts resolving booleans + `message` kind=info/warning/error via NSAlertStyle; Tauri-shaped signatures) + clipboard HTML flavor (public.html read + write with plain-text fallback) | `CLIPBOARD_HTML_OK:17` (real pasteboard round trip) + `DIALOG_REG_OK` extended to ask/confirm (modal APIs: registration-level, like open/save) — 84/84, exit 0 |                                                                                                                                                |
| P9    | multi-window runtime unlock (P6.3) + three-layer fix (command label routing, delegate chaining, engine dtor UAF lib patch) — real cross-window control | `SECOND_WINDOW_OK label=second` `STRESS_OK` — hello destroys a runtime window mid-run                                                                                                                                      |                                                                                                                                  |

Final spike: **84 deterministic checks, all pass** (`FULL_OK`, clean `exit 0`; `WIN_EVENT_OK`/`WIN_QUERY2_OK` are key-window bonuses on top). The second window is created + destroyed for real via `WebviewWindow` (P6.3).

## Tests

```
pnpm test       # 59 tests: 58 pass / 1 skip (surface + unit + core)
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
