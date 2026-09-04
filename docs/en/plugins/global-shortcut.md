---
title: Global shortcut (global-shortcut)
---

# Overview

The `global-shortcut` module registers **global hotkeys that fire even
when the app is not focused**. It is a port of Tauri's
`tauri-plugin-global-shortcut`, backed by the built-in
`plugin:global-shortcut|*` commands and the `ztron://global-shortcut`
event (the macOS side uses Carbon's Register/UnregisterEventHotKey).
Registration returns a boolean — whether the OS accepted it (false when
the shortcut is taken by another app) — rather than succeeding
unconditionally.

```ts
import { registerShortcut, unregisterShortcut, registerAll, unregisterAll, isRegistered, onShortcut, globalShortcut } from "@zturnlibs/ztron-api/global-shortcut";
```

# Permissions & Scope

global-shortcut consists of **framework built-in commands**: the 5
`plugin:global-shortcut|*` commands are registered into the permission
table with the other built-in commands and granted by the
`core:default` set. No plugin construction, no scope.

# Example

Register/unregister round trip (actually pressing the hotkey is manual;
the spike verifies the command path). From
`examples/hello/frontend/src/main.ts` (the anchor `SHORTCUT_OK` is its
real run output):

```ts
// 10. global shortcut (register/unregister resolves; pressing is manual).
// Ran last so Carbon's Register/UnregisterEventHotKey cannot disturb the
// window focus transition exercised by WIN_EVENT_OK above.
const regOk = await registerShortcut("spike-toggle", "Cmd+Shift+K");
const unregOk = await unregisterShortcut("spike-toggle");
if (regOk && unregOk) report("SHORTCUT_OK");
```

The `isRegistered` state-query round trip (P22; the anchor
`SHORTCUT_ISREG_OK` is its real run output; comments kept, excerpts
elided):

```ts
const reg2 = await registerShortcut("spike-isreg", "Cmd+Shift+J");
const isRegA = await isRegistered("spike-isreg");
const unreg2 = await unregisterShortcut("spike-isreg");
const isRegB = await isRegistered("spike-isreg");
if (reg2 && isRegA && unreg2 && !isRegB) {
  report("SHORTCUT_ISREG_OK");
}
```

Activation listening: `onShortcut((e) => e.shortcutId)`
(`ztron://global-shortcut`, payload is the registered id); batch
registration `registerAll([{ id, accelerator }])` returns per-entry
success flags in order; `unregisterAll()` unregisters every hotkey
registered by this process. Accelerators look like `Cmd+Shift+K`,
`Ctrl+Alt+1`, `F5`.

# Commands

`plugin:global-shortcut|*` totals **5 commands**, mapped one-to-one to
the API:

| Command | API |
| --- | --- |
| `register` / `unregister` | `registerShortcut` / `unregisterShortcut` |
| `register_all` / `unregister_all` | `registerAll` / `unregisterAll` |
| `is_registered` | `isRegistered` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/global-shortcut).

Applicable version: `ztron 0.3.1`
