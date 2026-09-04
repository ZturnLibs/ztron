---
title: 应用菜单（menu）
---

# 概述

`menu` 模块构建**原生菜单**：应用菜单栏、窗口菜单栏、托盘菜单、
右键上下文菜单（popup），以及 check/radio/predefined/图标/子菜单等
条目类型与运行时动态增删。它是 `@tauri-apps/api/menu` 的移植，由
内建的 `plugin:menu|*` 命令和 `ztron://menu` 事件支撑。核心是
`Menu` 类（创建、安装、逐条目操作、live 快照），辅以上游风格的
条目句柄类：`MenuItem` / `CheckMenuItem` / `RadioMenuItem` /
`IconMenuItem` / `PredefinedMenuItem` / `Submenu`。

```ts
import { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem, setAppMenu, onMenuEvent, NativeIcon } from "@zturnlibs/ztron-api/menu";
```

# 权限与 Scope

menu 属于**框架内建命令**：`plugin:menu|*` 的 19 条命令随内建命令
注册进权限表，由 `core:default` 集统一授予。不需要插件构造、没有
scope。快捷键（accelerator）在宿主侧解析（`CmdOrCtrl` 前缀映射），
不涉及额外授权。

# 示例

一次性建出含分隔线、子菜单、check/radio 条目的应用菜单。摘自
`examples/hello/frontend/src/main.ts`（锚点 `MENU_OK` 为其真实运行
输出）：

```ts
// 8. application menu (creation/install; click is manual) — incl. a
//    submenu + check item
const appMenu = await setAppMenu([
  { id: "new", text: "New Window" },
  { id: "sep", text: "-", separator: true },
  {
    id: "view",
    text: "View",
    children: [
      { id: "zoom", text: "Zoom", type: "check", checked: true },
      { id: "size-small", text: "Small", type: "radio", checked: true },
      { id: "size-large", text: "Large", type: "radio" },
      { id: "reload", text: "Reload" },
    ],
  },
  { id: "quit", text: "Quit" },
]);
report("MENU_OK");
```

accelerator 与 checked 的运行时修改（P11；托盘菜单挂接的摘录见
[系统托盘](/plugins/tray)）。摘自同文件（锚点
`MENU_ACCEL_CHECKED_OK` 为其真实运行输出）：

```ts
// 8a. menu v2: accelerators, checked toggle, popup (context menu), tray menu
await appMenu.setItemAccelerator("quit", "CmdOrCtrl+Q");
await appMenu.setItemChecked("zoom", false);
await appMenu.setItemChecked("zoom", true);
report("MENU_ACCEL_CHECKED_OK");
```

动态条目操作 + `item_info` 读取 live 状态 + PredefinedMenuItem
（copy/cut/paste/quit/about… 经 first-responder selector 与约定俗成
的快捷键，P13）。摘自同文件（锚点 `MENU_DYNAMIC_OK:Second` 为其真实
运行输出，注释保留、有删节）：

```ts
// 8b. menu dynamic ops: append/predefined/insert/remove + item_info
const dyn = new MenuClass("dyn-menu", [
  { id: "d1", text: "First" },
]);
await dyn.create();
await dyn.append({ id: "d2", text: "Second" });
await dyn.append({ id: "d0", text: "Inserted" }, 0);
await dyn.append({ id: "dpre", text: "Copy", predefined: "copy" });
const info = await dyn.getItemInfo("d2");
const gone = await dyn.getItemInfo("nope");
await dyn.remove("d1");
```

两个已知边界（P13/DESIGN §80 记录）：`popup()` 会进入模态跟踪会话，
在自动流程中弹出会阻塞后续所有 GUI 工作（spike 只做命令往返，不中途
弹出应用菜单）；macOS 的崩溃级 API 陷阱——AppKit 没有 `standardItem:`
与 `removeFromMenu:`，因此宿主自行实现移除（`remove_item`/
`remove_at` 消息），条目读取走 `item_info`/`items`。

# 命令一览

`plugin:menu|*` 共 **19 条**，与 API 的对应关系：

| 命令 | API |
| --- | --- |
| `create` / `create_default` | `Menu#create` / `Menu.default()`（`Menu.new` 二合一） |
| `set_as_app_menu` / `set_as_window_menu` | `Menu#setAsAppMenu` / `Menu#setAsWindowMenu`（`setAppMenu` 组合两者） |
| `set_as_windows_menu_for_nsapp` / `set_as_help_menu_for_nsapp` | `Menu#setAsWindowsMenuForNSApp` / `Menu#setAsHelpMenuForNSApp` |
| `set_item_enabled` / `set_item_title` | `Menu#setItemEnabled` / `setItemTitle`（条目句柄 `setEnabled`/`setText`） |
| `set_item_checked` / `set_item_accel` / `set_icon` | `setItemChecked` / `setItemAccelerator`（`CheckMenuItem#setChecked`、`MenuItem#setAccelerator`）/ `setItemIcon`（`IconMenuItem#setIcon`） |
| `add_item` / `remove_item` / `remove_at` | `append(item, at?)` / `remove(itemId)` / `removeAt(index)` |
| `add_submenu` | `Submenu.create(parent, { text })` |
| `item_info` | `getItemInfo(itemId)`（未知 id 返回 null） |
| `items` | `snapshot()`（`MenuItemLive[]` 结构化快照） |
| `popup` | `Menu#popup(x?, y?)`（上下文菜单；省略坐标用光标位置） |
| `destroy` | `Menu#destroy` |

点击事件经 `onMenuEvent`（`ztron://menu`，负载
`{ menuId, itemId }`）。

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/menu)。

适用版本：`ztron 0.3.1`
