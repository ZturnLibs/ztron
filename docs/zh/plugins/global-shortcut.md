---
title: 全局快捷键（global-shortcut）
---

# 概述

`global-shortcut` 模块注册**应用未聚焦也能触发**的全局热键。它是
Tauri 的 `tauri-plugin-global-shortcut` 的移植，由内建的
`plugin:global-shortcut|*` 命令和 `ztron://global-shortcut` 事件支撑
（macOS 侧走 Carbon 的 Register/UnregisterEventHotKey）。注册返回
布尔值——OS 是否接受了这次注册（快捷键被其他应用占用时为 false），
而不是注册即成功。

```ts
import { registerShortcut, unregisterShortcut, registerAll, unregisterAll, isRegistered, onShortcut, globalShortcut } from "@zturnlibs/ztron-api/global-shortcut";
```

# 权限与 Scope

global-shortcut 属于**框架内建命令**：`plugin:global-shortcut|*` 的
5 条命令随内建命令注册进权限表，由 `core:default` 集统一授予。
不需要插件构造、没有 scope。

# 示例

注册/注销往返（按下热键本身是手动行为，spike 只验证命令链路）。
摘自 `examples/hello/frontend/src/main.ts`（锚点 `SHORTCUT_OK` 为其
真实运行输出）：

```ts
// 10. global shortcut (register/unregister resolves; pressing is manual).
// Ran last so Carbon's Register/UnregisterEventHotKey cannot disturb the
// window focus transition exercised by WIN_EVENT_OK above.
const regOk = await registerShortcut("spike-toggle", "Cmd+Shift+K");
const unregOk = await unregisterShortcut("spike-toggle");
if (regOk && unregOk) report("SHORTCUT_OK");
```

`isRegistered` 状态查询往返（P22；锚点 `SHORTCUT_ISREG_OK` 为其真实
运行输出，注释保留、有删节）：

```ts
const reg2 = await registerShortcut("spike-isreg", "Cmd+Shift+J");
const isRegA = await isRegistered("spike-isreg");
const unreg2 = await unregisterShortcut("spike-isreg");
const isRegB = await isRegistered("spike-isreg");
if (reg2 && isRegA && unreg2 && !isRegB) {
  report("SHORTCUT_ISREG_OK");
}
```

触发监听：`onShortcut((e) => e.shortcutId)`（`ztron://global-shortcut`
事件，负载是注册时的 id）；批量注册 `registerAll([{ id, accelerator }])`
按序返回每条的成功标志；`unregisterAll()` 注销本进程注册的全部热键。
accelerator 形如 `Cmd+Shift+K`、`Ctrl+Alt+1`、`F5`。

# 命令一览

`plugin:global-shortcut|*` 共 **5 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `register` / `unregister` | `registerShortcut` / `unregisterShortcut` |
| `register_all` / `unregister_all` | `registerAll` / `unregisterAll` |
| `is_registered` | `isRegistered` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/global-shortcut)。

适用版本：`ztron 0.3.0`
