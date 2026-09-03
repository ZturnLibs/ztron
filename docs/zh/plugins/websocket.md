---
title: WebSocket（websocket）
---

# 概述

`websocket` 模块提供后端代理的 WebSocket 连接：`connect(url)` 建连并返回
连接 id，`sendMessage(id, message)` 发送文本帧，`disconnect(id)` 断开；
到达的消息与连接状态变化分别经 `ztron://websocket-message` 与
`ztron://websocket-status` 事件推送，`onMessage` / `onStatus` 返回取消
监听函数。由 `plugin:websocket|*` 三条命令支撑（对齐
`tauri-plugin-websocket`）。

```ts
import { websocket, connect } from "@zturnlibs/ztron-api/websocket";
// 或从主入口：import { websocket, connect } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`websocket:allow-connect`、`websocket:allow-send`、
`websocket:allow-disconnect`，权限集 **`websocket:default`** 一次性授予
三条命令。无 scope 约束——插件零参构造。摘自
`examples/hello/src/main.ts`：

```ts
.plugin(websocketPlugin())
```

capability 中对应条目为 `"websocket:default"`。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（锚点 `WEBSOCKET_OK` 为其真实
运行输出；对公共 echo 服务器做往返，注释保留、有删节）：

```ts
// 1d. websocket (public echo server round trip)
const echo = new Promise<string>((resolve) => {
  void websocket.onMessage((e) => resolve(e.message));
});
const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
await websocket.sendMessage(id, "ws-echo-test");
const echoed = await Promise.race([
  echo,
  new Promise<string | null>((r) => setTimeout(() => r(null), 8000)),
]);
await websocket.disconnect(id);
if (echoed && echoed.includes("ws-echo-test")) {
  report("WEBSOCKET_OK:" + String(echoed).slice(0, 24));
}
```

`onMessage` 的回调负载为 `{ id, message }`（多连接共享一条事件流时按
`id` 区分）；`onStatus` 的负载为 `{ id, state }`。

# 命令一览

`plugin:websocket|*` 共 **3 条**：

| 命令 | API |
| --- | --- |
| `connect` | `connect(url)` → `{ id }` |
| `send` | `sendMessage(id, message)` |
| `disconnect` | `disconnect(id)` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/websocket)。

适用版本：`ztron 0.3.0`
