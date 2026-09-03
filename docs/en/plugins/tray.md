---
title: System tray (tray)
---

# Overview

The `tray` module manages the **system tray** (an NSStatusItem on
macOS): creating/destroying the tray item, changing its title and
tooltip, setting the icon (file path / registered `Image` / raw PNG
bytes), attaching a menu, and controlling visibility and template
icons. It is a port of `@tauri-apps/api/tray`, backed by the built-in
`plugin:tray|*` commands and the `ztron://tray-click` event. The API
has two layers: functions (operating on the default instance) and the
`TrayIcon` class (upstream style; the host keeps several NSStatusItems
— methods without an `id` target the legacy default instance,
`id`-bearing ones address extra instances).

```ts
import { tray, createTray, TrayIcon } from "@zturnlibs/ztron-api/tray";
```

# Permissions & Scope

tray consists of **framework built-in commands**: the 11
`plugin:tray|*` commands are registered into the permission table with
the other built-in commands and granted by the `core:default` set. No
plugin construction, no scope. P15 also added the **duplicate
permission-registration guard**: a duplicate permission now errors
explicitly (which also cleared the legacy `set_menu` double
registration).

# Example

Three icon sources (path, registered `Image`, raw bytes auto-registered
by `transformImage`) plus a tooltip update. From
`examples/hello/frontend/src/main.ts` (the anchors `TRAY_OK` and
`TRANSFORM_IMAGE_OK` are its real run outputs; comments kept, excerpts
elided):

```ts
await createTray({ title: "Ztron", tooltip: "Ztron tray" });
await setTrayTooltip("Ztron tray updated");
const trayTmp = await path.tempDir();
await setTrayIcon(`${trayTmp}/ztron_tray_icon.png`);
const img = await Image.fromPath(`${trayTmp}/ztron_tray_icon.png`);
await setTrayIcon(img);
await img.close();
```

The `TrayIcon` class: creation (with an icon), template icon (monochrome
alpha art rendered adaptively in the macOS light/dark menu bar), a
visibility round trip, and destroy. From the same file (anchor
`TRAY_CLASS_OK`):

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

Attaching a menu (shown on left click, per NSStatusItem convention —
the standard place for Quit/Preferences, P11). From the same file
(anchor `TRAY_MENU_OK`; menu creation in
[Menu](/plugins/menu)):

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

Click listening: `onTrayClick` (zero-arg handler, fires only when no
menu is attached) or `TrayIcon#onDetailedClick` (rich payload:
`button`/`clickCount`/`double`/screen coords, attributed when the host
can provide it).

# Commands

`plugin:tray|*` totals **11 commands**, mapped to the API:

| Command | API |
| --- | --- |
| `create` / `destroy` | `createTray` / `destroyTray` (`TrayIcon.create` / `destroy`) |
| `set_title` / `set_tooltip` | `setTrayTitle` / `setTrayTooltip` (same-named instance methods) |
| `set_icon` | `setTrayIcon` (`transformImage` normalizes the three sources) |
| `set_menu` | `setTrayMenu` (`TrayIcon#setMenu`) |
| `set_visible` | `TrayIcon#setVisible` |
| `set_icon_as_template` | `TrayIcon#setIconAsTemplate` |
| `get_by_id` / `remove_by_id` | `getTrayById` (`TrayIcon.getById`) / `removeTrayById` (`TrayIcon.removeById`) |
| `set_show_menu_on_left_click` | `setShowMenuOnLeftClick` (`TrayIcon#setShowMenuOnLeftClick`) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/tray).

Applicable version: `ztron 0.3.0`
