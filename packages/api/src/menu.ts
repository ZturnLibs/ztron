/**
 * Application menu API — a port of `@tauri-apps/api/menu`, backed by the
 * built-in `plugin:menu|*` commands and the `tauri://menu` event.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";
import type { UnlistenFn } from "./event.js";

/**
 * Stock native icons (Tauri `NativeIcon` parity) — resolved host-side to
 * AppKit template images; unmapped names degrade to icon-less items.
 */
export const NativeIcon = {
  Add: "Add",
  Advanced: "Advanced",
  Bluetooth: "Bluetooth",
  Bookmarks: "Bookmarks",
  Caution: "Caution",
  ColorPanel: "ColorPanel",
  ColumnView: "ColumnView",
  Computer: "Computer",
  EnterFullScreen: "EnterFullScreen",
  Everyone: "Everyone",
  ExitFullScreen: "ExitFullScreen",
  FlowView: "FlowView",
  Folder: "Folder",
  FolderBurnable: "FolderBurnable",
  FolderSmart: "FolderSmart",
  FollowLinkFreestanding: "FollowLinkFreestanding",
  FontPanel: "FontPanel",
  GoLeft: "GoLeft",
  GoRight: "GoRight",
  Home: "Home",
  IChatTheater: "IChatTheater",
  IconView: "IconView",
  Info: "Info",
  InvalidDataFreestanding: "InvalidDataFreestanding",
  LeftFacingTriangle: "LeftFacingTriangle",
  ListView: "ListView",
  LockLocked: "LockLocked",
  LockUnlocked: "LockUnlocked",
  MenuMixedState: "MenuMixedState",
  MenuOnState: "MenuOnState",
  MobileMe: "MobileMe",
  MultipleDocuments: "MultipleDocuments",
  Network: "Network",
  Path: "Path",
  PreferencesGeneral: "PreferencesGeneral",
  QuickLook: "QuickLook",
  RefreshFreestanding: "RefreshFreestanding",
  Refresh: "Refresh",
  Remove: "Remove",
  RevealFreestanding: "RevealFreestanding",
  RightFacingTriangle: "RightFacingTriangle",
  Share: "Share",
  Slideshow: "Slideshow",
  SmartBadge: "SmartBadge",
  StatusAvailable: "StatusAvailable",
  StatusNone: "StatusNone",
  StatusPartiallyAvailable: "StatusPartiallyAvailable",
  StatusUnavailable: "StatusUnavailable",
  StopProgressFreestanding: "StopProgressFreestanding",
  StopProgress: "StopProgress",
  TrashEmpty: "TrashEmpty",
  TrashFull: "TrashFull",
  User: "User",
  UserAccounts: "UserAccounts",
  UserGroup: "UserGroup",
  UserGuest: "UserGuest",
} as const;
export type NativeIcon = (typeof NativeIcon)[keyof typeof NativeIcon];

/** Metadata for the standard About panel item (upstream AboutMetadata). */
export interface AboutMetadata {
  name?: string;
  version?: string;
  shortVersion?: string;
  authors?: string[];
  comments?: string;
  copyright?: string;
  license?: string;
  website?: string;
  websiteLabel?: string;
  credits?: string;
}

/** Options for items carrying a stock icon (upstream IconMenuItemOptions). */
export interface IconMenuItemOptions {
  id?: string;
  text: string;
  /** A {@linkcode NativeIcon} kind (file/image-id sources land later). */
  icon: NativeIcon | string;
  enabled?: boolean;
  accelerator?: string;
}

/** Live child snapshot served by {@linkcode Menu.items} (upstream items()). */
export interface MenuItemLive {
  id: string;
  menuId: string;
  title: string;
  enabled: boolean;
  checked: boolean;
  separator: boolean;
  hasSubmenu: boolean;
}

export interface MenuItem {
  id: string;
  text: string;
  enabled?: boolean;
  separator?: boolean;
  /** Item kind: normal / check / radio. */
  type?: "normal" | "check" | "radio";
  /** Initial checked state for check/radio items. */
  checked?: boolean;
  /** Item shortcut ("CmdOrCtrl+Shift+K"; shown on the item, parsed host-side). */
  accelerator?: string;
  /** Predefined system behavior ("copy"/"paste"/"quit"/"about"/…). */
  predefined?: string;
  /** Stock native icon kind (NativeIcon value or explicit image name). */
  icon?: NativeIcon | string;
  /** Nested submenu items. */
  children?: MenuItem[];
}

export interface MenuEvent {
  menuId: string;
  itemId: string;
}

export class Menu {
  readonly id: string;
  readonly items: MenuItem[];

  constructor(id: string, items: MenuItem[] = []) {
    this.id = id;
    this.items = items;
  }

  async create(): Promise<void> {
    await invoke("plugin:menu|create", {
      menu: { id: this.id, items: this.items },
    });
  }

