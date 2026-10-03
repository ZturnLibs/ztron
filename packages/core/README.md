# @zturnlibs/ztron-core

Main-process ("backend") framework core for [Ztron](https://github.com/ZturnLibs/ztron): IPC, commands, events, channels, state, the ACL capability system, and the built-in plugin set. Runs on [txiki.js](https://txikijs.org) (the `tjs` global) — see [`@zturnlibs/tjs-types`](https://www.npmjs.com/package/@zturnlibs/tjs-types) for full backend typings.

You normally get this package via `@zturnlibs/ztron-cli` (templates already wire it up). Install directly only if you're assembling a project by hand or building tooling on top of Ztron.

## Install

```sh
npm install @zturnlibs/ztron-core
```

## Commands

Define backend commands with typed arg/result shapes; `ztron codegen` emits type-safe frontend invoke bindings from these exports, so the contract can't drift.

```ts
import { defineCommand } from "@zturnlibs/ztron-core";

export const ping = defineCommand("bench:ping", {
  args: {} as { n: number },
  result: 0 as number,
  handler: (args) => args.n,
});

// registered on the app: app.commandDef(ping)
```

## What's inside

- **IPC** — `IpcHub`, `ChannelHandle`, `EventManager`: invoke, streaming channels, event routing (webview ↔ backend, label-targeted)
- **Commands** — `defineCommand` / `CommandRegistry` with arg/result shape validation
- **ACL** — capability/permission sets gating every invoke; `PathScope` (fs allowlists) and `HttpScope` (URL allowlists); CSP injection support
- **Plugins** — 31 built-ins: fs, http, shell (+Command), store, sql, log, os, clipboard, dialog, tray, menu, notification, global-shortcut, single-instance, deep-link, updater, autostart, websocket, positioner, window-state, local-ip, network, upload, persisted-scope, …
- **State** — `StateManager` for backend state injection
- **Testing** — `MockRuntime` / `MockWebviewHandle`: route every command through a fake host in plain unit tests, no window required

```ts
import { MockRuntime } from "@zturnlibs/ztron-core";
```

## Docs

- [Documentation (zh / en)](https://zturnlibs.github.io/ztron/docs/)
- [Design deep-dive (DESIGN.md)](https://github.com/ZturnLibs/ztron/blob/main/DESIGN.md)
- [Three-layer test design](https://github.com/ZturnLibs/ztron/blob/main/tests/README.md)

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
