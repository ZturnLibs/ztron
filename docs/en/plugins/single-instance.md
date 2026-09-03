---
title: Single Instance (single-instance)
---

# Overview

The `single-instance` module ensures **only one running instance per
app** (a port of `tauri-plugin-single-instance`), backed by the
`plugin:single-instance|*` commands. A second launch does not run
alongside: the primary is notified and brings its window forward,
while the secondary can query that it is not the primary.

Mechanism: the primary binds a loopback TCP port derived
deterministically from the identifier (an FNV-1a hash mapped into
20000–60000); the secondary fails to bind, signals the primary over
HTTP, and the primary then emits the `ztron://single-instance` event
(payload `{ argv: string[]; cwd: string }` — argv is currently always
an empty array, stated verbatim in the source) and focuses its `main`
window.

```ts
import { singleInstance, isPrimaryInstance, onSecondInstance } from "@zturnlibs/ztron-api/single-instance";
```

# Permissions & Scope

The plugin is constructed with `singleInstancePlugin(options)`; the
only option is `identifier` (a reverse-domain identifier that must
match `AppBuilder(runtime, identifier)`, otherwise two "different
apps" would contend for the same port range; default
`"com.ztron.app"`). No scope.

One permission `single-instance:allow-is-primary` (the query
command), aggregated into the `single-instance:default` set; the
hello example declares `single-instance:default`. Note that
`onSecondInstance` rides the event surface
(`ztron://single-instance`); event listening belongs to the
`core:default` event commands.

# Example

Backend registration (identifier matching the app). From
`examples/hello/src/main.ts` (comment kept):

```ts
.plugin(singleInstancePlugin({ identifier: "com.ztron.hello" }))
```

The frontend queries the primary-instance status. From
`examples/hello/frontend/src/main.ts` (the anchor
`SINGLE_INSTANCE_OK` is its real run output; comments kept, excerpt
elided):

```ts
// 11. single-instance (this process holds the lock)
const primary = await isPrimaryInstance();
if (primary) report("SINGLE_INSTANCE_OK");
```

The secondary branch + second-launch notification (signature-level
example; the single-process hello spike does not cover the secondary
side; payload as above):

```ts
if (!(await isPrimaryInstance())) {
  // I am the secondary: the usual move is to exit and hand control
  // to the already-running primary.
}
await onSecondInstance(({ argv, cwd }) => {
  // Primary only; bring the existing window forward or handle argv
  // (currently always []).
  console.log("second instance:", argv, cwd);
});
```

# Commands

`plugin:single-instance|*` totals **1 command**:

| Command | API |
| --- | --- |
| `is_primary` | `isPrimaryInstance` (`singleInstance.isPrimary`) |

Event surface: `ztron://single-instance` ← `onSecondInstance`
(`singleInstance.onSecondInstance`).

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/single-instance).

Applicable version: `ztron 0.3.0`