  async setAsAppMenu(): Promise<void> {
    await invoke("plugin:menu|set_as_app_menu", { menuId: this.id });
  }

  async setItemEnabled(itemId: string, enabled: boolean): Promise<void> {
    await invoke("plugin:menu|set_item_enabled", {
      menuId: this.id,
      itemId,
      enabled,
    });
  }

  async setItemTitle(itemId: string, title: string): Promise<void> {
    await invoke("plugin:menu|set_item_title", {
      menuId: this.id,
      itemId,
      title,
    });
  }

  /** Sets the state mark of a check/radio item. */
  async setItemChecked(itemId: string, checked: boolean): Promise<void> {
    await invoke("plugin:menu|set_item_checked", {
      menuId: this.id,
      itemId,
      checked,
    });
  }

  /** Sets the shortcut shown on an item ("CmdOrCtrl+K"). */
  async setItemAccelerator(
    itemId: string,
    accelerator: string,
  ): Promise<void> {
    await invoke("plugin:menu|set_item_accel", {
      menuId: this.id,
      itemId,
      accelerator,
    });
  }

  /**
   * Pops this menu as a context menu at window coordinates — call from a
   * `contextmenu` DOM event (`e.preventDefault()` then `popup(e.x, e.y)`).
   * Omitting the position uses the current cursor location.
   */
  async popup(x?: number, y?: number): Promise<void> {
    await invoke("plugin:menu|popup", { menuId: this.id, x, y });
  }

  /** Appends an item at runtime (or inserts at `at`). */
  async append(item: MenuItem, at?: number): Promise<void> {
    await invoke("plugin:menu|add_item", { menuId: this.id, item, at });
  }

  /** Removes a runtime item by id. */
  async remove(itemId: string): Promise<void> {
    await invoke("plugin:menu|remove_item", { menuId: this.id, itemId });
  }

  /** Reads an item's live state (null when the id is unknown). */
  async getItemInfo(
    itemId: string,
  ): Promise<{ enabled: boolean; checked: boolean; title: string } | null> {
    return invoke("plugin:menu|item_info", { menuId: this.id, itemId });
  }

  /** Removes a runtime item by structural index (upstream removeAt). */
  async removeAt(index: number): Promise<void> {
    await invoke("plugin:menu|remove_at", { menuId: this.id, index });
  }

  /**
   * Structured live snapshot of every direct child (upstream `items()`;
   * renamed here because this class already carries the config-tree `items`
   * field from v1).
   */
  async snapshot(): Promise<MenuItemLive[]> {
    return invoke<MenuItemLive[]>("plugin:menu|items", { menuId: this.id });
  }

  /** Sets a stock native icon on an existing item (IconMenuItem.setIcon). */
  async setItemIcon(itemId: string, icon: NativeIcon | string): Promise<void> {
    await invoke("plugin:menu|set_icon", {
      menuId: this.id,
      itemId,
      icon,
    });
  }

  /** Mounts this menu as one window's own menu bar. */
  async setAsWindowMenu(label: string): Promise<void> {
    await invoke("plugin:menu|set_as_window_menu", {
      menuId: this.id,
      label,
    });
  }

  /** Routes the Window-role submenu to NSApp (Windows menu behaviors). */
  async setAsWindowsMenuForNSApp(): Promise<void> {
    await invoke("plugin:menu|set_as_windows_menu_for_nsapp", {
      menuId: this.id,
    });
  }

  /** Marks this submenu as the Help menu of the application. */
  async setAsHelpMenuForNSApp(): Promise<void> {
    await invoke("plugin:menu|set_as_help_menu_for_nsapp", { menuId: this.id });
  }

  async destroy(): Promise<void> {
    await invoke("plugin:menu|destroy", { menuId: this.id });
  }

  /**
   * Builds and registers the standard platform application menu under an
   * auto-generated root id (upstream `Menu.default()`).
   */
  static async default(id = "$default"): Promise<Menu> {
    const menu = new Menu(id);
    await invoke("plugin:menu|create_default", { menuId: id });
    return menu;
  }

  /** Upstream-style construction: creates AND registers in one call. */
  static async new(
    options: { id?: string; items: Array<Omit<MenuItem, "id"> & { id?: string }> },
  ): Promise<Menu> {
    const id =
      options.id ?? `$menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const items = options.items.map(
      (it, i) => ({ ...it, id: it.id ?? `item-${i}` }) as MenuItem,
    );
    const m = new Menu(id, items);
    await m.create();
    return m;
  }
}

/** Creates a menu and installs it as the application menu bar. */
export async function setAppMenu(items: MenuItem[]): Promise<Menu> {
  const menu = new Menu("main", items);
  await menu.create();
  await menu.setAsAppMenu();
  return menu;
}

/** Listens to menu item clicks. */
export async function onMenuEvent(
  handler: (event: MenuEvent) => void,
): Promise<UnlistenFn> {
  return listen<MenuEvent>("tauri://menu", (e) => handler(e.payload));
}
