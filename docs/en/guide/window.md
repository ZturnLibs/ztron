---
title: Windows
---

Ztron supports two ways to create windows: declarative (configuration-driven,
applied as startup state by `AppBuilder.fromConfig` at app launch) and runtime
(created/destroyed programmatically via `WebviewWindow`).

## Declarative: windows[] in ztron.conf.json

A dual-window config from `examples/hello/ztron.conf.json` — the main window
loads the Vite frontend via the `url: "frontend"` placeholder, while the
conf-second window inlines HTML directly:

```json
{
  "windows": [
    {
      "label": "main",
      "title": "Ztron M3",
      "width": 900,
      "height": 640,
      "minWidth": 400,
      "minHeight": 300,
      "url": "frontend",
      "titleBarStyle": "visible",
      "resizable": true
    },
    {
      "label": "conf-second",
      "title": "From Config",
      "width": 360,
      "height": 240,
      "html": "<p style=\"font-family:system-ui\">declared in ztron.conf.json</p>",
      "resizable": false,
      "alwaysOnTop": true,
      "x": 120,
      "y": 120
    }
  ]
}
```

The fields align with Tauri's `WindowConfig` startup state; `url: "frontend"`
resolves to the dev server / build output in the dev flow, any other string
loads as an absolute URL, and omitting it falls back to inline HTML.
Verification anchor: `CONF_WINDOW_OK:From Config` (P14).

## Runtime: WebviewWindow

`@zturnlibs/ztron-api` provides the `WebviewWindow` class for creating and
destroying windows while the app runs (the multiwin example uses it for a
10x create/destroy stress test). Runtime-created windows likewise enter the
host's webview registry, with label routing, per-window events, and registry
cleanup on close. Verification anchors:

- `SECOND_WINDOW_OK label=second` — the hello example really created and
  destroyed a runtime window during the run (P9)
- `MULTI_WINDOW_OK` (P6) — multi-window architecture: host webview registry
  + label routing + `WebviewWindow`

## Window Capability Overview

Window state (size/position/min-size constraints/minimizable, etc.),
opacity, transparency, decoration, `titleBarStyle`, dock progress/badge,
`setTheme`, monitor queries (`availableMonitors` etc.), and all 13 window
events are available (see [Events & Channel](/guide/events)); key
verification anchors: `WIN_STATE_OK`, `WIN_EVENT_OK`, `WIN_V2_EXTRAS_OK`,
`MONITORS_OK`.

## Platform Boundary Note

Runtime multi-window creation is unlocked on macOS, but the webview library
has a history of blocking second-webview creation in the run loop; the fix
(including a lib patch for an engine-destruction UAF) is recorded in
`DESIGN.md` §75.

适用版本：`ztron 0.1.0`
