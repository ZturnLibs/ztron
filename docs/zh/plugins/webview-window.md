---
title: 运行时窗口（webview-window）
---

# 概述

`webview-window` 模块提供运行时创建原生窗口的能力：`WebviewWindow`
继承 `Window` 的全部分析/控制方法，新增 `create()` 在应用运行中真实
创建第二个（及更多）窗口，是 `@tauri-apps/api/webviewWindow` 的移植。
运行时窗口同样进入 host 的 webview 注册表，具备 label 路由、per-window
事件与关闭时的注册表清理。

```ts
import { WebviewWindow } from "@zturnlibs/ztron-api/webviewWindow";
// 或从主入口：import { WebviewWindow, getCurrentWebviewWindow } from "@zturnlibs/ztron-api";
```

选项对象 `WebviewWindowOptions`：`title` / `width` / `height` /
`url` / `html`。声明式创建窗口（`ztron.conf.json` 的 `windows[]`，
由 `AppBuilder.fromConfig` 应用启动状态）见[窗口指南](/guide/window)。

# 权限与 Scope

webview-window 没有独立的插件命令：`create()` 复用内建的
`plugin:webview|create`，其余操作复用 `plugin:window|*`。二者均由
capability 中的 **`core:default`** 权限集授权，无 scope 约束。

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 改写：运行中创建 →
操作 → 销毁；锚点 `MULTI_WINDOW_OK`、`SECOND_WINDOW_OK label=second`
为其真实运行输出）：

```ts
import { WebviewWindow } from "@zturnlibs/ztron-api";

const second = new WebviewWindow("spike-second", {
  title: "Spike Second",
  width: 320,
  height: 200,
  html: "<p>second window</p>",
});
await second.create();               // 真实创建原生窗口 + webview
await second.setTitle("Spike Second 2");   // 继承自 Window 的全部方法
await second.isMinimizable();
await second.destroy();              // 销毁后主窗口操作不受影响
```

# 命令一览

本模块自身无专属命令：创建走 `plugin:webview|create`（7 条
`plugin:webview` 命令之一），窗口操作走 85 条 `plugin:window|*`。
完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.1`
