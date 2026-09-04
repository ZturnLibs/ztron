---
title: Plugins
---

# Plugins

Ztron's capability surface is made of built-in modules and plugins; this section gives a command-level reference per module. Each page covers the module's overview, permissions and scope, runnable examples, and its command list, cross-linked with the [Command Surface Reference](/reference/commands). There are 38 pages in total, grouped into five functional groups: core builtins (window and app skeleton), file & network (scope-checked IO such as fs/http), desktop components (native GUI such as tray/menu/dialog), data & misc (storage/logging/integration plugins), and mobile stubs (command surface aligned with upstream, failing closed on desktop runtimes).

## Core builtins

| Plugin | Description |
| --- | --- |
| [Window (window)](/plugins/window) | Control and query native windows: the `Window` class, 13 window event subscriptions, monitor queries and drag-region helpers |
| [Webview (webview)](/plugins/webview) | Webview-layer controls for the web content embedded in a window: print, background color, devtools, zoom, browsing data clearing, etc. |
| [WebviewWindow (webview-window)](/plugins/webview-window) | Create native windows at runtime: `WebviewWindow` extends `Window` and adds `create()`, which really creates a second window while the app runs |
| [App (app)](/plugins/app) | App metadata and whole-app lifecycle: name/version/identifier queries, whole-app show/hide and the macOS Dock icon toggle |
| [Process (process)](/plugins/process) | Two process-level operations: exiting the app and relaunching it |
| [Event (event)](/plugins/event) | Frontend entry of the two-way event system: listen to named backend events, emit targeted events to the frontend or other windows |
| [Path (path)](/plugins/path) | Path utilities: string operations, 30+ system and app directory getters, bundled-resource resolution and the `BaseDirectory` name table |
| [Image (image)](/plugins/image) | Register and reference native images: registered images pass by registry id (`rid`) to icon-accepting APIs such as `tray.setIcon` and `window.setIcon` |
| [DPI (dpi)](/plugins/dpi) | DPI-aware geometry types: logical pixels scale with the window's DPI factor, physical pixels are real device pixels |
| [Core (core)](/plugins/core) | Foundation of the frontend transport layer: `invoke` calls backend commands, `Channel` ordered streaming, `Resource` handles |

## File & network

| Plugin | Description |
| --- | --- |
| [Filesystem (fs)](/plugins/fs) | Scope-checked filesystem access: every read/write is validated against the app's PathScope and rejected when out of scope |
| [HTTP client (http)](/plugins/http) | Scope-checked HTTP client: URLs matched against the HttpScope allowlist before dispatch; `fetch()` and `fetchStream()` entry points |
| [Shell (shell)](/plugins/shell) | Scope-checked command execution: `execute`/`executeStream`/`open` and a command builder aligned with Tauri's `Command` class |
| [WebSocket (websocket)](/plugins/websocket) | Backend-proxied WebSocket connections: `connect`/`sendMessage`/`disconnect`, messages and status pushed via events |
| [Network (network)](/plugins/network) | Query the machine's network egress: primary-interface IPv4/IPv6 and public IPv4 as three pure query commands |
| [Local IP (local-ip)](/plugins/local-ip) | Returns the primary interface's IPv4 address (`null` when unknown or offline); overlaps with network's same query — pick one |
| [Upload (upload)](/plugins/upload) | POSTs a local file's contents as a raw body to a target URL and resolves with `{ status, ok, body }` |
| [Localhost (localhost)](/plugins/localhost) | Serves a directory over a `http://localhost:<port>` origin (`tjs.serve`), gated by a PathScope |
| [CLI (cli)](/plugins/cli) | Parses the command-line arguments the app launched with: `getArgv()` raw argv, `getMatches()` schema-parsed |

## Desktop components

| Plugin | Description |
| --- | --- |
| [Dialog (dialog)](/plugins/dialog) | Native modal dialogs: file/directory picking, save path, and the message trio (`message`/`ask`/`confirm`) |
| [Notification (notification)](/plugins/notification) | Sends system-level notifications and manages authorization (UNUserNotificationCenter on macOS) |
| [Tray (tray)](/plugins/tray) | System tray (an NSStatusItem on macOS): create/destroy, title and tooltip, icon and menu, visibility |
| [Menu (menu)](/plugins/menu) | Native menus: app/window menu bars, tray menus, context menus, plus check/radio/predefined item flavors |
| [Global Shortcut (global-shortcut)](/plugins/global-shortcut) | Registers global hotkeys that fire even when the app is not focused (Carbon Register/UnregisterEventHotKey on macOS) |
| [Clipboard (clipboard)](/plugins/clipboard) | Reads and writes the system clipboard: plain text, the HTML flavor, PNG images, and one-call clear |
| [Updater (updater)](/plugins/updater) | Self-update: check manifest → download → integrity verification → relaunch; SemVer gating + sha256 + minisign signature (fail-closed) |
| [Persisted Scope (persisted-scope)](/plugins/persisted-scope) | Makes the fs scope allowlist survive restarts: paths granted at runtime remain granted after a restart |
| [Window State (window-state)](/plugins/window-state) | Persists the current window's geometry (position/size/maximized flags) to JSON and restores it at startup |
| [Positioner (positioner)](/plugins/positioner) | Reads and writes the current window's position and size: `getPosition`/`setPosition`/`getFrame`/`getSize` |

## Data & misc

| Plugin | Description |
| --- | --- |
| [Persistent KV Store (store)](/plugins/store) | Persistent key-value store: state lives in JSON files on disk and survives restarts |
| [Structured Logging (log)](/plugins/log) | Five-level structured logging, dispatched to stdout/stderr/file (with rotation)/webview targets |
| [SQLite Database (sql)](/plugins/sql) | SQLite access (via `tjs:sqlite`): `Database.load` opens a pooled connection; `execute`/`select` run statements and queries |
| [Encrypted Vault (stronghold)](/plugins/stronghold) | Encrypted persistent KV vault: scrypt key derivation + ChaCha20-Poly1305 AEAD over the whole snapshot (pure-TS rewrite) |
| [Autostart (autostart)](/plugins/autostart) | Makes the app launch at login: the enable/disable/isEnabled trio |
| [Single Instance (single-instance)](/plugins/single-instance) | Ensures only one running instance per app: a second launch notifies the primary and brings its window to front |
| [Deep Link (deep-link)](/plugins/deep-link) | Handles custom URL scheme deep links: when the outside world opens the app with a `ztron://...` URL, a running page receives the full URL |
| [Opener (opener)](/plugins/opener) | Opens URLs and paths with the system default application and reveals items in the file manager |

## Mobile

| Plugin | Description |
| --- | --- |
| [Mobile Plugins Overview (mobile)](/plugins/mobile) | Five mobile-oriented plugins (barcode-scanner/biometric/geolocation/haptics/nfc): command surface aligned with upstream, every command fails closed deterministically on desktop runtimes (throws `PluginUnavailable`) |

适用版本：`ztron 0.3.1`
