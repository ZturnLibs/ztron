---
title: WebView（webview）
---

# 概述

`webview` 模块暴露窗口内嵌 Web 内容的 webview 层控制（打印、背景色、
开发者工具、缩放、浏览数据清理等），是 `@tauri-apps/api/webview` 中与
Ztron「一窗一 webview」架构相关的表面。`Webview` 按 label 构造句柄。

```ts
import { Webview, getAllWebviews } from "@zturnlibs/ztron-api/webview";
```

当前后端每个窗口持有一个 webview（窗口与 webview 共享同一
WKWebView/WebView2 实例），因此 `Webview` 的位置/尺寸/显隐等操作与
所属窗口一致；同窗多 webview、reparent、autoResize 等能力由
`Webview.capabilities()` 如实上报为 `false`，而非静默空操作。

# 权限与 Scope

webview 属于框架内建能力，其 `plugin:webview|*` 命令由 capability 中的
**`core:default`** 权限集授权；细粒度可用 `core:allow-webview_<命令名>`
（如 `core:allow-webview_clear_all_browsing_data`）。无 scope 约束。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（验证锚点
`WEBVIEW_MODULE_OK:1`）：

```ts
import { Webview, getAllWebviews } from "@zturnlibs/ztron-api";

const wv = Webview.getCurrent();          // label 来自引导元数据
await wv.clearAllBrowsingData();          // cookies/缓存/存储/IndexedDB
const all = await getAllWebviews();       // 存活 webview 句柄列表
await wv.setZoom(1);                      // CSS 缩放
```

`toggleDevtools()` 返回 `{ supported, platform, reason? }`：macOS
WKWebView 无公开切换接口，host 如实上报 `supported: false`（调试构建
默认启用检查器）。

# 命令一览

`plugin:webview|*` 共 **7 条**：`get_all_webviews`、`capabilities`、
`create`（供 [webview-window](/plugins/webview-window) 使用）、
`clear_all_browsing_data`、`print`、`set_background_color`、
`toggle_devtools`。完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
