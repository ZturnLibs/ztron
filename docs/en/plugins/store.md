---
title: Persistent KV Store (store)
---

# Overview

The `store` module provides a **persistent key-value store**: state
lives in JSON files on disk and survives restarts. It mirrors the
`plugin:store|*` commands (the G9/D2 resource model, translated from
`tauri-plugin-store` v2). The API has two layers:

- **v1 path-keyed surface**: the seven functions `get`/`set`/
  `remove`/`keys`/`values`/`entries`/`clear` plus the `store`
  namespace, addressing stores directly by file path (kept
  byte-compatible);
- **v2 `Store` class** (upstream style): `Store.load` attaches an
  instance explicitly, with autoSave, change listeners (pushed over a
  Channel), and the `reset`/`save`/`saveTo`/`setAutoSave`/`close`
  lifecycle — operating on the same files as the v1 functions.

```ts
import { store, Store } from "@zturnlibs/ztron-api/store";
import type { StoreChangeEvent } from "@zturnlibs/ztron-api/store";
```

# Permissions & Scope

The plugin is constructed with `storePlugin(options)`:

| Option | Meaning |
| --- | --- |
| `scope` | the `PathScope` for store files (e.g. `{ allow: ["$APPDATA/**"] }`; default `{ allow: ["**"] }`) |
| `baseDir` | base directory for relative paths (default `tjs.tmpDir`) |

Out-of-scope paths are rejected with `store scope denied: <abs>`.
Permissions come in three tiers: `store:read`
(get/keys/values/entries), `store:write` (read +
set/delete/clear/save_store), and `store:default` (plus the
load/save/save_to/reset/close/set_auto_save/on_change lifecycle
surface). The hello example declares `store:write`.

# Example

Backend registration (scope limited to `$TMP/**`). From
`examples/hello/src/main.ts` (comment kept):

```ts
.plugin(storePlugin({ scope: { allow: ["$TMP/**"] } }))
```

The frontend v1 function surface: write a value, read it back. From
`examples/hello/frontend/src/main.ts` (the anchor `STORE_OK` is its
real run output; comments kept, excerpt elided):

```ts
// 5d. store plugin (KV persistence)
const tmp = await os.tmpdir();
const storePath = `${tmp}/ztron_store_test.json`;
await store.clear(storePath);
await store.set(storePath, "greeting", "hello-store");
const val = await store.get<string>(storePath, "greeting");
if (val === "hello-store") report("STORE_OK:" + val);
```

The v2 `Store` class (signature-level example, not covered by hello;
same shape as upstream `tauri-plugin-store` v2):

```ts
const st = await Store.load("$TMP/app-state.json", { autoSave: true });
await st.set("counter", 1);
const unlisten = await st.onChange((e) => {
  // e: { event: "set" | "delete"; key; value? } | { event: "reset"; key: null }
});
await st.save();      // persists now regardless of autoSave
await st.close();     // flushes (autoSave) and unloads the instance
```

Note one real divergence: the "unlisten" function returned by
`Store#onChange` is currently a no-op (upstream has no per-listener
unsubscribe either; semantics follow `close`) — the package source
comment states this verbatim.

# Commands

`plugin:store|*` totals **16 commands**:

| Command | API |
| --- | --- |
| `get` / `set` | `store.get` / `store.set` (`Store#get` / `Store#set`) |
| `has` | `Store#has` (no v1 function counterpart) |
| `delete` | `store.remove` (`Store#delete`; the command is `delete`, the function is named `remove`) |
| `keys` / `values` / `entries` | `store.keys` / `store.values` / `store.entries` (same-named instance methods) |
| `clear` | `store.clear` (empties the in-memory snapshot only — no persist, no event; for a persisting clear use `reset`) |
| `save_store` | v1 persist-now (inside `store:write`) |
| `load` / `close` | `Store.load` / `Store#close` (close flushes, then unloads the instance and its listeners) |
| `save` / `save_to` | `Store#save` / `Store#saveTo` |
| `reset` | `Store#reset` (empties, pushes a reset event, persists per autoSave) |
| `set_auto_save` | `Store#setAutoSave` |
| `on_change` | `Store#onChange` (set/delete/reset pushed over a Channel) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/store).

Applicable version: `ztron 0.3.0`
