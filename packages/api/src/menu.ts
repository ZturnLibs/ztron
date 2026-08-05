/**
 * Application menu API — a port of `@tauri-apps/api/menu`, backed by the
 * built-in `plugin:menu|*` commands and the `tauri://menu` event.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";
import type { UnlistenFn } from "./event.js";

export interface MenuItem {
  id: string;
  text: string;
  enabled?: boolean;
  separator?: boolean;
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

  async destroy(): Promise<void> {
    await invoke("plugin:menu|destroy", { menuId: this.id });
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
