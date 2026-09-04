---
title: 系统托盘（tray）
---

# 概述

`tray` 模块管理**系统托盘**（macOS 上是 NSStatusItem）：创建/销毁
托盘项、改标题与 tooltip、设图标（文件路径 / 注册 Image / 原始 PNG
字节）、挂菜单、控制可见性与模板图标。它是 `@tauri-apps/api/tray` 的
移植，由内建的 `plugin:tray|*` 命令和 `ztron://tray-click` 事件支撑。
API 分两层：函数式（操作默认实例）与 `TrayIcon` 类（上游风格；宿主
保留多个 NSStatusItem，无 `id` 的方法作用于旧默认实例，带 `id` 的
方法寻址额外实例）。

```ts
import { tray, createTray, TrayIcon } from "@zturnlibs/ztron-api/tray";
```

# 权限与 Scope

tray 属于**框架内建命令**：`plugin:tray|*` 的 11 条命令随内建命令
注册进权限表，由 `core:default` 集统一授予。不需要插件构造、没有
scope。P15 还加了**权限重复注册防御**：duplicate permission 现在
显式报错（顺带清掉了 `set_menu` 的双注册遗留）。

# 示例

图标的三种来源（路径、注册 `Image`、原始字节经 `transformImage`
自动注册）+ tooltip 更新。摘自
`examples/hello/frontend/src/main.ts`（锚点 `TRAY_OK`、
`TRANSFORM_IMAGE_OK` 为其真实运行输出，注释保留、有删节）：

```ts
await createTray({ title: "Ztron", tooltip: "Ztron tray" });
await setTrayTooltip("Ztron tray updated");
const trayTmp = await path.tempDir();
await setTrayIcon(`${trayTmp}/ztron_tray_icon.png`);
const img = await Image.fromPath(`${trayTmp}/ztron_tray_icon.png`);
await setTrayIcon(img);
await img.close();
```

`TrayIcon` 类：创建（带图标）、模板图标（macOS 菜单栏亮/暗色自适应
渲染单色 alpha 图）、可见性往返、销毁。摘自同文件（锚点
`TRAY_CLASS_OK`）：

```ts
// 7z. TrayIcon class: create/template icon/visible round trips
const trayTmp2 = await path.tempDir();
const tray2 = await TrayIcon.create({
  title: "Z2",
  tooltip: "class tray",
  icon: `${trayTmp2}/ztron_tray_icon.png`,
});
await tray2.setIconAsTemplate(true);
await tray2.setIconAsTemplate(false);
await tray2.setVisible(false);
await tray2.setVisible(true);
await tray2.destroy();
report("TRAY_CLASS_OK");
```

挂菜单（左键弹出，遵循 NSStatusItem 惯例——Quit/Preferences 的标准
位置，P11）：摘自同文件（锚点 `TRAY_MENU_OK`，菜单创建见
[应用菜单](/plugins/menu)）：

```ts
const trayMenu = new MenuClass("tray-menu", [
  { id: "tray-open", text: "Open" },
  { id: "tray-sep", text: "-", separator: true },
  { id: "tray-quit", text: "Quit", predefined: "quit" },
]);
await trayMenu.create();
await tray.setMenu(trayMenu.id);
report("TRAY_MENU_OK");
```

点击监听：`onTrayClick`（零参 handler，仅在未挂菜单时触发）或
`TrayIcon#onDetailedClick`（富负载：`button`/`clickCount`/`double`/
屏幕坐标，宿主能提供时附带归属）。

# 命令一览

`plugin:tray|*` 共 **11 条**，与 API 的对应关系：

| 命令 | API |
| --- | --- |
| `create` / `destroy` | `createTray` / `destroyTray`（`TrayIcon.create` / `destroy`） |
| `set_title` / `set_tooltip` | `setTrayTitle` / `setTrayTooltip`（实例同名方法） |
| `set_icon` | `setTrayIcon`（`transformImage` 归一化三种来源） |
| `set_menu` | `setTrayMenu`（`TrayIcon#setMenu`） |
| `set_visible` | `TrayIcon#setVisible` |
| `set_icon_as_template` | `TrayIcon#setIconAsTemplate` |
| `get_by_id` / `remove_by_id` | `getTrayById`（`TrayIcon.getById`）/ `removeTrayById`（`TrayIcon.removeById`） |
| `set_show_menu_on_left_click` | `setShowMenuOnLeftClick`（`TrayIcon#setShowMenuOnLeftClick`） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/tray)。

适用版本：`ztron 0.3.1`
