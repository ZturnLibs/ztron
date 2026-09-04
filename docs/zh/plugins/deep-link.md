---
title: 深层链接（deep-link）
---

# 概述

`deep-link` 模块处理**自定义 URL scheme 深链**（
`tauri-plugin-deep-link` 的移植）：外部以 `ztron://...` URL 打开应用
时，运行中的页面能收到完整 URL，应用也能查询最近一次的 URL。

与大多数插件不同，`plugin:deep-link|get_last_url` 是**框架内建
命令**（注册在 `registerBuiltinCommands` 里）：宿主 adapter 捕获
系统的深链打开事件 → App 发出 `ztron://deep-link` 事件。API 两个
函数：`getCurrentUrl()`（最近一次 URL，正常启动时为 `null`）与
`onDeepLink(handler)`（订阅运行期间打开的深链，handler 收完整
URL）。

```ts
import { deepLink, getCurrentUrl, onDeepLink } from "@zturnlibs/ztron-api/deep-link";
```

# 权限与 Scope

`plugin:deep-link|get_last_url` 随内建命令注册进权限表，由
`core:default` 集统一授予（没有独立的 `deep-link:*` 权限串）；
`onDeepLink` 依赖的事件监听命令同属 `core:default`。不需要插件
构造、没有 scope。

真机路由的前提：**打包后的 `.app`** 需在 `CFBundleURLTypes` 注册
scheme。开发期裸二进制无法向 OS 认领 scheme——hello 如实只验证
管道，见下。

# 示例

**尽早注册监听**是 deep-link 的关键用法：这样无论外部 URL 在运行
的哪个时点打开都能被捕获。摘自
`examples/hello/frontend/src/main.ts`（锚点 `DEEP_LINK_EVENT` 为其
真实运行输出约定，注释保留）：

```ts
// Register the deep-link listener early so an externally-opened ztron://
// URL (packaged .app, registered via CFBundleURLTypes) is captured at any
// point during the run.
await onDeepLink((url) => {
  if (url.includes("spike")) report("DEEP_LINK_EVENT:" + url);
});
```

管道验证（`get_last_url` 正常启动时为 `null`）。摘自同文件（锚点
`DEEP_LINK_OK` 为其真实运行输出，注释保留、有删节）：

```ts
// 12. deep-link: command plumbing. OS routing of ztron:// needs a bundle
// registered with CFBundleURLTypes (the packaged .app); ...
const lastUrl = await invoke<string | null>(
  "plugin:deep-link|get_last_url",
  {},
);
if (lastUrl === null) {
  report("DEEP_LINK_OK");
}
```

# 命令一览

`plugin:deep-link|*` 共 **1 条**：

| 命令 | API |
| --- | --- |
| `get_last_url` | `getCurrentUrl`（`deepLink.getCurrentUrl`） |

事件面：`ztron://deep-link` ← `onDeepLink`（`deepLink.onDeepLink`）。

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/deep-link)。

适用版本：`ztron 0.3.1`
