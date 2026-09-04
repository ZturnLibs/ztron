---
pageType: home
title: Ztron Docs
hero:
  name: Ztron
  text: A Tauri-style desktop framework, rewritten in TypeScript
  tagline: Runs on txiki.js (~2MB) + the system WebView — TypeScript main process, any web stack for the frontend
  actions:
    - text: Quick Start
      link: /start/quick-start
    - text: Prerequisites & Install
      link: /start/install
    - text: CLI Reference
      link: /reference/cli
features:
  - title: Two-process architecture
    details: A native host (windows/tray/menus) cooperates with an async tjs backend over TCP/JSON; @zturnlibs/ztron-core provides IPC, events, plugins and the ACL.
  - title: Tauri v2 capability parity
    details: "@zturnlibs/ztron-api ports @tauri-apps/api; invoke / events / Channel / fs / http / os / store / log / shell / updater plugins included, with a migration guide (see the Guide)."
  - title: macOS verified end-to-end
    details: Milestones M0–P30 complete, 85 deterministic checks (drivable via `ztron check`); the Windows/Linux bundling pipeline is under construction.
  - title: Guide & examples
    details: Architecture, IPC, events, windows, configuration, security model, plus three runnable examples — hello / multiwin / menuprobe.
  - title: 适用版本：`ztron 0.3.0`
    details: Docs evolve with the code; breaking API changes update this site in the same PR (see CONTRIBUTING).
---
