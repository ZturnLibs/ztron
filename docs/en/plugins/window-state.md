---
title: Window state (window-state)
---

# Overview

The `window-state` module persists the **current window's geometry** to
JSON and restores it at startup: position (x/y), size
(width/height), and the maximized/fullscreen/always-on-top flags. It
is a translation of Tauri's `tauri-plugin-window-state`, backed by the
`plugin:window-state|*` commands. Three commands: `get` (read the
persisted state, null when none), `save` (snapshot the current geometry
and return it), `restore` (re-apply the persisted state, no-op when
none).

```ts
import { getWindowState, saveWindowState, restoreWindowState, windowState } from "@zturnlibs/ztron-api/window-state";
```

# Permissions & Scope

window-state is a **standalone plugin** with a two-level permission
ladder:

| Permission set | Grants |
| --- | --- |
| `window-state:default` | `allow-get` + `allow-restore` (read + startup restore) |
| `window-state:write` | default + `allow-save` (write snapshots) |

From `examples/hello/capabilities/main.json`:
`"window-state:write"`.

Construction options: `windowStatePlugin({ file?, restoreOnStartup? })`
— `file` is the absolute path of the state JSON (default
`$TMP/ztron-window-state.json`); `restoreOnStartup` defaults to true
(the plugin auto-restores one tick after setup); the hello spike turns
it off to verify restore manually. From
`examples/hello/src/main.ts`:

```ts
.plugin(
  windowStatePlugin({
    file: `${tjs.tmpDir}/ztron_window_state_test.json`,
    restoreOnStartup: false,
  }),
)
```

The restore order matters (DESIGN §30): the webview library re-centers
the window on every `set_size`, so the host **applies the size first
and the position afterwards**, then re-applies
maximized/fullscreen/alwaysOnTop as needed.

# Example

A save → move → restore round trip. From
`examples/hello/frontend/src/main.ts` (the anchor
`WINDOW_STATE_PLUGIN_OK` is its real run output):

```ts
// 6c. window-state plugin (save -> move -> restore -> verify)
const savedState = await saveWindowState();
await setPosition(savedState.x + 40, savedState.y + 40);
await restoreWindowState();
const restoredPos = await getPosition();
if (
  restoredPos &&
  Math.abs(restoredPos.x - savedState.x) <= 3 &&
  Math.abs(restoredPos.y - savedState.y) <= 3
) {
  report("WINDOW_STATE_PLUGIN_OK:" + savedState.x + "," + savedState.y);
}
```

The `WindowState` shape: `{ x, y, width, height, maximized, fullscreen,
alwaysOnTop }`; `getWindowState()` / `restoreWindowState()` return
`null` when there is no state file. All three functions accept
`{ file }` to override the default path.

# Commands

`plugin:window-state|*` totals **3 commands**, mapped one-to-one to
the API:

| Command | API |
| --- | --- |
| `get` | `getWindowState(options?)` |
| `save` | `saveWindowState(options?)` |
| `restore` | `restoreWindowState(options?)` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/window-state).

Applicable version: `ztron 0.3.1`
