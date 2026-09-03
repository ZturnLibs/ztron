---
title: Webview（webview）
---

# Overview

The `webview` module exposes webview-layer controls for the web content
embedded in a window (print, background color, devtools, zoom, browsing
data clearing), ported from the part of `@tauri-apps/api/webview` that
fits Ztron's one-webview-per-window architecture. A `Webview` is a
handle constructed by label.

```ts
import { Webview, getAllWebviews } from "@zturnlibs/ztron-api/webview";
```

The backend currently holds one webview per window (window and webview
share the same WKWebView/WebView2 instance), so `Webview`
position/size/visibility operations are congruent with the owning
window; same-window multi-webview, reparent and autoResize are reported
as `false` by `Webview.capabilities()` instead of silently no-op'ing.

# Permissions & Scope

webview is a framework built-in: its `plugin:webview|*` commands are
granted by the **`core:default`** permission set in a capability;
`core:allow-webview_<cmd>` (e.g.
`core:allow-webview_clear_all_browsing_data`) grants single commands.
No scope.

# Example

From `examples/hello/frontend/src/main.ts` (verification anchor
`WEBVIEW_MODULE_OK:1`):

```ts
import { Webview, getAllWebviews } from "@zturnlibs/ztron-api";

const wv = Webview.getCurrent();          // label from the bootstrap metadata
await wv.clearAllBrowsingData();          // cookies/cache/storage/IndexedDB
const wvs = await getAllWebviews();       // live webview handles
const zoomed = await wv.setZoom(1);       // CSS zoom
void zoomed;
```

`toggleDevtools()` resolves `{ supported, platform, reason? }`: macOS
WKWebView has no public toggle, so the host reports
`supported: false` there (devtools are enabled in debug builds).

# Commands

`plugin:webview|*` totals **7 commands**: `get_all_webviews`,
`capabilities`, `create` (used by
[webview-window](/plugins/webview-window)), `clear_all_browsing_data`,
`print`, `set_background_color`, `toggle_devtools`. Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
