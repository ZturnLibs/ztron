---
title: 事件（event）
---

# 概述

`event` 模块是前后端双向事件系统的前端入口：监听后端发出的任意命名
事件、向前端/其他窗口定向发送。监听器注册表位于后端的
`EventManager`，是 `@tauri-apps/api/event` 面向 Ztron 两进程模型的
移植。系统概览见[事件与 Channel 指南](/guide/events)；本页是命令级
参考。

```ts
import { listen, once, emit, emitTo } from "@zturnlibs/ztron-api/event";
```

核心签名：`listen<T>(event, handler, options?)` resolve 为
`UnlistenFn`（监听器离开作用域时调用）；`Event<T>` 载荷形如
`{ event, id, payload }`。`options.target` 可传窗口 label 字符串
（映射为 `{ kind: "AnyLabel", label }`）或完整 `EventTarget`
（`Any` / `AnyLabel` / `App` / `Window` / `Webview` /
`WebviewWindow`，后四种带 label），缺省 `{ kind: "Any" }`。

模块另导出 `ZtronEvent` 常量枚举（上游 `TauriEvent` 的对应物，
如 `ZtronEvent.WINDOW_RESIZED = "ztron://resize"`；含
`WINDOW_SUSPENDED`/`WINDOW_RESUMED` 移动端生命周期保留名与
`DRAG_*` 文件拖放事件名）。

# 权限与 Scope

event 属于框架内建能力，其 `plugin:event|*` 命令由 capability 中的
**`core:default`** 权限集授权；细粒度可用
`core:allow-event_<命令名>`（如 `core:allow-event_listen`）。无
scope 约束。

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 改写；锚点 `EVENT_OK`、
`WIN_EVENT_OK` 为其真实运行输出）：

```ts
import { listen } from "@zturnlibs/ztron-api";

// 后端 app.emit("m3:tick", { n }) 扇出到所有监听者
await listen<{ n: number }>("m3:tick", (e) => {
  console.log(e.payload.n);
});

// 只监听指定窗口（target 可为 label 字符串）
await listen("ztron://focus", fireWinEvent, { target: "main" });
```

窗口实例上还有便捷封装：`win.onResized` / `onMoved` /
`onFocusChanged` / `onScaleChanged` / `onThemeChanged` /
`onDragDropEvent` / `onCloseRequested`（见
[窗口](/plugins/window)）。

# 命令一览

`plugin:event|*` 共 **4 条**：`listen`、`unlisten`、`emit`、
`emit_to`。完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.1`
