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
  | "set_always_on_bottom"
  | "center"
  | "set_focus"
  | "is_focused"
  | "set_visible"
  | "set_resizable"
  | "set_opacity"
  | "set_transparent"
  | "set_decorations"
  | "is_decorated"
  | "set_shadow"
  | "set_enabled"
  | "set_minimizable"
  | "is_minimizable"
  | "set_maximizable"
  | "is_maximizable"
  | "set_closable"
  | "is_closable"
  | "set_skip_taskbar"
  | "set_content_protected"
  | "set_prevent_close"
  | "request_user_attention";

/** Native window events pushed from the host (mapped to `tauri://*`). */
export type WindowEvent = "resize" | "move" | "focus" | "blur" | "close";

/** Native window geometry (CSS-pixel position + size). */
export interface WindowFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Snapshot of the native window's boolean state flags. */
export interface WindowStateSnapshot {
  maximized: boolean;
  minimized: boolean;
  fullscreen: boolean;
  alwaysOnTop: boolean;
  visible: boolean;
  resizable: boolean;
}

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
  /** Reads the native window frame (position + size). */
  getFrame(): Promise<WindowFrame | null>;
  /** Moves the native window to the given origin. */
  setPosition(x: number, y: number): void;
  /** Sets the native window bounds (position + size in one op). */
  setBounds(x: number, y: number, width: number, height: number): void;
  /** Sets content min size constraint (null/0,0 clears). */
  setMinSize(width: number, height: number): void;
  /** Sets content max size constraint (null/0,0 clears). */
  setMaxSize(width: number, height: number): void;
  /** Dock/taskbar progress (0..1; null clears). */
  setProgressBar(progress: number | null): void;
  /** Dock/taskbar numeric badge (null/0 clears). */
  setBadgeCount(count: number | null): void;
  /** Dock/taskbar text badge (null/"" clears). */
  setBadgeLabel(label: string | null): void;
  /** Window background color (hex `#rrggbb`/`#rrggbbaa` or `transparent`). */
  setBackgroundColor(color: string): void;
  /** Title-bar style: `visible` (default), `transparent`, `overlay`. */
  setTitleBarStyle(style: "visible" | "transparent" | "overlay"): void;
  /** Sets the native window opacity (0.0 = fully transparent, 1.0 = opaque). */
  setOpacity(opacity: number): void;
  /** Reads the native window's boolean state flags. */
  getWindowState(): Promise<WindowStateSnapshot | null>;
  /** Reads the native window title. */
  getWindowTitle(): Promise<string | null>;
  /** Reads the OS color scheme the window follows ("light" | "dark"). */
  getTheme(): Promise<string | null>;
  /** Reads the window's backing scale factor (HiDPI). */
  getScaleFactor(): Promise<number | null>;
  /** Toggles whether the window ignores mouse/cursor events. */
  setIgnoreCursorEvents(ignore: boolean): void;
  /** Sets the window cursor (CSS-style name: "pointer", "text", …). */
  setCursor(cursor: string): void;
  /** Force-closes the window, bypassing preventClose. */
  destroy(): void;
  /** Starts a native resize drag (direction: "north"/"east"/…). */
  startResizeDragging(direction: string): void;
  /** Zooms the web content (CSS zoom factor, e.g. 1.5). */
  setZoom(zoom: number): void;
  /** Initiates a native window drag (for frameless `data-tauri-drag-region`). */
  startDragging(): void;
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
export type TrayOp =
  "create" | "set_title" | "set_tooltip" | "set_icon" | "destroy";

/** Tray payload for `TrayController.apply`. */
export interface TrayPayload {
  title?: string;
  tooltip?: string;
  /** Icon file path. */
  icon?: string;
  /** Host image registry id (from `plugin:image|*`) — wins over `icon`. */
  image_id?: number | string;
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
  /** Item kind: normal / check / radio (check toggles a state mark). */
  type?: "normal" | "check" | "radio";
  /** Initial checked state for check/radio items. */
  checked?: boolean;
  /** Nested submenu items. */
  children?: MenuItemConfig[];
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

/** Native open-dialog options. */
export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
}

/** Native save-dialog options. */
export interface SaveDialogOptions {
  title?: string;
  defaultName?: string;
}

/** Native message-dialog options. */
export interface MessageDialogOptions {
  title: string;
  message?: string;
}

/** Native dialog controller provided by the runtime backend. */
export interface DialogController {
  open(options: OpenDialogOptions): Promise<string | null>;
  save(options: SaveDialogOptions): Promise<string | null>;
  message(options: MessageDialogOptions): Promise<number>;
}

/** Clipboard controller provided by the runtime backend. */
export interface ClipboardController {
  readText(): Promise<string | null>;
  writeText(text: string): void;
}

/** Native notification options (translated from Tauri's notification plugin). */
export interface NotificationOptions {
  title: string;
  body?: string;
}

/** Native notification controller provided by the runtime backend. */
export interface NotificationController {
  send(options: NotificationOptions): void;
}

/** Global shortcut controller provided by the runtime backend. */
export interface GlobalShortcutController {
  register(id: string, accelerator: string): Promise<boolean>;
  unregister(id: string): Promise<boolean>;
  onEvent(cb: (event: { shortcutId: string }) => void): void;
}

/** Deep-link controller provided by the runtime backend. */
export interface DeepLinkController {
  /** Registers a handler for `app://...` URLs opened via the OS. */
  onEvent(cb: (url: string) => void): void;
  /** The most recent deep-link URL (null when launched normally). */
  getLastUrl(): string | null;
}

/** Process control (exit / relaunch) provided by the runtime backend. */
export interface ProcessController {
  /** Terminates the app with an exit code. */
  exit(code?: number): void;
  /** Restarts the app (best-effort; the host respawns itself then exits). */
  relaunch(): void;
}

/** Native image registry controller provided by the runtime backend. */
export interface ImageController {
  /** Registers a base64-encoded image and returns its id (-1 on failure). */
  fromBytes(base64: string): Promise<number>;
  /** Loads an image from a file path and returns its id (-1 on failure). */
  fromPath(path: string): Promise<number>;
  /** Releases a registered image. */
  destroy(id: number): void;
}

/** A factory for creating windows on the current platform. */
export interface RuntimeAdapter {
  createWindow(config: WindowConfig): WebviewHandle;
  /** Optional system tray support. */
  tray?: TrayController;
  /** Optional application menu support. */
  menu?: MenuController;
  /** Optional native dialogs. */
  dialog?: DialogController;
  /** Optional clipboard access. */
  clipboard?: ClipboardController;
  /** Optional native notifications. */
  notification?: NotificationController;
  /** Optional global shortcuts. */
  globalShortcut?: GlobalShortcutController;
  /** Optional deep-link (custom URL scheme) support. */
  deepLink?: DeepLinkController;
  /** Optional process control. */
  process?: ProcessController;
  /** Optional native image registry. */
  image?: ImageController;
}
