---
title: Event（event）
---

# Overview

The `event` module is the frontend entry of the two-way event system:
listen to any named event the backend emits and emit events to the
frontend or other windows. The listener registry lives in the backend
`EventManager`; the module is a port of `@tauri-apps/api/event` to
Ztron's two-process model. See the [Events & Channel
guide](/guide/events) for the overview; this page is the command-level
reference.

```ts
import { listen, once, emit, emitTo } from "@zturnlibs/ztron-api/event";
```

Core signature: `listen<T>(event, handler, options?)` resolves to an
`UnlistenFn` (call it when the listener goes out of scope); the
`Event<T>` payload looks like `{ event, id, payload }`. `options.target`
takes a window label string (mapped to `{ kind: "AnyLabel", label }`) or
a full `EventTarget` (`Any` / `AnyLabel` / `App` / `Window` / `Webview`
/ `WebviewWindow`, the latter four carrying a label), defaulting to
`{ kind: "Any" }`.

The module also exports the `ZtronEvent` constant enum (the counterpart
of upstream `TauriEvent`, e.g. `ZtronEvent.WINDOW_RESIZED =
"ztron://resize"`; it includes the mobile-lifecycle reserved names
`WINDOW_SUSPENDED`/`WINDOW_RESUMED` and the `DRAG_*` file drag-drop
event names).

# Permissions & Scope

event is a framework built-in: its `plugin:event|*` commands are granted
by the **`core:default`** permission set in a capability; individual
`core:allow-event_<cmd>` permissions (e.g. `core:allow-event_listen`)
grant single commands. No scope.

# Example

Example (adapted from `examples/hello/frontend/src/main.ts`; the anchors
`EVENT_OK`, `WIN_EVENT_OK` are its real run outputs):

```ts
import { listen } from "@zturnlibs/ztron-api";

// the backend app.emit("m3:tick", { n }) fans out to all listeners
await listen<{ n: number }>("m3:tick", (e) => {
  console.log(e.payload.n);
});

// listen on one window only (target may be a label string)
await listen("ztron://focus", fireWinEvent, { target: "main" });
```

The window instance also offers convenience wrappers: `win.onResized` /
`onMoved` / `onFocusChanged` / `onScaleChanged` / `onThemeChanged` /
`onDragDropEvent` / `onCloseRequested` (see
[Window](/plugins/window)).

# Commands

`plugin:event|*` totals **4 commands**: `listen`, `unlisten`, `emit`,
`emit_to`. Full list in the [Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
