---
title: 事件与 Channel
---

事件系统让后端与前端双向通信：前端可以监听后端发出的任意命名事件，
也可以向前端/其他窗口定向发送。监听器注册表位于后端的 `EventManager`，
API 由 `@zturnlibs/ztron-api` 的 `event` 模块提供。

## listen / once / emit / emitTo

真实签名（摘自 `packages/api/src/event.ts`）：

```ts
export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options,
): Promise<UnlistenFn>;

export type UnlistenFn = () => Promise<void>;
```

典型用法：

```ts
import { listen, once, emit, emitTo } from "@zturnlibs/ztron-api";

// 监听（options.target 可指定窗口 label，默认 { kind: "Any" }）
const unlisten = await listen<{ n: number }>("m3:tick", (e) => {
  console.log(e.payload.n); // e: { event, id, payload }
});
await unlisten(); // 不再需要时取消监听

// 只触发一次，触发后自动取消
await once("app:ready", () => console.log("ready"));

// 向后端发事件（后端会扇出给所有监听者）
await emit("frontend:poke", { at: Date.now() });

// 定向发送到指定窗口
await emitTo("main", "broadcast:x", { v: 1 });
```

## 窗口事件名

`packages/api/src/window.ts` 的 `WindowEventName` 完整列表（原样）：

```ts
export type WindowEventName =
  | "resize"
  | "move"
  | "focus"
  | "blur"
  | "close-requested"
  | "suspended"
  | "resumed"
  | "scale-change"
  | "theme-changed"
  | "drag-enter"
  | "drag-over"
  | "drag-drop"
  | "drag-leave";
```

其中 `suspended`/`resumed` 是为移动端生命周期保留的名字，桌面 host
不会触发；`drag-*` 四项对应文件拖放（`ztron://drag-enter/over/drop/leave`）。
`event.ts` 还导出了 `ZtronEvent` 常量枚举（上游 `TauriEvent` 的对应物；
如 `ZtronEvent.WINDOW_RESIZED = "ztron://resize"`），窗口实例上也提供
`onResized`/`onMoved`/`onScaleChanged`/`onThemeChanged`/`onDragDropEvent`
等便捷方法。

## Channel：流式数据

一次性 `invoke` 只能返回单值；需要后端持续推送时，在命令参数里传入
`{ kind: "channel", id }`，后端经 `ctx.getChannel(id)` 拿到句柄后
`handle.send(...)` 多次推送、`handle.end()` 收尾——hello 示例的
`m3:stream` 命令即此模式（`M1_EVENTS_CHANNEL_WINDOW_OK` 已验证）。

## 插件监听器

插件侧还有一条 `plugin:*|__listener` 契约（如 log 插件把日志推给
webview 目标），P2 的插件页会展开。

适用版本：`ztron 0.3.1`
