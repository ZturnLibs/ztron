/**
 * System tray API — a port of `@tauri-apps/api/tray`, backed by the built-in
 * `plugin:tray|*` commands and the `tauri://tray-click` event.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

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

/** Sets the tray icon from an image file path or a registered Image. */
export async function setTrayIcon(
  icon: string | import("./image.js").Image,
): Promise<void> {
  if (typeof icon === "string") {
    await invoke("plugin:tray|set_icon", { icon });
  } else {
    await invoke("plugin:tray|set_icon", { image_id: String(icon.rid) });
  }
}

export async function destroyTray(): Promise<void> {
  await invoke("plugin:tray|destroy", {});
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
  destroy: destroyTray,
  onClick: onTrayClick,
};
