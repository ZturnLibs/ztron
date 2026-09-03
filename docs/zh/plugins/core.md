---
title: 核心 IPC（core）
---

# 概述

`core` 模块是 Ztron 前端传输层的地基：`invoke` 调用后端命令、
`Channel` 接收有序流式消息、`Resource` 包装 host 资源表句柄，另有
自定义命令监听、资产 URL 转换等基础工具。它是对
`@tauri-apps/api/core` 到 Ztron 传输契约的翻译。调用模型总览见
[调用后端命令](/guide/ipc)。

```ts
import { invoke, Channel, convertFileSrc } from "@zturnlibs/ztron-api/core";
// 主入口同样再导出这些符号
```

- `invoke<T>(cmd, args?, options?)`：向后端发送一条消息，resolve 为
  后端响应。
- `Channel<T>`：流式消息通道。消息携带单调递增 index 并按序投递，
  乱序消息排队等候补齐；`new Channel(onmessage)` 后作为命令参数
  传入，后端经 `ctx.getChannel(id)` 推送。序列化为
  `__CHANNEL__:<id>`。
- `Resource`：host 资源表中的后端资源基类（`rid` 只读），
  `close()` 走 `plugin:resources|close` 显式释放。
- `addPluginListener(plugin, event, cb)`：插件监听契约
  （`plugin:<p>|__listener` / `__unlistener`）——事件名不能含 `|`
  的插件（如 log）用它代替命名事件；返回取消监听函数。
- `convertFileSrc(filePath, protocol?)`：把设备文件路径转换为
  WebView 可加载的 URL（自定义协议，缺省由引导选择 `ztron://`）。
- `isZtron()`：当前上下文是否为 Ztron WebView。
- `transformCallback(cb, once?)`：注册回调并返回后端可回调的
  标识符（`Channel` 与事件系统的基础设施）。
- `SERIALIZE_TO_IPC_FN`：特殊类型自定义 IPC 序列化的键。

# 权限与 Scope

ACL（默认全拒）只约束 `plugin:` 前缀的命令：内建命令由
**`core:default`** 统一授权，插件命令由各自的权限串（如
`fs:allow-read-file`）授权；应用自定义命令（`my:greet`、`m3:*` 等
非 `plugin:` 前缀）不经 ACL 门禁。模型详见
[安全模型](/guide/security)。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（验证锚点 `INVOKE_OK`、
`CHANNEL_OK:1,2,3`、`CONVERT_FILE_SRC_OK`）：

```ts
import { invoke, Channel, convertFileSrc } from "@zturnlibs/ztron-api";

const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });

// 流式：后端对同一通道 send 三次后 end
const ch = new Channel<{ n: number }>((msg) => console.log(msg.n));
await invoke("m3:stream", { ch });          // 1,2,3 依次到达

// 自定义协议加载本地文件（ztron:// 页面内）
imgEl.src = convertFileSrc(`${temp}/icon.png`);
```

# 命令一览

`core` 自身只注册 1 条资源释放命令：`plugin:resources|close`（由
`Resource.close()` 使用）。完整清单见
[命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
