---
title: DPI（dpi）
---

# Overview

The `dpi` module provides DPI-aware geometry types: logical pixels
scale with the window's DPI factor (the CSS/browser unit), physical
pixels are real device pixels. It is a port of `@tauri-apps/api/dpi`,
consumed by window geometry methods (`setSize`/`setPosition`/
`setBounds`/`setMinSize`…) to accept unit-carrying arguments.

```ts
import { LogicalSize, PhysicalPosition } from "@zturnlibs/ztron-api/dpi";
```

Types at a glance:

- `LogicalSize` / `PhysicalSize`: `{ width, height }`, converted via
  `toPhysical(scaleFactor)` / `toLogical(scaleFactor)`.
- `LogicalPosition` / `PhysicalPosition`: `{ x, y }`, same conversions.
- `Size` / `Position`: upstream wrapper classes resolving to logical or
  physical based on the source (an instance or a plain object with a
  `type` field).
- `SizeLike` / `PositionLike`: what geometry methods actually accept —
  a single number, a dpi instance, or a plain `{ width, height }` /
  `{ x, y }` object.
- `normalizeSize` / `normalizePosition`: normalize any of the shapes
  above into the wire protocol's plain `{ width, height }` /
  `{ x, y }`.

The Ztron wire protocol serializes both kinds as plain objects; the
logical/physical distinction matters only on the frontend side
(`toJSON()` outputs the plain shape).

# Permissions & Scope

dpi is a **pure frontend type module**: it issues no `plugin:*` calls,
so no capability permissions and no scope are involved. Authorization
of the geometry commands (`plugin:window|set_size` etc.) is covered in
[Window](/plugins/window).

# Example

Example (adapted from the window sections of the hello example) —
`setSize` / `setPosition` accept number pairs as well as dpi instances;
`setMinSize` / `setMaxSize` take a **single** `SizeLike` argument:

```ts
import { LogicalSize, Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setSize(800, 600);                        // number pair (width, height?)
await win.setPosition(80, 90);                      // number pair (x, y?)
await win.setSize(new LogicalSize(800, 600));       // dpi instance, equivalent

// setMinSize / setMaxSize(size: SizeLike | null): with a number the second
// argument is ignored (normalizeSize(a) yields height 0) — use a dpi
// instance or a plain object instead
await win.setMinSize(new LogicalSize(300, 200));    // dpi instance
await win.setMinSize({ width: 300, height: 200 });  // or a plain object
await win.setSizeConstraints({ minWidth: 320, minHeight: 240 });
```

# Commands

None (pure frontend module).

Applicable version: `ztron 0.3.0`
