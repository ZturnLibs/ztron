---
title: Window（window）
---

# Overview

The `window` module controls and queries native windows: the `Window`
class (operates any live window by label), subscription helpers for the
13 window events, monitor queries and drag-region utilities — a port of
`@tauri-apps/api/window`. Every method is backed by the built-in
`plugin:window|*` commands.

```ts
import { Window } from "@zturnlibs/ztron-api/window";
// or from the main entry: import { Window, getAllWindows } from "@zturnlibs/ztron-api";
```

For the narrative (the two ways to create windows: declarative config
vs runtime creation) see the [Windows guide](/guide/window); this page
is the command-level reference for the module.

# Permissions & Scope

window is a framework built-in (not constructed as a separate plugin):
all of its `plugin:window|*` commands are granted by the
**`core:default`** permission set in a capability; individual
`core:allow-window_<underscored_cmd>` permissions (e.g.
`core:allow-window_set_title`) grant single commands. No scope.

From `examples/hello/capabilities/main.json`:

```json
{
  "permissions": ["core:default"]
}
```

# Example

From `examples/hello/frontend/src/main.ts` (verification anchors
`WIN_STATE_OK`, `TITLE_OK`, `MONITORS_OK`):

```ts
import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTitle("Ztron Spike");
const title = await win.getTitle();          // "Ztron Spike"
await win.setAlwaysOnTop(true);
await win.setOpacity(0.5);
await win.center();
const st = await win.getState();             // { maximized, fullscreen, alwaysOnTop, ... }

// Event subscription (per-instance helpers; see the 13 window events)
const un = await win.onFocusChanged((focused) => console.log(focused));

// Monitors (real NSScreen data)
const monitors = await availableMonitors();
const cur = await currentMonitor();          // { name, position, size, workArea, scaleFactor }
```

Frameless-window dragging: add a `data-tauri-drag-region` attribute to
an element and call `setupDragRegion()` once per page; a mousedown then
triggers the native `startDragging()`.

# Commands

`plugin:window|*` totals **85 commands**, covering titles, size,
position, state flags, button flags, cursor, theme, badges, effects,
events and more. Full list in the [Commands
Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
