---
title: 路径（path）
---

# 概述

`path` 模块提供路径工具：字符串运算（join/resolve/normalize/…）、
30 余个系统与应用目录 getter、打包资源解析与 Tauri v2 的
`BaseDirectory` 名称表，是 `@tauri-apps/api/path` 及 path 插件的移植。

```ts
import { join, homeDir, BaseDirectory } from "@zturnlibs/ztron-api/path";
// 或从主入口：import { path } from "@zturnlibs/ztron-api";  → path.join(...)
```

要点：

- 纯字符串运算，无 scope 约束。
- 目录 getter 中的 `appDataDir` / `appConfigDir` / `appCacheDir` /
  `appLocalDataDir` / `appLogDir` 遵循 appId 约定（由插件构造参数
  `appId` 决定）；`localDataDir` 是 `appLocalDataDir` 的 Tauri v2
  别名。
- `resolveResource(path)` 把打包资源相对路径解析到资源目录下（绝对
  路径原样通过）。
- `sep`（POSIX `/`）与 `delimiter`（POSIX `:`）为常量。
- `BaseDirectory` 收录上游 23 个名称（`Audio`…`Template`），可传给
  fs/path 函数的 `options.baseDir`；`resolveBaseDirectory(base)`
  把名称解析为绝对路径。

# 权限与 Scope

path 是一个真实插件（`pathPlugin({ appId: "com.ztron.hello" })`），
权限串命名空间为 **`path:`**：

| 权限串 | 授权内容 |
| --- | --- |
| `path:default` | 全部 32 条 `plugin:path\|*` 命令 |
| `path:allow-<命令连字符名>` | 单条命令（如 `path:allow-home-dir`） |

无 scope：路径运算不触碰文件系统，`pathPlugin` 也不接受 scope 参数。

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 的路径段落改写，省略
UI 上报；锚点 `PATH_APP_DIRS_OK` 为其真实运行输出）：

```ts
import { path } from "@zturnlibs/ztron-api";

const joined = await path.join("/a", "b", "c");   // "/a/b/c"
const [home, temp] = await Promise.all([path.homeDir(), path.tempDir()]);
const appData = await path.appDataDir();          // 含 "com.ztron.hello"
```

# 命令一览

`plugin:path|*` 共 **32 条**：字符串运算 7 条（`join`、`resolve`、
`normalize`、`is_absolute`、`basename`、`dirname`、`extname`），以及
`sep`、`home_dir`、`temp_dir`、`cwd` 与 21 个系统/应用目录 getter。
完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
