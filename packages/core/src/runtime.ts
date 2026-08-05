/**
 * Runtime adapter contract — the seam that decouples the framework core from
 * the WebView backend. Mirrors the role of Tauri's `Runtime` trait
 * (`crates/tauri-runtime`).
 *
 * `@ztron/runtime-ffi` implements this on top of the `webview/webview` C API
 * via `tjs:ffi`; a future Electron/Neutralino backend can implement the same
 * interface without touching the core.
 */

/** Window creation options (translated from Tauri's `WindowConfig`). */
export interface WindowConfig {
  /** Window/webview label, used as a handle key. */
  label: string;
  title: string;
  width: number;
  height: number;
  /** Navigate to a URL (dev server, asset server, ...). */
  url?: string;
  /** Or load raw HTML content. */
  html?: string;
  /** Enable developer tools if supported by the backend. */
  debug?: boolean;
}

/** Window state operations translated from Tauri's `tao`/window plugin. */
export type WindowStateOp =
  | "minimize"
  | "unminimize"
  | "toggle_maximize"
  | "is_maximized"
  | "is_minimized"
  | "set_fullscreen"
  | "is_fullscreen"
  | "set_always_on_top"
  | "center"
  | "set_focus"
  | "set_visible"
  | "set_resizable";

/** Native window events pushed from the host (mapped to `tauri://*`). */
export type WindowEvent = "resize" | "move" | "focus" | "blur" | "close";

/**
 * A handle to a single window + WebView.
 *
 * Maps 1:1 onto the `webview/webview` C API surface.
 */
export interface WebviewHandle {
  /** Navigates the WebView to a URL. */
  loadUrl(url: string): void;
  /** Loads raw HTML content. */
  loadHtml(html: string): void;
  /** Evaluates arbitrary JavaScript in the WebView. */
  eval(js: string): void;
  /** Updates the native window title. */
  setTitle(title: string): void;
  /** Updates the native window size. */
  setSize(width: number, height: number): void;
  /**
   * Applies a window state operation. Query ops (`is_*`) resolve to the
   * native boolean; mutation ops resolve immediately.
   */
  windowState(op: WindowStateOp, value?: boolean): boolean | Promise<boolean>;
  /** Registers a handler for native window events. */
  onWindowEvent(cb: (event: WindowEvent) => void): void;
  /**
   * Responds to a binding call. Status 0 resolves the JS promise,
   * any other value rejects it.
   */
  respond(id: string, status: number, result: string): void;
  /**
   * Registers the frontend→backend IPC entry. The callback receives
   * the bind call id and the raw request string (a JSON array of args).
   */
  onMessage(cb: (id: string, req: string) => void): void;
  /** Runs the main loop (blocks the calling thread). */
  run(): void | Promise<void>;
  /** Stops the main loop. */
  terminate(): void;
  /** Destroys the window and releases resources. */
  close(): void;
}

/** Tray operations translated from Tauri's tray plugin. */
export type TrayOp = "create" | "set_title" | "set_tooltip" | "destroy";

/** Tray payload for `TrayController.apply`. */
export interface TrayPayload {
  title?: string;
  tooltip?: string;
}

/** System tray controller provided by the runtime backend. */
export interface TrayController {
  apply(op: TrayOp, payload?: TrayPayload): void;
  onEvent(cb: (event: "click") => void): void;
}

/** A menu item (translated from Tauri's `MenuItem`). */
export interface MenuItemConfig {
  id: string;
  text: string;
  enabled?: boolean;
  separator?: boolean;
}

/** A menu composed of items. */
export interface MenuConfig {
  id: string;
  items: MenuItemConfig[];
}

/** Menu controller provided by the runtime backend. */
export interface MenuController {
  createMenu(menu: MenuConfig): void;
  setAsAppMenu(menuId: string): void;
  destroyMenu(menuId: string): void;
  setItemEnabled(menuId: string, itemId: string, enabled: boolean): void;
  setItemTitle(menuId: string, itemId: string, title: string): void;
  onEvent(cb: (event: { menuId: string; itemId: string }) => void): void;
}

/** A factory for creating windows on the current platform. */
export interface RuntimeAdapter {
  createWindow(config: WindowConfig): WebviewHandle;
  /** Optional system tray support. */
  tray?: TrayController;
  /** Optional application menu support. */
  menu?: MenuController;
}
