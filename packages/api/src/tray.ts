/**
 * System tray API — a port of `@tauri-apps/api/tray`, backed by the built-in
 * `plugin:tray|*` commands and the `tauri://tray-click` event.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";
import { transformImage, type ImageLike } from "./image.js";

export interface TrayOptions {
  title: string;
  tooltip?: string;
}

/** Creates a system tray item with a text title. */
export async function createTray(options: TrayOptions): Promise<void> {
  await invoke("plugin:tray|create", {
    title: options.title,
    tooltip: options.tooltip,
  });
}

export async function setTrayTitle(title: string): Promise<void> {
  await invoke("plugin:tray|set_title", { title });
}

export async function setTrayTooltip(tooltip: string): Promise<void> {
  await invoke("plugin:tray|set_tooltip", { tooltip });
}

/**
 * Sets the tray icon from a file path, a registered `Image`, or raw bytes
 * (`transformImage` normalizes the argument).
 */
export async function setTrayIcon(icon: ImageLike): Promise<void> {
  const t = await transformImage(icon);
  await invoke("plugin:tray|set_icon", {
    icon: t?.path ?? "",
    image_id: t?.image_id != null ? String(t.image_id) : "",
  });
}

export async function destroyTray(): Promise<void> {
  await invoke("plugin:tray|destroy", {});
}

/**
 * Attaches a registered menu to the tray (left-click shows it on macOS,
 * per NSStatusItem convention — the standard place for Quit/Preferences).
 */
export async function setTrayMenu(menuId: string): Promise<void> {
  await invoke("plugin:tray|set_menu", { menuId });
}

/** Listens to tray clicks. */
export async function onTrayClick(
  handler: () => void,
): Promise<() => Promise<void>> {
  return listen("tauri://tray-click", () => handler());
}

/** Whether a tray instance with this id exists. */
export function getTrayById(id: string): Promise<boolean> {
  return invoke<boolean>("plugin:tray|get_by_id", { id });
}

/** Removes an extra tray instance by id. */
export function removeTrayById(id: string): Promise<void> {
  return invoke("plugin:tray|remove_by_id", { id });
}

/** Toggles left-click menu behavior for an instance (default = legacy one). */
export function setShowMenuOnLeftClick(
  on: boolean,
  id?: string,
): Promise<void> {
  return invoke("plugin:tray|set_show_menu_on_left_click", { id, value: on });
}

export const tray = {
  create: createTray,
  setTitle: setTrayTitle,
  setTooltip: setTrayTooltip,
  setIcon: setTrayIcon,
  setMenu: setTrayMenu,
  destroy: destroyTray,
  onClick: onTrayClick,
};

/**
 * Class-based tray API — a port of `@tauri-apps/api/tray` `TrayIcon`.
 * G5/B9: the host keeps up to MAX_TRAYS NSStatusItems; the no-id methods
 * target the legacy default instance, `id`-bearing ones address others.
 */
export class TrayIcon {
  readonly id: string;

  private constructor(id = "") {
    this.id = id;
  }

  /** Creates the native tray item (title/tooltip optional; id for extra instances). */
  static async create(options: {
    title?: string;
    tooltip?: string;
    icon?: ImageLike;
    id?: string;
    menuOnLeftClick?: boolean;
  } = {}): Promise<TrayIcon> {
    if (options.menuOnLeftClick !== undefined) {
      await setShowMenuOnLeftClick(options.menuOnLeftClick, options.id);
    }
    await createTray({
      title: options.title ?? "",
      tooltip: options.tooltip ?? "",
      ...(options.id ? { id: options.id } : {}),
    });
    if (options.icon !== undefined) {
      await setTrayIcon(options.icon);
    }
    return new TrayIcon(options.id);
  }

  /** Whether an instance with this id exists (upstream TrayIcon.getById). */
  static async getById(id: string): Promise<boolean> {
    return invoke<boolean>("plugin:tray|get_by_id", { id });
  }

  /** Removes an instance by id (upstream TrayIcon.removeById). */
  static async removeById(id: string): Promise<void> {
    await invoke("plugin:tray|remove_by_id", { id });
  }

  /** Toggles left-click menu attachment for the given instance. */
  async setShowMenuOnLeftClick(on: boolean): Promise<void> {
    await invoke("plugin:tray|set_show_menu_on_left_click", {
      id: this.id,
      value: on,
    });
  }

  /**
   * Rich click stream (G5/B9): handler receives attribution when the host can
   * provide it — button/clickCount/double/screen coords; legacy `onClick`
   * keeps its zero-arg shape.
   */
  onDetailedClick(
    handler: (e: {
      event: string;
      trayId?: string;
      button?: "left" | "right";
      clickCount?: number;
      double?: boolean;
      x?: number;
      y?: number;
    }) => void,
  ): Promise<() => Promise<void>> {
    return listen<{ event: string }>("tauri://tray-click", (e) =>
      handler(e.payload as never),
    );
  }

  async setTitle(title: string): Promise<void> {
    return setTrayTitle(title);
  }

  async setTooltip(tooltip: string): Promise<void> {
    return setTrayTooltip(tooltip);
  }

  async setIcon(icon: ImageLike): Promise<void> {
    return setTrayIcon(icon);
  }

  /** Attaches a registered menu (left-click shows it on macOS). */
  async setMenu(menuId: string): Promise<void> {
    return setTrayMenu(menuId);
  }

  /** Shows/hides the tray item. */
  async setVisible(visible: boolean): Promise<void> {
    await invoke("plugin:tray|set_visible", { visible });
  }

  /**
   * Marks the current icon as a template image — macOS renders it
   * adaptively in light/dark menu bars (monochrome alpha-only art).
   */
  async setIconAsTemplate(asTemplate: boolean): Promise<void> {
    await invoke("plugin:tray|set_icon_as_template", { asTemplate });
  }

  /** Listens for clicks (only when no menu is attached). */
  onClick(handler: () => void): Promise<() => Promise<void>> {
    return onTrayClick(handler);
  }

  /** Removes the tray item. */
  async destroy(): Promise<void> {
    return destroyTray();
  }
}
