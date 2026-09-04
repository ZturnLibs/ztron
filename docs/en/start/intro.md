---
title: Introduction
---

# What is Ztron

Ztron is a **Tauri-style cross-platform desktop framework, rewritten in pure
TypeScript**: a ~2MB [txiki.js](https://txikijs.org) runtime + the system
WebView. Native windows, tray, menus, dialogs, and 25 official plugins — all
used through the Tauri-compatible APIs you already know.

The architecture in one sentence: a tiny native host (C, owning the WebView and
GUI) + an async TypeScript backend (txiki.js, handling IPC / plugins / ACL),
while the frontend is just an ordinary Vite page.

Already familiar with Tauri? The APIs map one-to-one — `invoke` / `listen` /
`fs` / `window` all live in [`@zturnlibs/ztron-api`](/start/quick-start); for a
differences list see [Migrating from Tauri](/guide/tauri-migration).

**Next: [Prerequisites & Installation](/start/install)**
