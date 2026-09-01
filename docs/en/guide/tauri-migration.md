---
title: Migrating from Tauri
---

Ztron's API surface is deliberately aligned with Tauri v2 (`@zturnlibs/api`
is translated from `@tauri-apps/api`), so the migration cost is mostly the
backend language: Rust replaced by TypeScript. The repo's `DESIGN.md` §9
gives the Rust → TS module mapping (copied verbatim):

| Rust module | Ztron TS equivalent |
| --- | --- |
| `tauri-runtime-wry` | `runtime-ffi` (tjs:ffi binding the webview C API) |
| `tauri` core | `core` (commands/events/state/plugins) |
| `tauri-codegen` injection | `inject` (embedded into page HTML) |
| `ipc/mod.rs` protocol | `core/ipc` (JSON + callback/error id + Channel) |
| `tauri-plugin` | TS plugins (register commands + permissions) |
| `tauri-bundler` | `tjs compile` + platform bundling scripts |
| `tauri-utils` (config/CSP) | zod schema + injected CSP |
| `@tauri-apps/api` | `api` (transport adaptation, protocol unchanged) |

## Command Migration

Rust's `#[tauri::command]` macro + `invoke_handler` registration becomes a
`defineCommand` typed declaration (paired with `ztron codegen`) or inline
`app.command(...)` registration, executed as `app.commandDef(greet)` inside
the `AppBuilder` setup callback. See [Calling Backend Commands](/guide/ipc).

## Configuration Migration

`tauri.conf.json` → `ztron.conf.json`; most fields share names
(`identifier`, `version`, `build.*`, `app.security.*`, `bundle.*`,
`windows[]`, etc.), and the type source of truth moves from Rust structs to
the TS `ProjectConfigFile` interface. Field details are in
[Configuring ztron.conf.json](/guide/config).

## Frontend Migration

Usually just change the import: `@tauri-apps/api` → `@zturnlibs/api`. The
signatures of `invoke`, `listen`, `emit`, etc. are unchanged, and the event
constants `TauriEvent` keep their names.

## Difference Notes

- The IPC payload is JSON, not MessagePack — but this matches Tauri v2
  desktop: research corrected the record that desktop never had MessagePack,
  and the real target is `InvokeResponseBody::Raw`; Ztron's base64-in-JSON
  matches Tauri's own recommended practice on Android (P24).
- `app.withGlobalTauri` is supported (injecting the
  `window.__TAURI_INTERNALS__` bootstrap, see the `inject` package).
- Capability coverage and gaps are in `ROADMAP.md`; Windows/Linux hosts are
  not yet compilable or bundleable, so no post-migration cross-platform
  timeline can be promised.

适用版本：`ztron 0.1.0`
