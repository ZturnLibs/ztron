<div align="center">

<img src="./assets/ztron-logo.svg" alt="Ztron" width="88" />

# Ztron

**Build cross-platform desktop apps in pure TypeScript — Tauri-style architecture on a micro runtime + system WebView.**

[![CI](https://github.com/ZturnLibs/ztron/actions/workflows/ci.yml/badge.svg)](https://github.com/ZturnLibs/ztron/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@zturnlibs/ztron-cli?label=%40zturnlibs%2Fztron-cli)](https://www.npmjs.com/package/@zturnlibs/ztron-cli)
![platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20verified-blue)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-zh%2F%20en-8b5cf6)](https://zturnlibs.github.io/ztron/docs/)

[简体中文](./README.md) · **English**

[Homepage](https://zturnlibs.github.io/ztron/) · [Docs](https://zturnlibs.github.io/ztron/docs/) · [Quick Start](https://zturnlibs.github.io/ztron/docs/en/start/quick-start.html) · [Examples](./examples/)

</div>

---

## Why Ztron

- **Pure TypeScript, end to end** — frontend and backend are both TS. No Rust toolchain, no cross-compilation; the native layer (window host + runtime) ships prebuilt with the CLI.
- **Actually lightweight** — the [txiki.js](https://txikijs.org) backend runtime is ~2MB and rendering uses the **OS webview**. No bundled Chromium; installers in the 5MB range.
- **Zero-cost migration for Tauri users** — the API is a faithful port of [`@tauri-apps/api`](https://github.com/tauri-apps/tauri) as `@zturnlibs/ztron-api`; the IPC/events/commands/plugins protocol is isomorphic. The [migration guide](https://zturnlibs.github.io/ztron/docs/en/guide/tauri-migration.html) gets you moved in half a day.
- **Complete ecosystem** — 25+ built-in plugins (fs/http/store/sql/shell/tray/menu/dialog/updater…), an ACL capability system, the `ztron://` custom protocol, auto-update + signing + dmg packaging.

## How Ztron Compares

| | Ztron | Tauri v2 | Electron |
| --- | --- | --- | --- |
| Frontend | TS + any framework | TS + any framework | TS + any framework |
| **Backend** | **TypeScript (txiki.js)** | Rust | JavaScript (Node.js) |
| Native toolchain | None (CLI ships prebuilt) | Rust toolchain; cross-compiling needs setup | None |
| Rendering | OS webview | OS webview | Bundled Chromium + Node |
| Installer size | **6.2 MB** (measured) | ~3–10 MB | ~85–100 MB |
| Backend change takes effect | On save | Rust recompile | On save |
| Security model | ACL capabilities + Path/HttpScope + CSP | capabilities + scope | roll your own |
| Packaging / signing / updater | ✅ built in | ✅ built in | via electron-builder & friends |
| Platform verification | ✅ macOS (Apple Silicon) · 🚧 Windows · 🚧 Linux | ✅ all platforms + mobile | ✅ all platforms (10+ years) |

> Ztron numbers are a measured baseline (Apple M3, 2026-09, reproducible via `ztron bench --record`): cold start 582ms · invoke P50 0.31ms / P95 1ms · Channel 8.5MB/s · window create 58ms · .app 6.21MB. Competitor sizes are commonly cited figures, for scale only. **Honest disclaimer: Tauri and Electron are far more mature across platforms than Ztron** — treat the last row as the deciding one.

## Up and Running in 30 Seconds

> Prerequisites: macOS (Apple Silicon verified) + Node.js ≥ 20. The native chain ships prebuilt with the CLI — **no repo clone, no compilation, no environment variables**.

```bash
npm i -g @zturnlibs/ztron-cli
ztron init my-app --template react-ts   # templates: vanilla | react-ts | vue-ts | svelte
cd my-app && pnpm install
ztron dev                               # a native window opens
```

Packaging and health checks whenever you need them:

```bash
ztron build      # package + ad-hoc sign ZtronApp.app + dmg
ztron doctor     # 5-point environment check, FAILs come with fix hints
```

If anything looks off, run `ztron doctor`; full install instructions live in the [docs](https://zturnlibs.github.io/ztron/docs/en/start/install.html).

## Feature Highlights

| Feature | What it means |
| --- | --- |
| Declarative windows | Declare startup windows (size/position/transparent/decorations…) in `ztron.conf.json`, dual-layer schema validation |
| Full-module HMR | Vite dev server + the `ztron://` custom protocol (WKURLSchemeHandler), module-level hot replacement |
| Typed commands | `ztron codegen` emits typed invoke bindings; the frontend/backend contract never drifts |
| Full tjs typings | [`@zturnlibs/tjs-types`](./packages/tjs-types/): the backend `tjs.*` global ships with complete TS types (synced from the official txiki.js types of the exact runtime ztron builds, plus additions); a separate entry covers the frontend's pure-ES2022 environment |
| ACL capabilities | Declare the permission surface in capability files; fs/http are constrained by PathScope/HttpScope |
| Multi-window | `WebviewWindow` runtime create/destroy, label routing, window registry |
| Full system API surface | tray/menu/dialog/clipboard/notification/global-shortcut/deep-link/fs.watch/drag & drop… |
| Production packaging | `tjs compile` standalone executable + .app/dmg + ad-hoc/Developer ID signing + auto-update |
| Three-layer testing | surface/unit/integration with `ztron check` exit-code regression (85 deterministic checks + `FULL_OK`) |

## Architecture

```
┌──────────────────────────┐  TCP/JSON  ┌───────────────────────────────────┐
│ ztron-host (native C)     │◄──────────►│ tjs backend (txiki.js, async)     │
│ system WebView + GUI loop │            │ @zturnlibs/ztron-core             │
│ window/tray/menu/dialog   │            │   IPC / events / commands / ACL   │
└──────────────────────────┘            └───────────────────────────────────┘
   frontend: Vite page → @zturnlibs/ztron-api → invoke/listen/Channel/fs/http/…
   packaging: ztron build → tjs compile backend → macOS .app / dmg (signed)
```

For a deep dive see [DESIGN.md](./DESIGN.md) (architecture decisions, technical findings, the Rust→TS translation map).

## Packages

| Package | Role |
| --- | --- |
| [`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api) | Frontend API (ported from `@tauri-apps/api`): fs/http/os/store/log/shell/window/tray/menu/dialog/updater… |
| [`@zturnlibs/ztron-core`](https://www.npmjs.com/package/@zturnlibs/ztron-core) | Main-process core: IPC, events, Channel, commands, ACL, PathScope, 25+ plugins, MockRuntime |
| [`@zturnlibs/ztron-runtime-ffi`](https://www.npmjs.com/package/@zturnlibs/ztron-runtime-ffi) | `HostRuntime` socket adapter (two-process model) + FFI reference bindings |
| [`@zturnlibs/ztron-cli`](https://www.npmjs.com/package/@zturnlibs/ztron-cli) | `init` / `dev` / `build` / `check` / `codegen` / `doctor` / `bench` |
| [`@zturnlibs/ztron-driver`](https://www.npmjs.com/package/@zturnlibs/ztron-driver) | WebDriver intermediary (W3C protocol, drive Ztron apps externally) |

## Examples & Templates

`ztron init --template <name>` offers:

| Template | Stack |
| --- | --- |
| `vanilla` | TS + Vite (minimal starting point) |
| `react-ts` | React 19 + Tailwind v4 |
| `vue-ts` | Vue 3.5 + Tailwind v4 |
| `svelte` | Svelte 5 runes + Tailwind v4 |

[`examples/`](./examples/) contains 8 runnable examples. The highlight is **[showcase](./examples/showcase/)** — 34 interactive cards demoing every plugin API live (`pnpm --filter @zturnlibs/ztron-example-showcase dev`); plus hello / multiwin / react-demo / vue-demo / svelte-demo / bench / menuprobe. A guided tour lives on the [examples page](https://zturnlibs.github.io/ztron/docs/en/start/examples.html).

## Platform Support

| Platform | Status |
| --- | --- |
| macOS (Apple Silicon) | ✅ fully verified (Intel unverified, may work) |
| Windows (WebView2) | 🚧 dev chain working: window/menu/tray/clipboard host surface complete, hello/multiwin/menuprobe spikes fully green locally (`FULL_OK`/`MENU_V2_OK`/`TRAY_V2_OK`); prebuilt native chain & packaging pending (local dev needs vcpkg + MSVC, see Contributing) |
| Linux (WebKitGTK) | 🚧 host skeleton in place, packaging chain pending |
| Mobile (Android/iOS) | 📋 planned |

## Contributing

```bash
pnpm install                                        # workspace deps
scripts/build-native.sh                             # build the native chain (macOS once; Windows needs vcpkg install libffi:x64-windows + VS Build Tools first, the script guides you)
pnpm --filter @zturnlibs/ztron-example-hello dev    # run an example inside the monorepo
pnpm test                                           # 217 tests (surface/unit/core layers)
```

The three layers target 100% coverage of features + API: surface pins the registered commands and API exports to the manifest; unit routes every command through MockRuntime; integration drives the real host + WebView (`ztron check` — 85 deterministic checks + the `FULL_OK` sentinel, exit-code regressable). Design notes in [tests/README.md](./tests/README.md).

Performance baseline (cold/warm start, invoke P50/P95, channel throughput, window create, RSS):

```bash
node packages/cli/dist/index.js bench --runs 3
```

## Project Status

**M0–P30 complete**: 86 deterministic checks, all FULL_OK / exit 0. The full development log (what each phase delivered, acceptance tags, hard-won findings) lives in [DESIGN.md §7](./DESIGN.md); the capability gap vs Tauri and the roadmap live in [ROADMAP.md](./ROADMAP.md).

## License

[MIT](./LICENSE)
