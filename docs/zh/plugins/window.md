---
title: 窗口（window）
---

# 概述

`window` 模块提供原生窗口的控制与查询：`Window` 类（按 label 操作任一
存活窗口）、13 个窗口事件的事件订阅方法、监视器查询与拖拽区辅助函数，
是 `@tauri-apps/api/window` 的移植。所有方法都由内建的 `plugin:window|*`
命令支撑。

```ts
import { Window } from "@zturnlibs/ztron-api/window";
// 或从主入口：import { Window, getAllWindows } from "@zturnlibs/ztron-api";
```

窗口的两种创建方式（声明式配置 vs 运行时创建）见
[窗口指南](/guide/window)；本页是该模块的命令级参考。

# 权限与 Scope

window 属于框架内建能力（不作为独立插件构造），其全部
`plugin:window|*` 命令由 capability 中的 **`core:default`** 权限集
统一授权；也可用单条权限 `core:allow-window_<命令下划线名>`（如
`core:allow-window_set_title`）细粒度授权。无 scope 约束。

摘自 `examples/hello/capabilities/main.json`：

```json
{
  "permissions": ["core:default"]
}
```

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 改写；锚点
`WIN_STATE_OK`、`TITLE_OK`、`MONITORS_OK` 为其真实运行输出）：

```ts
import { Window, availableMonitors, currentMonitor } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setTitle("Ztron Spike");
const title = await win.getTitle();          // "Ztron Spike"
await win.setAlwaysOnTop(true);
await win.setOpacity(0.5);
await win.center();
const st = await win.getState();             // { maximized, fullscreen, alwaysOnTop, ... }

// 事件订阅（窗口实例便捷方法，见 13 个窗口事件）
const un = await win.onFocusChanged((focused) => console.log(focused));

// 监视器（真实 NSScreen 数据）
const monitors = await availableMonitors();
const cur = await currentMonitor();          // { name, position, size, workArea, scaleFactor }
```

无边框窗口拖拽：给元素加 `data-tauri-drag-region` 属性并在页面调用一次
`setupDragRegion()`，按下时即触发原生 `startDragging()`。

# 命令一览

`plugin:window|*` 共 **85 条**，覆盖标题/尺寸/位置/状态位/按钮位/
光标/主题/徽标/效果/事件等全部窗口面。完整清单见
[命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
