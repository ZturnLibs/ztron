---
title: DPI 几何（dpi）
---

# 概述

`dpi` 模块提供 DPI 感知的几何类型：逻辑像素随窗口 DPI 因子缩放
（CSS/浏览器 API 的单位），物理像素是真实设备像素。它是
`@tauri-apps/api/dpi` 的移植，供窗口几何方法（`setSize`/
`setPosition`/`setBounds`/`setMinSize`…）接受带单位参数。

```ts
import { LogicalSize, PhysicalPosition } from "@zturnlibs/ztron-api/dpi";
```

类型一览：

- `LogicalSize` / `PhysicalSize`：`{ width, height }`，互转
  `toPhysical(scaleFactor)` / `toLogical(scaleFactor)`。
- `LogicalPosition` / `PhysicalPosition`：`{ x, y }`，同样互转。
- `Size` / `Position`：上游包装类，按来源（实例或带 `type` 的
  普通对象）解析为逻辑或物理。
- `SizeLike` / `PositionLike`：几何方法实际接受的联合——单个数字、
  dpi 实例或普通 `{ width, height }` / `{ x, y }` 对象。
- `normalizeSize` / `normalizePosition`：把上述任一形状归一化为
  wire 协议的普通 `{ width, height }` / `{ x, y }`。

Ztron wire 协议把两类坐标都序列化为普通对象；逻辑/物理的区分只在
前端侧有意义（`toJSON()` 输出普通形状）。

# 权限与 Scope

dpi 是**纯前端类型模块**：不发起任何 `plugin:*` 调用，因此不涉及
capability 权限，也没有 scope。几何命令（`plugin:window|set_size`
等）的授权见 [窗口](/plugins/window)。

# 示例

示例（基于 hello 示例的窗口操作段落改写）——`setSize` / `setPosition`
既接受数字对，也接受 dpi 实例；`setMinSize` / `setMaxSize` 只接受**一个**
`SizeLike` 参数：

```ts
import { LogicalSize, Window } from "@zturnlibs/ztron-api";

const win = Window.getCurrent();
await win.setSize(800, 600);                        // 数字对（width, height?）
await win.setPosition(80, 90);                      // 数字对（x, y?）
await win.setSize(new LogicalSize(800, 600));       // dpi 实例，等价

// setMinSize / setMaxSize(size: SizeLike | null)：传数字时第二个参数会被忽略
// （normalizeSize(a) 使 height 落到 0），请用 dpi 实例或普通对象
await win.setMinSize(new LogicalSize(300, 200));    // dpi 实例
await win.setMinSize({ width: 300, height: 200 });  // 或普通对象
await win.setSizeConstraints({ minWidth: 320, minHeight: 240 });
```

# 命令一览

无专属命令（纯前端模块）。

适用版本：`ztron 0.3.1`
