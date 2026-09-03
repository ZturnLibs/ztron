---
title: Localhost (localhost)
---

# Overview

The `localhost` plugin serves a directory over a
`http://localhost:<port>` origin via `tjs.serve` (a fetch-style handler)
— for apps that prefer an http origin over the `ztron://` asset scheme
(upstream `tauri-plugin-localhost` parity; internal gap list E1). File
access is gated by a PathScope anchored at the served directory; `/`
falls back to `index.html`; content types cover common web assets (with
an `application/octet-stream` fallback), responses carry the CORS `*`
header, and misses return 404. The API side exposes three methods,
`start(port?)` / `stop()` / `status()`, all resolving a
`LocalhostStatus` (`{ already?, running?, port, origin?, stopped? }`).

```ts
import { localhost, start } from "@zturnlibs/ztron-api/localhost";
// or from the main entry: import { localhost, startLocalhost, stopLocalhost } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permissions: `localhost:allow-start`, `localhost:allow-stop`,
`localhost:allow-status`, collected in the **`localhost:default`** set.

The scope is declared at plugin construction:
`localhostPlugin({ dir?, port?, scope? })` — `dir` is the served
directory (default: cwd), the PathScope anchors on it (default: allow
`dir/**` plus `dir` itself) and accepts extra `scope` entries; `/..`
traversals are rejected. The hello example does not register this plugin;
from `examples/menuprobe/src/main.ts`, registration looks like:

```ts
const { localhostPlugin } = await import("@zturnlibs/ztron-core");
const lp = localhostPlugin({ dir: tjs.cwd });
```

# Example

The hello frontend does not use this module; the first snippet below is
minimal API-signature usage, the second is from
`examples/menuprobe/src/main.ts` (the anchor `LOCALHOST_OK:<port>` is its
real run output; comments kept, excerpts elided):

```ts
// Frontend API usage (signature-level example)
const st = await start();        // { already: false, port, origin: "http://localhost:<port>" }
const cur = await status();      // { running: true, port }
await stop();                    // { stopped: true }
```

```ts
// Backend plugin direct use (menuprobe): real tjs.serve, fetch-handler round trip
const lp = localhostPlugin({ dir: tjs.cwd });
const started = (await lp.commands.start({})) as { port: number };
const resp = await fetch(`http://localhost:${started.port}/__miss__`);
await lp.commands.stop({});
console.log(
  resp.status === 404 ? `LOCALHOST_OK:${started.port}` : `LOCALHOST_FAIL:${resp.status}`,
);
```

# Commands

`plugin:localhost|*` totals **3 commands**:

| Command | API |
| --- | --- |
| `start` | `start(port?)` (returns `{ already: true, ... }` when already running) |
| `stop` | `stop()` |
| `status` | `status()` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/localhost).

Applicable version: `ztron 0.3.0`
