---
title: Introduction
---

# What is Ztron

Ztron is a Tauri-style cross-platform desktop application framework whose core is rewritten in TypeScript instead of Rust. It runs on [txiki.js](https://txikijs.org) (a lightweight ~2MB JS runtime), with the UI rendered by the system WebView ([webview/webview](https://github.com/webview/webview), integrated via `tjs:ffi`). The frontend keeps a real web stack (built with Vite), the main-process logic is entirely TypeScript, and the host process (`ztron-host`) is native C. The API protocol is isomorphic to `@tauri-apps/api`, so frontend code migrates at low cost.

# Architecture at a Glance

```
┌────────────────────────┐  TCP/JSON   ┌──────────────────────────────────┐
│ ztron-host (native C)   │◄───────────►│ tjs backend (txiki.js, async)    │
│ system WebView + GUI    │             │ @zturnlibs/ztron-core: IPC/events/commands │
│ window/tray/menu/dialog │             │  ACL + plugins + updater         │
└────────────────────────┘             └──────────────────────────────────┘
        frontend: Vite page → @zturnlibs/ztron-api → invoke/listen/Channel/fs/http/os/store/log/shell
        packaging: tjs compile backend → ztron build → macOS .app (signed)
```

The two processes communicate over TCP/JSON: `ztron-host` owns the native GUI such as windows, tray, menus, and dialogs; the tjs backend hosts the application's main-process logic plus the IPC/events/commands layer. See the [Architecture guide](/guide/architecture) for details.

# Use Cases & Current Status

| Platform | Status |
| --- | --- |
| macOS | End-to-end verified: M0–P30 milestones, all 86 deterministic checks passing (`FULL_OK`, exit 0), drivable as a regression run via `ztron check` |
| Windows / Linux | host skeleton compiles, not yet in the bundling pipeline, no release timeline committed |

The capability surface includes multi-window (`MULTI_WINDOW_OK`), tray and menus (`TRAY_OK`, `MENU_OK`), drag & drop (`DRAG_DROP_ARMED`), streaming HTTP requests (`HTTP_STREAM_OK`), updater (`UPDATER_OK`), dmg bundling, and more; verification anchors for each are listed in the Status table of the repo [README.md](https://github.com/ZturnLibs/ztron/blob/main/README.md). Capability gaps and phased plans are tracked in [ROADMAP.md](https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md).

# Relationship to Tauri

Ztron's API protocol is isomorphic to `@tauri-apps/api` — `@zturnlibs/ztron-api` is its port, so in most cases frontend code only needs the import source swapped. IPC, capabilities (ACL), and the configuration model all align with Tauri v2. Differences and migration notes are covered in the [Migration guide](/guide/tauri-migration).

适用版本：`ztron 0.1.0`
