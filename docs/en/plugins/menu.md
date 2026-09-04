---
title: Application menu (menu)
---

# Overview

The `menu` module builds **native menus**: the app menu bar, window
menu bars, tray menus, right-click context menus (popup), plus item
flavors (check/radio/predefined/icon/submenu) and runtime dynamic
add/remove. It is a port of `@tauri-apps/api/menu`, backed by the
built-in `plugin:menu|*` commands and the `ztron://menu` event. The
core is the `Menu` class (create, install, per-item operations, live
snapshots), complemented by upstream-style item handles:
`MenuItem` / `CheckMenuItem` / `RadioMenuItem` / `IconMenuItem` /
`PredefinedMenuItem` / `Submenu`.

```ts
import { Menu, MenuItem, CheckMenuItem, PredefinedMenuItem, setAppMenu, onMenuEvent, NativeIcon } from "@zturnlibs/ztron-api/menu";
```

# Permissions & Scope

menu consists of **framework built-in commands**: the 19
`plugin:menu|*` commands are registered into the permission table with
the other built-in commands and granted by the `core:default` set. No
plugin construction, no scope. Accelerators are parsed host-side (the
`CmdOrCtrl` prefix mapping) and involve no extra authorization.

# Example

Building an app menu with a separator, a submenu and check/radio items
in one call. From `examples/hello/frontend/src/main.ts` (the anchor
`MENU_OK` is its real run output):

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

Runtime accelerator and checked mutations (P11; the tray-menu
attachment excerpt lives in [Tray](/plugins/tray)). From the same file
(the anchor `MENU_ACCEL_CHECKED_OK` is its real run output):

```ts
// 8a. menu v2: accelerators, checked toggle, popup (context menu), tray menu
await appMenu.setItemAccelerator("quit", "CmdOrCtrl+Q");
await appMenu.setItemChecked("zoom", false);
await appMenu.setItemChecked("zoom", true);
report("MENU_ACCEL_CHECKED_OK");
```

Dynamic item operations + `item_info` live-state reads +
PredefinedMenuItem (copy/cut/paste/quit/about… via first-responder
selectors and conventional key equivalents, P13). From the same file
(the anchor `MENU_DYNAMIC_OK:Second` is its real run output; comments
kept, excerpts elided):

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

Two known edges (recorded in P13 / DESIGN §80): `popup()` enters a
modal tracking session — popping it mid-flow blocks all subsequent GUI
work, so the spike only round-trips the command instead of popping the
app menu; and the macOS crash-grade API traps — AppKit has no
`standardItem:` and no `removeFromMenu:`, so the host implements
removal itself (`remove_item`/`remove_at` messages) and item reads go
through `item_info`/`items`.

# Commands

`plugin:menu|*` totals **19 commands**, mapped to the API:

| Command | API |
| --- | --- |
| `create` / `create_default` | `Menu#create` / `Menu.default()` (`Menu.new` does both) |
| `set_as_app_menu` / `set_as_window_menu` | `Menu#setAsAppMenu` / `Menu#setAsWindowMenu` (`setAppMenu` combines them) |
| `set_as_windows_menu_for_nsapp` / `set_as_help_menu_for_nsapp` | `Menu#setAsWindowsMenuForNSApp` / `Menu#setAsHelpMenuForNSApp` |
| `set_item_enabled` / `set_item_title` | `Menu#setItemEnabled` / `setItemTitle` (handle `setEnabled`/`setText`) |
| `set_item_checked` / `set_item_accel` / `set_icon` | `setItemChecked` / `setItemAccelerator` (`CheckMenuItem#setChecked`, `MenuItem#setAccelerator`) / `setItemIcon` (`IconMenuItem#setIcon`) |
| `add_item` / `remove_item` / `remove_at` | `append(item, at?)` / `remove(itemId)` / `removeAt(index)` |
| `add_submenu` | `Submenu.create(parent, { text })` |
| `item_info` | `getItemInfo(itemId)` (null for an unknown id) |
| `items` | `snapshot()` (structured `MenuItemLive[]` snapshot) |
| `popup` | `Menu#popup(x?, y?)` (context menu; omitting coords uses the cursor) |
| `destroy` | `Menu#destroy` |

Clicks arrive via `onMenuEvent` (`ztron://menu`, payload
`{ menuId, itemId }`).

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/menu).

Applicable version: `ztron 0.3.1`
