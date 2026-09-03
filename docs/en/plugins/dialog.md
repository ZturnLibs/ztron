---
title: Native dialogs (dialog)
---

# Overview

The `dialog` module provides **native modal dialogs**: file/directory
picking (`open`), a save path (`save`), and the message trio
(`message`/`ask`/`confirm`). It is a port of
`@tauri-apps/plugin-dialog`, backed by the built-in `plugin:dialog|*`
commands, implemented host-side on NSOpenPanel/NSSavePanel/NSAlert.
Dialogs are modal and require user interaction before they return.

```ts
import { open, save, message, ask, confirm, dialog } from "@zturnlibs/ztron-api/dialog";
```

# Permissions & Scope

dialog consists of **framework built-in commands**: the five
`plugin:dialog|*` commands are registered into the permission table at
startup under the "one allow per built-in command" scheme and granted
collectively by the `core:default` set (individual `core:allow-<cmd>`
entries also work in a capability). No plugin construction is needed,
there is no scope, and the capability needs no extra entries (the hello
example's `core:default` already covers it — see
`examples/hello/capabilities/main.json`).

# Example

Modal panels cannot be clicked from an automated spike, so the hello
frontend verifies the commands at **registration level** only. From
`examples/hello/frontend/src/main.ts` (the anchor `DIALOG_REG_OK` is
its real run output; covered through `ask`/`confirm` since P27):

```ts
// 9. native dialogs (commands registered; modal interaction is manual)
const hasDialogs = await invoke<boolean>("m3:has-dialogs");
if (hasDialogs) report("DIALOG_REG_OK");
```

API usage example (adapted from the signatures in
`packages/api/src/dialog.ts`) — note that `open` returns an **array**
when `maxFiles > 1` (or `multiple: true`) and `null` on cancel;
`ask`/`confirm` resolve booleans, and `message` returns the index of
the clicked button:

```ts
import { open, save, ask, message } from "@zturnlibs/ztron-api/dialog";

const file = await open({
  title: "Pick an image",
  filters: ["png", "jpg"],          // allowed extensions
  canCreateDirectories: true,
});
const dir = await open({ directory: true, multiple: true, maxFiles: 5 }); // string[] | null
const dest = await save({ title: "Save as", defaultName: "out.txt" });    // string | null

const ok = await ask("Delete this record?", { title: "Confirm", kind: "warning" }); // boolean
const btn = await message({ title: "Done", message: "Exported", kind: "info" });   // button index
```

# Commands

`plugin:dialog|*` totals **5 commands**, mapped one-to-one to the API:

| Command | API |
| --- | --- |
| `open` / `save` | `open` / `save` |
| `message` | `message` (returns the button index) |
| `ask` / `confirm` | `ask` / `confirm` (return booleans) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/dialog).

Applicable version: `ztron 0.3.0`
