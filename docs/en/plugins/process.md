---
title: Process（process）
---

# Overview

The `process` module provides two process-level operations: exiting the
app and relaunching it — a port of `@tauri-apps/api/process`. The module
exports the standalone functions `exit` / `relaunch` and the aggregate
object `process`.

```ts
import { exit, relaunch } from "@zturnlibs/ztron-api";
// note: process has no subpath export; import it from the main entry only
```

`exit(code = 0)` terminates the app with the given exit code;
`relaunch()` restarts best-effort: the host respawns itself detached and
the current process terminates (in a packaged app the launcher respawns
the full host + backend pair).

# Permissions & Scope

process is a framework built-in: its `plugin:process|*` commands are
granted by the **`core:default`** permission set in a capability;
`core:allow-process_<cmd>` (e.g. `core:allow-process_exit`) grants
single commands. No scope.

# Example

`exit`/`relaunch` terminate the current process when called, so the
hello example only verifies command registration without invoking them
(from `examples/hello/frontend/src/main.ts`, verification anchor
`PROCESS_OK`):

```ts
const hasProcess = await invoke<boolean>("m3:has-process", {});
if (hasProcess) report("PROCESS_OK");   // plugin:process|exit / relaunch registered

// real usage (at your own risk):
import { exit, relaunch } from "@zturnlibs/ztron-api";
await exit(0);
await relaunch();
```

# Commands

`plugin:process|*` totals **2 commands**: `exit`, `relaunch`. Full list
in the [Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
