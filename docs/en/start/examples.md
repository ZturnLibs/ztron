---
title: Examples
---

The repo's `examples/` directory contains three runnable examples, all directly runnable via pnpm filters:

| Name | Package | Demonstrates | Run command |
| --- | --- | --- | --- |
| hello | `@ztron/example-hello` | a full drill of invoke/events/Channel/fs/path and other APIs (86 checks) | `pnpm --filter @ztron/example-hello dev` |
| multiwin | `@ztron/example-multiwin` | multi-window: conf declaration + runtime WebviewWindow create/destroy | `pnpm --filter @ztron/example-multiwin dev` |
| menuprobe | `@ztron/example-menuprobe` | menu capability probing | `pnpm --filter @ztron/example-menuprobe dev` |

## hello

A full drill of `@zturnlibs/api` — invoke, events, Channel streams, fs/path/http/os, and other APIs — with 86 built-in deterministic checks; combined with `ztron check` it serves as the regression baseline for the whole framework (`FULL_OK`, exit 0). Its `ztron.conf.json` also demonstrates declarative multi-window (`windows[]`, with both window sources: the `url: "frontend"` placeholder and inline `html`). Source: `examples/hello/` (config `ztron.conf.json`, main process `src/main.ts`, commands `src/commands.ts`, frontend `frontend/src/main.ts`).

## multiwin

Demonstrates the two ways of doing multi-window: statically declaring in `ztron.conf.json`'s `windows[]`, and creating/destroying windows at runtime via `WebviewWindow` (verification anchor `MULTI_WINDOW_OK`; the second runtime-created window is really created and destroyed, `SECOND_WINDOW_OK label=second`). Source: `examples/multiwin/`.

## menuprobe

A menu capability probing example, covering menu construction and dynamic manipulation capabilities. Source: `examples/menuprobe/`.

Each example depends on workspace packages inside the monorepo; complete [Installation](/start/install) and the native chain build first.

适用版本：`ztron 0.1.0`
