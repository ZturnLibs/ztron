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
 * Wraps the functional surface; one tray per app (the host keeps a single
 * NSStatusItem / Shell_NotifyIcon / StatusNotifier).
 */
export class TrayIcon {
  /** Creates the native tray item (title/tooltip optional). */
  static async create(options: {
    title?: string;
    tooltip?: string;
    icon?: ImageLike;
  } = {}): Promise<TrayIcon> {
    await createTray({ title: options.title ?? "", tooltip: options.tooltip ?? "" });
    if (options.icon !== undefined) {
      await setTrayIcon(options.icon);
    }
    return new TrayIcon();
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
