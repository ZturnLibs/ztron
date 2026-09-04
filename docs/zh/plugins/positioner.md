---
title: 窗口定位（positioner）
---

# 概述

`positioner` 模块读写**当前窗口**的位置与大小——Tauri
`tauri-plugin-positioner` 的移植，但直接落在 `plugin:window|*`
命令上：`getPosition` / `setPosition` 处理窗口左上角坐标，
`getFrame` 一次拿全 `{ x, y, width, height }`，`getSize` 从 frame
推导 `{ width, height }`（frame 缺失时返回
`{ width: 0, height: 0 }`）。

```ts
import { getPosition, setPosition, getSize, getFrame, positioner } from "@zturnlibs/ztron-api/positioner";
```

# 权限与 Scope

positioner 是**纯前端便捷模块**：自身没有专属命令、没有插件构造、
没有 scope，全部调用复用窗口命令
（`plugin:window|get_position` / `set_position` / `get_frame`），
这些命令随框架内建权限注册、由 `core:default` 集授予（见
[窗口](/plugins/window)）。

# 示例

setPosition → getPosition 的往返（±3px 容差，窗口系统可能有最小
位移粒度）。摘自 `examples/hello/frontend/src/main.ts`（锚点
`POSITIONER_OK` 为其真实运行输出）：

```ts
// 6b. positioner (setPosition/getPosition round trip)
await setPosition(120, 140);
const pos = await getPosition();
if (pos && Math.abs(pos.x - 120) <= 3 && Math.abs(pos.y - 140) <= 3) {
  report("POSITIONER_OK:" + pos.x + "," + pos.y);
}
```

与 [窗口状态](/plugins/window-state) 搭配可做"保存 → 位移 → 恢复"
的几何往返（hello spike 的 6c 段即用 `setPosition` 制造位移）。

# 命令一览

无专属命令（复用 `plugin:window|get_position` /
`set_position` / `get_frame`，授权见 [窗口](/plugins/window)）。

| 复用命令 | API |
| --- | --- |
| `plugin:window|get_position` | `getPosition()` |
| `plugin:window|set_position` | `setPosition(x, y)` |
| `plugin:window|get_frame` | `getFrame()`（`getSize()` 基于它） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/positioner)。

适用版本：`ztron 0.3.1`
