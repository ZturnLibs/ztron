---
title: Examples
---

> The `examples/` directory belongs to the framework repo (contributor/developer perspective). For regular app development, start from the `ztron init` path in [Quick Start](/start/quick-start).

The repo's `examples/` directory contains five runnable examples, all directly runnable via pnpm filters:

| Name | Package | Demonstrates | Run command |
| --- | --- | --- | --- |
| hello | `@zturnlibs/ztron-example-hello` | a full drill of invoke/events/Channel/fs/path and other APIs (85 checks) | `pnpm --filter @zturnlibs/ztron-example-hello dev` |
| multiwin | `@zturnlibs/ztron-example-multiwin` | multi-window: conf declaration + runtime WebviewWindow create/destroy | `pnpm --filter @zturnlibs/ztron-example-multiwin dev` |
| menuprobe | `@zturnlibs/ztron-example-menuprobe` | menu capability probing | `pnpm --filter @zturnlibs/ztron-example-menuprobe dev` |
| bench | `@zturnlibs/ztron-example-bench` | automated perf measurement sequence (invoke/Channel/window) | `node packages/cli/dist/index.js bench --runs 3` |
| showcase | `@zturnlibs/ztron-example-showcase` | beginner-friendly interactive demo: 32 feature cards + code snippets + doc links | `pnpm --filter @zturnlibs/ztron-example-showcase dev` |

## hello

A full drill of `@zturnlibs/ztron-api` — invoke, events, Channel streams, fs/path/http/os, and other APIs — with 85 built-in deterministic checks; combined with `ztron check` it serves as the regression baseline for the whole framework (`FULL_OK`, exit 0). Its `ztron.conf.json` also demonstrates declarative multi-window (`windows[]`, with both window sources: the `url: "frontend"` placeholder and inline `html`). Source: `examples/hello/` (config `ztron.conf.json`, main process `src/main.ts`, commands `src/commands.ts`, frontend `frontend/src/main.ts`).

## multiwin

Demonstrates the two ways of doing multi-window: statically declaring in `ztron.conf.json`'s `windows[]`, and creating/destroying windows at runtime via `WebviewWindow` (verification anchor `MULTI_WINDOW_OK`; the second runtime-created window is really created and destroyed, `SECOND_WINDOW_OK label=second`). Source: `examples/multiwin/`.

## menuprobe

A menu capability probing example, covering menu construction and dynamic manipulation capabilities. Source: `examples/menuprobe/`.

## bench

The perf benchmark example: `ztron bench` drives its automated measurement sequence (cold/warm start, invoke P50/P95, Channel throughput, event round trip, window create, RSS, app size) and compares the results against the `perf-budget.json` budgets as a regression gate (see the Bench section of the repo root README). Source: `examples/bench/`.

## showcase

An interactive demo app for **beginner app developers** (the counterpart of Electron API Demos):
category navigation on the left, one card per feature, buttons that really execute, minimal code
snippets embedded in each card, and a "Docs" button linking straight to the matching docs page.
Covers core IPC/events/Channel, windows and multi-window, fs/path, http/streaming/WebSocket,
dialogs/notifications/clipboard, menu/tray/global shortcuts, store/sql/log, and the nine-piece
system integration set. Its `ztron.conf.json` and `capabilities/` are themselves a configuration
template for new projects. Smoke gate: `ztron check --expect SHOWCASE_OK`. Source: `examples/showcase/`.

Each example depends on workspace packages inside the monorepo; complete [Installation](/start/install) and the native chain build first.

**Deep dive: [Architecture](/guide/architecture) · [IPC](/guide/ipc) · [Security ACL](/guide/security) · [CLI Command Reference](/reference/cli)**

适用版本：`ztron 0.3.0`
