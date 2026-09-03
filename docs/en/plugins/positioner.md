---
title: Positioner (positioner)
---

# Overview

The `positioner` module reads and writes the **current window's**
position and size — a port of Tauri's `tauri-plugin-positioner` that
lands directly on the `plugin:window|*` commands: `getPosition` /
`setPosition` handle the window's top-left corner, `getFrame` fetches
`{ x, y, width, height }` in one call, and `getSize` derives
`{ width, height }` from the frame (returning `{ width: 0, height: 0 }`
when the frame is unavailable).

```ts
import { getPosition, setPosition, getSize, getFrame, positioner } from "@zturnlibs/ztron-api/positioner";
```

# Permissions & Scope

positioner is a **pure frontend convenience module**: it has no
commands of its own, no plugin construction and no scope — every call
reuses window commands (`plugin:window|get_position` / `set_position` /
`get_frame`), which are registered with the framework's built-in
permissions and granted by the `core:default` set (see
[Window](/plugins/window)).

# Example

A setPosition → getPosition round trip (±3px tolerance; the window
system may have a minimum move granularity). From
`examples/hello/frontend/src/main.ts` (the anchor `POSITIONER_OK` is
its real run output):

```ts
// 6b. positioner (setPosition/getPosition round trip)
await setPosition(120, 140);
const pos = await getPosition();
if (pos && Math.abs(pos.x - 120) <= 3 && Math.abs(pos.y - 140) <= 3) {
  report("POSITIONER_OK:" + pos.x + "," + pos.y);
}
```

Combined with [Window state](/plugins/window-state) it makes a
"save → move → restore" geometry round trip (the hello spike's 6c
section uses `setPosition` to produce the move).

# Commands

No dedicated commands (reuses `plugin:window|get_position` /
`set_position` / `get_frame`; authorization in
[Window](/plugins/window)).

| Reused command | API |
| --- | --- |
| `plugin:window|get_position` | `getPosition()` |
| `plugin:window|set_position` | `setPosition(x, y)` |
| `plugin:window|get_frame` | `getFrame()` (`getSize()` is built on it) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/positioner).

Applicable version: `ztron 0.3.0`
