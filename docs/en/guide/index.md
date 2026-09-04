---
title: Guide
---

# Guide

The guide explains Ztron's core mechanics by topic: starting from the two-process model in the [Architecture Overview](/guide/architecture), it covers [Calling Backend Commands](/guide/ipc) (the invoke command model), [Events & Channel](/guide/events) (two-way communication), [Windows](/guide/window) (declarative and runtime creation), [Configuring ztron.conf.json](/guide/config) (the project configuration file), and the [Security Model](/guide/security) (ACL-based capability grants); [Bundling & Distribution](/guide/bundling), [Signing & the Updater](/guide/signing-updater), and [Debugging & Logging](/guide/debugging) then cover shipping practice, closing with [Migrating from Tauri](/guide/tauri-migration) — Ztron's API surface aligns with Tauri v2, so the migration cost is mostly the backend language (Rust replaced by TypeScript).

| Chapter | Description |
| --- | --- |
| [Architecture Overview](/guide/architecture) | Two-process data flow: a native host (windows/tray/menus) cooperating with an async tjs backend over TCP/JSON |
| [Calling Backend Commands](/guide/ipc) | The `invoke` command model: typed `defineCommand` declarations, protocol aligned with Tauri v2 (JSON + callback/error id + Channel) |
| [Events & Channel](/guide/events) | Two-way frontend/backend events: listen/once/emit/emitTo and ordered Channel streaming |
| [Windows](/guide/window) | Two creation paths: declarative (`windows[]` in `ztron.conf.json`) and runtime (`WebviewWindow`) |
| [Configuring ztron.conf.json](/guide/config) | The project config file: two-layer validation (CLI fail-fast + core), consumed via `AppBuilder.fromConfig` |
| [Security Model](/guide/security) | Tauri v2's ACL model: deny by default; every command and path/URL must be explicitly granted in a capability |
| [Bundling & Distribution](/guide/bundling) | `ztron build` produces distributable artifacts: `.app` and `.dmg` on macOS, directory layouts for the other platforms' real toolchains |
| [Signing & the Updater](/guide/signing-updater) | The self-update trust chain: minisign signing/verification with `ztron signer`, the update manifest, and the `updaterPlugin` `install()` flow |
| [Debugging & Logging](/guide/debugging) | A roundup of debugging entry points: the DevTools toggle, structured logging via the log plugin, and the `ztron check` regression runner |
| [Migrating from Tauri](/guide/tauri-migration) | Rust → TS module mapping: `@zturnlibs/ztron-api` is a translation of `@tauri-apps/api`; the frontend mostly just swaps imports |

适用版本：`ztron 0.3.1`
