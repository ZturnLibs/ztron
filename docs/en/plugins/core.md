---
title: Core（core）
---

# Overview

The `core` module is the foundation of the Ztron frontend transport
layer: `invoke` calls backend commands, `Channel` receives ordered
streaming messages, `Resource` wraps host resource-table handles, plus
plugin-listener, asset-URL and callback plumbing. It translates
`@tauri-apps/api/core` to the Ztron transport contract. See
[Calling Backend Commands](/guide/ipc) for the calling model.

```ts
import { invoke, Channel, convertFileSrc } from "@zturnlibs/ztron-api/core";
// the main entry re-exports these symbols as well
```

- `invoke<T>(cmd, args?, options?)`: sends a message to the backend;
  resolves to the backend response.
- `Channel<T>`: streaming message channel. Messages carry a
  monotonically increasing index and are delivered in order, with
  out-of-order messages queued until the gap is filled; construct with
  `new Channel(onmessage)` and pass it as a command argument — the
  backend pushes via `ctx.getChannel(id)`. Serializes to
  `__CHANNEL__:<id>`.
- `Resource`: base class for backend-owned resources in the host
  resource table (readonly `rid`); `close()` releases it explicitly via
  `plugin:resources|close`.
- `addPluginListener(plugin, event, cb)`: the plugin listener contract
  (`plugin:<p>|__listener` / `__unlistener`) — plugins whose event
  names cannot contain `|` (e.g. log) use it instead of named events;
  resolves to an unlisten function.
- `convertFileSrc(filePath, protocol?)`: converts a device file path to
  a URL loadable by the WebView (custom protocol; the bootstrap picks
  `ztron://` by default).
- `isZtron()`: whether the current context is a Ztron WebView.
- `transformCallback(cb, once?)`: stores a callback and returns an
  identifier the backend can call later (the infrastructure behind
  `Channel` and the event system).
- `SERIALIZE_TO_IPC_FN`: the key special types use to define custom IPC
  serialization.

# Permissions & Scope

The ACL (default deny) only gates commands with the `plugin:` prefix:
built-in commands are granted by **`core:default`**, plugin commands by
their own permission strings (e.g. `fs:allow-read-file`); app-custom
commands (`my:greet`, `m3:*` — anything not prefixed `plugin:`) bypass
the ACL gate. See the [Security Model](/guide/security).

# Example

Example (adapted from `examples/hello/frontend/src/main.ts`; the anchors
`INVOKE_OK`, `CHANNEL_OK:1,2,3`, `CONVERT_FILE_SRC_OK` are its real run
outputs):

```ts
import { invoke, Channel, convertFileSrc } from "@zturnlibs/ztron-api";

const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });

// streaming: the backend sends three messages on one channel, then ends
const ch = new Channel<{ n: number }>((msg) => console.log(msg.n));
await invoke("m3:stream", { ch });          // 1,2,3 arrive in order

// load a local file through the custom protocol (inside a ztron:// page)
imgEl.src = convertFileSrc(`${temp}/icon.png`);
```

# Commands

`core` itself registers a single resource-release command:
`plugin:resources|close` (used by `Resource.close()`). Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.1`
