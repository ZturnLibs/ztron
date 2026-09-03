---
title: WebSocket (websocket)
---

# Overview

The `websocket` module provides backend-proxied WebSocket connections:
`connect(url)` opens a connection and resolves with a connection id,
`sendMessage(id, message)` sends a text frame, `disconnect(id)` closes.
Incoming messages and connection state changes are pushed over the
`ztron://websocket-message` and `ztron://websocket-status` events, and
`onMessage` / `onStatus` return unlisten functions. Backed by the three
`plugin:websocket|*` commands (a port of `tauri-plugin-websocket`).

```ts
import { websocket, connect } from "@zturnlibs/ztron-api/websocket";
// or from the main entry: import { websocket, connect } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permissions: `websocket:allow-connect`, `websocket:allow-send`,
`websocket:allow-disconnect`; the **`websocket:default`** set grants all
three commands at once. No scope — the plugin is constructed with no
arguments. From `examples/hello/src/main.ts`:

```ts
.plugin(websocketPlugin())
```

The matching capability entry is `"websocket:default"`.

# Example

From `examples/hello/frontend/src/main.ts` (the anchor `WEBSOCKET_OK` is
its real run output; a round trip against a public echo server, comments
kept, excerpts elided):

```ts
// 1d. websocket (public echo server round trip)
const echo = new Promise<string>((resolve) => {
  void websocket.onMessage((e) => resolve(e.message));
});
const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
await websocket.sendMessage(id, "ws-echo-test");
const echoed = await Promise.race([
  echo,
  new Promise<string | null>((r) => setTimeout(() => r(null), 8000)),
]);
await websocket.disconnect(id);
if (echoed && echoed.includes("ws-echo-test")) {
  report("WEBSOCKET_OK:" + String(echoed).slice(0, 24));
}
```

The `onMessage` payload is `{ id, message }` (shared event stream across
connections, disambiguated by `id`); the `onStatus` payload is
`{ id, state }`.

# Commands

`plugin:websocket|*` totals **3 commands**:

| Command | API |
| --- | --- |
| `connect` | `connect(url)` → `{ id }` |
| `send` | `sendMessage(id, message)` |
| `disconnect` | `disconnect(id)` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/websocket).

Applicable version: `ztron 0.3.0`
