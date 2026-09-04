---
title: 本地源服务（localhost）
---

# 概述

`localhost` 插件把一个目录通过 `tjs.serve`（fetch 风格 handler）以
`http://localhost:<port>` 源提供静态文件服务——适合偏好 http 源而非
`ztron://` asset 协议的应用（对齐上游 `tauri-plugin-localhost`；内部差距
清单 E1）。文件访问被锚定在服务目录上的 PathScope 门控；`/` 回落到
`index.html`；内容类型覆盖常见 web 资源（缺省
`application/octet-stream`），响应带 CORS `*` 头，未命中返回 404。API 侧
三个方法 `start(port?)` / `stop()` / `status()`，统一 resolve
`LocalhostStatus`（`{ already?, running?, port, origin?, stopped? }`）。

```ts
import { localhost, start } from "@zturnlibs/ztron-api/localhost";
// 或从主入口：import { localhost, startLocalhost, stopLocalhost } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`localhost:allow-start`、`localhost:allow-stop`、
`localhost:allow-status`，权限集 **`localhost:default`**。

Scope 在插件构造时声明：`localhostPlugin({ dir?, port?, scope? })`——
`dir` 为服务目录（默认 cwd），PathScope 以该目录为锚（默认 allow
`dir/**` 与 `dir` 本身），可再叠加 `scope` 条目；并防御
`/..` 穿越。hello 示例未注册此插件；摘自
`examples/menuprobe/src/main.ts` 的注册方式：

```ts
const { localhostPlugin } = await import("@zturnlibs/ztron-core");
const lp = localhostPlugin({ dir: tjs.cwd });
```

# 示例

hello 前端未使用该模块；以下第一段为基于 API 签名的最小用法，第二段
摘自 `examples/menuprobe/src/main.ts`（锚点 `LOCALHOST_OK:<port>` 为其
真实运行输出，注释保留、有删节）：

```ts
// 前端 API 用法（签名级示例）
const st = await start();        // { already: false, port, origin: "http://localhost:<port>" }
const cur = await status();      // { running: true, port }
await stop();                    // { stopped: true }
```

```ts
// 后端插件直用（menuprobe）：真实 tjs.serve，fetch-handler 往返
const lp = localhostPlugin({ dir: tjs.cwd });
const started = (await lp.commands.start({})) as { port: number };
const resp = await fetch(`http://localhost:${started.port}/__miss__`);
await lp.commands.stop({});
console.log(
  resp.status === 404 ? `LOCALHOST_OK:${started.port}` : `LOCALHOST_FAIL:${resp.status}`,
);
```

# 命令一览

`plugin:localhost|*` 共 **3 条**：

| 命令 | API |
| --- | --- |
| `start` | `start(port?)`（已启动时返回 `{ already: true, ... }`） |
| `stop` | `stop()` |
| `status` | `status()` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/localhost)。

适用版本：`ztron 0.3.1`
