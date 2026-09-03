---
title: WebviewWindow（webview-window）
---

# Overview

The `webview-window` module creates native windows at runtime:
`WebviewWindow` extends `Window` with every query/control method and
adds `create()`, which really creates a second (and further) window
while the app runs — a port of `@tauri-apps/api/webviewWindow`.
Runtime windows enter the host webview registry like any other, with
label routing, per-window events and registry cleanup on close.

```ts
import { WebviewWindow } from "@zturnlibs/ztron-api/webviewWindow";
// or from the main entry: import { WebviewWindow, getCurrentWebviewWindow } from "@zturnlibs/ztron-api";
```

The options object `WebviewWindowOptions`: `title` / `width` /
`height` / `url` / `html`. For declarative creation (`windows[]` in
`ztron.conf.json`, startup states applied by `AppBuilder.fromConfig`)
see the [Windows guide](/guide/window).

# Permissions & Scope

webview-window has no plugin commands of its own: `create()` reuses the
built-in `plugin:webview|create`, other operations reuse
`plugin:window|*`. Both are granted by the **`core:default`** permission
set in a capability; no scope.

# Example

From `examples/hello/frontend/src/main.ts` (create → operate → destroy
mid-run; verification anchors `MULTI_WINDOW_OK`,
`SECOND_WINDOW_OK label=second`):

```ts
import { WebviewWindow } from "@zturnlibs/ztron-api";

const second = new WebviewWindow("spike-second", {
  title: "Spike Second",
  width: 320,
  height: 200,
  html: "<p>second window</p>",
});
await second.create();               // really creates the native window + webview
await second.setTitle("Spike Second 2");   // every method inherited from Window
await second.isMinimizable();
await second.destroy();              // main-window ops keep working afterwards
```

# Commands

No dedicated commands: creation goes through `plugin:webview|create`
(one of the 7 `plugin:webview` commands), window operations through the
85 `plugin:window|*`. Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
