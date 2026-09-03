---
title: 原生对话框（dialog）
---

# 概述

`dialog` 模块提供**原生模态对话框**：文件/目录选择（`open`）、保存路径
（`save`）与消息提示三件套（`message`/`ask`/`confirm`）。它是
`@tauri-apps/plugin-dialog` 的移植，由内建的 `plugin:dialog|*` 命令支撑，
由运行时后端落到 NSOpenPanel/NSSavePanel/NSAlert。对话框是模态的，
需要用户交互才会返回。

```ts
import { open, save, message, ask, confirm, dialog } from "@zturnlibs/ztron-api/dialog";
```

# 权限与 Scope

dialog 属于**框架内建命令**：`plugin:dialog|*` 五条命令在框架启动时随
"每条内建命令一个 allow"注册进权限表，并由 `core:default` 集统一授予
（也可在 capability 里单独引用 `core:allow-<cmd>`）。它不需要插件构造、
没有 scope，capability 里无需额外条目（hello 示例的 `core:default`
已覆盖，见 `examples/hello/capabilities/main.json`）。

# 示例

模态面板无法在自动 spike 里被点击，hello 前端只在**注册级**验证命令
存在。摘自 `examples/hello/frontend/src/main.ts`（锚点 `DIALOG_REG_OK`
为其真实运行输出；P27 起覆盖到 `ask`/`confirm`）：

```ts
// 9. native dialogs (commands registered; modal interaction is manual)
const hasDialogs = await invoke<boolean>("m3:has-dialogs");
if (hasDialogs) report("DIALOG_REG_OK");
```

API 用法示例（基于 `packages/api/src/dialog.ts` 的签名改写）——注意
`open` 在 `maxFiles > 1`（或 `multiple: true`）时返回**数组**，取消时
返回 `null`；`ask`/`confirm` resolve 布尔值，`message` 返回被点按钮的
索引：

```ts
import { open, save, ask, message } from "@zturnlibs/ztron-api/dialog";

const file = await open({
  title: "选择图片",
  filters: ["png", "jpg"],          // 允许的扩展名
  canCreateDirectories: true,
});
const dir = await open({ directory: true, multiple: true, maxFiles: 5 }); // string[] | null
const dest = await save({ title: "保存为", defaultName: "out.txt" });     // string | null

const ok = await ask("删除这条记录？", { title: "确认", kind: "warning" }); // boolean
const btn = await message({ title: "完成", message: "已导出", kind: "info" }); // 按钮索引
```

# 命令一览

`plugin:dialog|*` 共 **5 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `open` / `save` | `open` / `save` |
| `message` | `message`（返回按钮索引） |
| `ask` / `confirm` | `ask` / `confirm`（返回布尔） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/dialog)。

适用版本：`ztron 0.3.0`
