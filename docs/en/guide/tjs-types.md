---
title: Using tjs APIs with Full Types
---

The backend process runs on [txiki.js](https://txikijs.org) (`tjs`): file,
process, network (`tjs.serve`), FFI and other capabilities are exposed through
the global `tjs` object. As of 0.3.8 this global **ships with complete
TypeScript types out of the box** — app developers no longer need (and should
not hand-write) `declare const tjs`.

## Where the Types Come From

Types are provided by
[`@zturnlibs/tjs-types`](https://www.npmjs.com/package/@zturnlibs/tjs-types),
built from two layers:

- **Official types**: synced file-by-file from the txiki.js checkout ztron
  actually builds against (`native/txiki.js/types/src`) — strictly same-source
  as the runtime, so the "types say it exists, runtime doesn't have it" class
  of drift cannot happen;
- **Ztron additions**: runtime globals the upstream types miss (e.g.
  `tjs.platform`) and declarations for the frontend's pure-ES2022 environment
  (`@zturnlibs/tjs-types/web`).

How to get them (pick one; usually nothing to do manually):

1. **Depend on `@zturnlibs/ztron-core`** (the default): core carries a
   two-line reference and the tjs types activate automatically;
2. **`ztron init` scaffolds**: the template already drops `src/tjs.d.ts` (two
   `/// <reference types="..." />` lines) and declares the devDependency;
3. **Hand-written tsconfig**: `"types": ["node", "@zturnlibs/tjs-types"]`.

## Using Them in the Backend

In `src/main.ts` the `tjs.*` global is directly available, with full
completion and checking. The following snippet comes from
[`examples/hello/src/main.ts`](https://github.com/ZturnLibs/ztron/blob/main/examples/hello/src/main.ts):

```ts
// Self-hosted WS echo: tjs.serve + server.upgrade (hello spike's WEBSOCKET_OK check)
const server = await tjs.serve({
  port: 0,
  listenIp: "127.0.0.1",
  fetch: (req, ctx) => {
    if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      ctx.server.upgrade(req);
      return;
    }
    return new Response("websocket upgrade required", { status: 426 });
  },
  websocket: {
    message: (ws, data) => ws.sendText(data),
  },
});
wsEchoPort = server.port;
```

Note that the types reflect runtime behavior faithfully — for example
`tjs.readDir` returns an **async-iterable** `DirHandle`, not an array:

```ts
// also from examples/hello/src/main.ts
const stale = await tjs.readDir(spikeLogDir);
for await (const e of stale) {
  if (e.name.endsWith(".log")) await tjs.remove(`${spikeLogDir}/${e.name}`);
}
```

A hand-rolled `tjs-extra.d.ts` once typed that return value as an array: the
types passed, the runtime blew up — exactly why the official types are now the
single source.

## Frontend (webview) Side

The webview is a pure ES2022 environment (web-standard APIs, no Node). When
adding environment declarations for frontend TS code, reference the subpath
entry:

```ts
/// <reference types="@zturnlibs/tjs-types/web" />
```

## For Contributors: Type Sync

Repo contributors don't maintain types by hand:
`scripts/sync-tjs-types.sh` copies the vendored txiki.js's official `.d.ts`
files into `packages/tjs-types/src/` (run it when bumping the txiki version).
Ztron's own additions live in uniquely named files (`runtime-gaps.d.ts`,
`web-globals.d.ts`) that the sync never overwrites.

## Verification

Type correctness is backed end-to-end by the hello spike: 85 deterministic
checks + the `FULL_OK` sentinel, exit 0 (`ztron check`), including the
`WEBSOCKET_OK` check produced by the real code above.

Applicable version: `ztron 0.3.8`
