---
title: HTTP client (http)
---

# Overview

The `http` module provides a **scope-checked HTTP client**: every request
is matched against the app's configured HttpScope allowlist before it is
dispatched, and out-of-scope URLs throw. Two entry points — `fetch()`
(one-shot response, with `responseType: "text" | "json" | "binary"` and
`timeoutMs`) and `fetchStream()` (streaming response: resolves as soon as
status + headers arrive, body chunks are pushed over a Channel into a
`ReadableStream<Uint8Array>`, so the app never buffers the whole
response). Everything is backed by the single `plugin:http|fetch` command
(aligned with `@tauri-apps/plugin-http`).

```ts
import { http, fetch, fetchStream } from "@zturnlibs/ztron-api/http";
// or from the main entry: import { http, fetchStream } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

One command, one permission: `http:allow-fetch` (paired with
`http:deny-fetch` for explicit denial); the **`http:default`** set grants
fetch.

The scope comes from plugin construction: `httpPlugin({ scope })`, where
the `allow` array matches URLs by glob. From
`examples/hello/src/main.ts`:

```ts
.plugin(
  httpPlugin({
    scope: {
      allow: [
        { url: "https://api.github.com/*" },
        { url: "http://localhost:*/*" },
      ],
    },
  }),
)
```

Out-of-scope URLs (e.g. `https://evil.example.com/steal`) are rejected by
the backend with "scope denied" — the hello frontend asserts this
explicitly (`HTTP_SCOPE_DENY_OK`).

# Example

Example (adapted from sections 5b / 15 of
`examples/hello/frontend/src/main.ts`; the anchors `HTTP_OK`,
`HTTP_SCOPE_DENY_OK`, `HTTP_STREAM_OK:6c/head1ms/total277ms` are its real
run outputs):

```ts
// Plain fetch: the local echo server (scope allows http://localhost:*/*)
const resp = await http.fetch(`http://localhost:${port}/echo`);
if (resp.ok && resp.status === 200) report("HTTP_OK:" + resp.status);

// Streaming fetch: invoke resolves when the headers arrive; body chunks
// keep arriving over a Channel (the /stream endpoint emits 6 chunks with
// 45ms gaps, proving progressive delivery)
const sres = await fetchStream(streamUrl);
const reader = sres.body.getReader();
const parts: string[] = [];
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  parts.push(new TextDecoder().decode(value));
}
```

`timeoutMs` maps to the backend's `AbortSignal.timeout` (P19); with
`responseType: "binary"` the response carries `binary?: Uint8Array`, and
`"json"` carries `json?: unknown`; request bodies may be a string,
`Uint8Array`/`ArrayBuffer` (base64 on the wire) or a plain object
(auto-serialized to JSON with an implicit content-type).

# Commands

`plugin:http|*` totals **1 command**:

| Command | API |
| --- | --- |
| `fetch` | `fetch()` (one-shot) and `fetchStream()` (streaming via a Channel) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/http).

Applicable version: `ztron 0.3.1`
