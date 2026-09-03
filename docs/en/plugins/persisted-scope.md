---
title: Persisted scope (persisted-scope)
---

# Overview

The `persisted-scope` module makes the fs **scope allowlist survive
restarts**: paths the user granted at runtime (e.g. through a save
dialog) are merged into the allowlist and still granted after a
restart. It is a port of Tauri's `tauri-plugin-persisted-scope`,
backed by the `plugin:persisted-scope|*` commands. On construction the
plugin creates a `PathScope` that loads extra allow entries from a JSON
file; the `save` command writes the merged allowlist (base + persisted
entries) back. The wiring with fs is sharing one scope instance:
`fsPlugin({ scope: psPlugin.scope })`.

```ts
import { getPersistedScope, savePersistedScope, persistedScope } from "@zturnlibs/ztron-api/persisted-scope";
```

# Permissions & Scope

persisted-scope is a **standalone plugin** with just two permissions:

| Permission | Grants |
| --- | --- |
| `persisted-scope:default` | `allow-get` + `allow-save` (read/write the merged allowlist) |

From `examples/hello/capabilities/main.json`:
`"persisted-scope:default"`.

Construction options: `persistedScopePlugin({ file, scope })` — `file`
is the path of the persisted JSON; `scope` is the baseline PathScope
config (**always allowed**, cannot be removed). The hello baseline is
`$TMP/**`, grown with `$HOME/ztron-persisted-spike/**` in the spike
(see [Filesystem](/plugins/fs)).

**Seed race** (fixed in P8; comment from
`examples/hello/src/main.ts`) — a pre-seeded allow entry must finish
writing BEFORE the plugin is constructed, because the plugin loads the
file in its constructor; a fire-and-forget write races the load and
loses on a cold start (file not yet there → scope not applied):

```ts
// Persisted-scope: base fs scope is $TMP/**; pre-seed an extra allow entry so
// the spike can prove a path outside $TMP is granted after a "restart".
// NOTE: the seed must complete BEFORE the plugin is constructed — the plugin
// loads the file in its constructor; a fire-and-forget write here races the
// load and loses on a cold start (file not yet there → scope not applied).
await tjs.writeFile(
  `${tjs.tmpDir}/ztron_persisted_scope.json`,
  new TextEncoder().encode(
    JSON.stringify({ allow: ["$HOME/ztron-persisted-spike/**"] }),
  ),
);

const persisted = persistedScopePlugin({
  file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
  scope: { allow: ["$TMP/**"] },
});
const psScope = persisted.scope;
```

# Example

The frontend verifies the persisted entry is loaded and that fs can
write outside the baseline. From
`examples/hello/frontend/src/main.ts` (the anchor
`PERSISTED_SCOPE_OK` is its real run output; comments kept, excerpts
elided):

```ts
// 1g. persisted-scope: pre-seeded allow entry is loaded + grants a path
// outside the base scope ($HOME/...), and fs.write succeeds there.
const merged = await getPersistedScope();
const hasPersisted = merged.allow.some((a) =>
  a.includes("ztron-persisted-spike"),
);
await fs.makeDir("$HOME/ztron-persisted-spike", { recursive: true });
await fs.writeText("$HOME/ztron-persisted-spike/ok.txt", "persisted-ok");
const back = await fs.readText("$HOME/ztron-persisted-spike/ok.txt");
if (hasPersisted && back === "persisted-ok") {
  report("PERSISTED_SCOPE_OK");
}
```

`savePersistedScope()` writes the current merged allowlist back to
`file` (returning `{ saved: true }`); new entries at runtime go through
the fs scope's dynamic growth API (`scope.addAllow`), then get
persisted via `save`.

# Commands

`plugin:persisted-scope|*` totals **2 commands**, mapped one-to-one to
the API:

| Command | API |
| --- | --- |
| `get` | `getPersistedScope()` (`{ allow: string[] }`) |
| `save` | `savePersistedScope()` (`{ saved: boolean }`) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/persisted-scope).

Applicable version: `ztron 0.3.0`
