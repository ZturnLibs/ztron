---
title: 进程（process）
---

# 概述

`process` 模块提供两个进程级操作：退出应用与重启应用，是
`@tauri-apps/api/process` 的移植。模块导出独立函数 `exit` / `relaunch`
与聚合对象 `process`。

```ts
import { exit, relaunch } from "@zturnlibs/ztron-api";
// 注意：process 没有子路径导出，仅可从主入口导入
```

`exit(code = 0)` 以给定退出码终止应用；`relaunch()` 尽力重启：host
以分离方式 respawn 自身后当前进程退出（打包应用中由启动器拉起完整的
host + backend 对）。

# 权限与 Scope

process 属于框架内建能力，其 `plugin:process|*` 命令由 capability 中的
**`core:default`** 权限集授权；细粒度可用
`core:allow-process_<命令名>`（如 `core:allow-process_exit`）。无
scope 约束。

# 示例

`exit`/`relaunch` 一旦调用即终结当前进程，因此 hello 示例只验证命令
注册而不实际调用（示例首两行摘自
`examples/hello/frontend/src/main.ts`，验证锚点 `PROCESS_OK`；用法段为
示意代码）：

```ts
const hasProcess = await invoke<boolean>("m3:has-process", {});
if (hasProcess) report("PROCESS_OK");   // plugin:process|exit / relaunch 已注册

// 真实用法（自担风险）：
import { exit, relaunch } from "@zturnlibs/ztron-api";
await exit(0);
await relaunch();
```

# 命令一览

`plugin:process|*` 共 **2 条**：`exit`、`relaunch`。完整清单见
[命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
