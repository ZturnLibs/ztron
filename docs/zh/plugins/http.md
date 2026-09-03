---
title: HTTP 客户端（http）
---

# 概述

`http` 模块提供**作用域约束的 HTTP 客户端**：每个请求在派发前都会按应用
配置的 HttpScope 对 URL 做白名单匹配，越界即抛出。两个入口——`fetch()`
（整体响应，支持 `responseType: "text" | "json" | "binary"` 与
`timeoutMs`）与 `fetchStream()`（流式响应：status + headers 一到即 resolve，
body 按 chunk 经 Channel 推入 `ReadableStream<Uint8Array>`，应用无需缓冲
整个响应）。全部由 `plugin:http|fetch` 一条命令支撑（对齐
`@tauri-apps/plugin-http`）。

```ts
import { http, fetch, fetchStream } from "@zturnlibs/ztron-api/http";
// 或从主入口：import { http, fetchStream } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

单条命令一条权限：`http:allow-fetch`（配对 `http:deny-fetch` 可显式
拒绝），权限集 **`http:default`** 即授予 fetch。

Scope 来自插件构造：`httpPlugin({ scope })`，`allow` 数组按 `url` glob
匹配。摘自 `examples/hello/src/main.ts`：

```ts
.plugin(
  httpPlugin({
    scope: {
      allow: [
        { url: "https://api.github.com/*" },
        { url: "http://localhost:*/*" },
      ],
    },
  }),
)
```

越界 URL（如 `https://evil.example.com/steal`）会被后端以
"scope denied" 拒绝——hello 前端对此有专门断言（`HTTP_SCOPE_DENY_OK`）。

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 的 5b / 15 两段改写；
锚点 `HTTP_OK`、`HTTP_SCOPE_DENY_OK`、`HTTP_STREAM_OK:6c/head1ms/total277ms`
为其真实运行输出）：

```ts
// 普通 fetch：本地 echo 服务（scope 允许 http://localhost:*/*）
const resp = await http.fetch(`http://localhost:${port}/echo`);
if (resp.ok && resp.status === 200) report("HTTP_OK:" + resp.status);

// 流式 fetch：invoke 在 headers 到达时即 resolve；body chunk 经 Channel
// 逐步推送（/stream 端点以 45ms 间隔输出 6 个 chunk，可证明渐进到达）
const sres = await fetchStream(streamUrl);
const reader = sres.body.getReader();
const parts: string[] = [];
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  parts.push(new TextDecoder().decode(value));
}
```

`timeoutMs` 走后端 `AbortSignal.timeout`（P19）；`responseType: "binary"`
时响应带 `binary?: Uint8Array`，`"json"` 时带 `json?: unknown`；请求体可传
字符串、`Uint8Array`/`ArrayBuffer`（base64 上线）或普通对象（自动 JSON
序列化并附 content-type）。

# 命令一览

`plugin:http|*` 共 **1 条**：

| 命令 | API |
| --- | --- |
| `fetch` | `fetch()`（整体响应）与 `fetchStream()`（传 Channel 即流式） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/http)。

适用版本：`ztron 0.3.0`
