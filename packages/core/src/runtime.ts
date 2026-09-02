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
  /** Startup x/y (logical px; center when both omitted). */
  x?: number;
  y?: number;
  /** Startup size constraints (logical px). */
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** Startup booleans (host applies them right after create). */
  resizable?: boolean;
  maximizable?: boolean;
  minimizable?: boolean;
  closable?: boolean;
  maximized?: boolean;
  fullscreen?: boolean;
  visible?: boolean;
  decorations?: boolean;
  alwaysOnTop?: boolean;
  alwaysOnBottom?: boolean;
  transparent?: boolean;
  skipTaskbar?: boolean;
  contentProtected?: boolean;
  center?: boolean;
  /** "visible" (default) | "transparent" | "overlay" (macOS). */
  titleBarStyle?: "visible" | "transparent" | "overlay";
  /** App-wide theme at startup: "dark" | "light" | omitted (system). */
  theme?: "dark" | "light";
  /** Window drop-shadow (macOS NSWindow.hasShadow). */
  shadow?: boolean;
  /** Focus the window right after creation (upstream WindowConfig.focus). */
  focus?: boolean;
  /** Master switch for file drag&drop events (P26; default true). */
  dragDropEnabled?: boolean;
}

/**
 * Upstream WindowConfig keys this host does not implement yet. The schema
 * ACCEPTS them (parity) and fromConfig warns via its onWarn hook; they are
 * preserved on the config for the future platform work.
 */
export const DECLARED_UNSUPPORTED_WINDOW_FIELDS = [
  "userAgent",
  "incognito",
  "proxyUrl",
  "zoomHotkeysEnabled",
  "browserExtensionsEnabled",
  "useHttpsScheme",
  "backgroundThrottling",
  "javascriptDisabled",
  "acceptFirstMouse",
  "hiddenTitle",
  "parent",
  "preventOverflow",
  "tabbingIdentifier",
] as const;

/** Full upstream WindowConfig key set for schema awareness. */
export const UPSTREAM_WINDOW_FIELDS = [
  ...DECLARED_UNSUPPORTED_WINDOW_FIELDS,
  "label","create","url","center","x","y","width","height","minWidth",
  "minHeight","maxWidth","maxHeight","resizable","maximizable","minimizable",
  "closable","title","fullscreen","focus","transparent","maximized","visible",
  "decorations","alwaysOnBottom","alwaysOnTop","visibleOnAllWorkspaces",
  "contentProtected","skipTaskbar","theme","titleBarStyle","shadow",
  "windowEffects","devtools","backgroundColor","dragDropEnabled",
] as const;

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
  | "get_inner_position"
  | "set_file_drop_enabled"
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
  | "request_user_attention"
  | "maximize"
  | "unmaximize"
  | "is_enabled"
  | "set_focusable"
  | "set_cursor_visible"
  | "set_cursor_grab"
  | "set_visible_on_all_workspaces"
  | "set_simple_fullscreen"
  /** Vibrancy material effects (macOS): material name, state, radius. */
  | "set_effects"
  | "clear_effects";

/** Native window events pushed from the host (mapped to `ztron://*`). */
export type WindowEvent =
  | "resize"
  | "move"
  | "focus"
  | "blur"
  | "close"
  | "suspended"
  | "resumed"
  | "scale-change"
  | "theme-change"
  | "drag-enter"
  | "drag-over"
  | "drag-drop"
  | "drag-leave";

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
  /** App-wide theme override: `"dark"` / `"light"` / `null` (follow system). */
  setTheme(theme: "dark" | "light" | null): void;
  /** Reads the inner (content) size — `{width,height}` in points. */
  getInnerSize(): Promise<{ width: number; height: number } | null>;
  /** Reads the cursor position in window coordinates (`{x,y}`). */
  getCursorPosition(): Promise<{ x: number; y: number } | null>;
  /** Warps the cursor to window coordinates (x, y). */
  setCursorPosition(x: number, y: number): void;
  /** Clears the webview's browsing data (cookies, cache, storage). */
  clearBrowsingData(): void;
  /** Moves the traffic-light buttons (frameless macOS windows). */
  setTrafficLightPosition(x: number, y: number): void;
  /** Screen queries (physical px): all / primary / the window's / at point. */
  queryMonitors(
    kind: "all" | "primary" | "current" | "point",
    x?: number,
    y?: number,
  ): Promise<MonitorInfo[] | null>;
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
  /** Sets the window/dock icon from a registered image id. */
  setIcon(imageId: number): void;
  /** Sets a small right-side titlebar accessory icon (-1 clears). */
  setOverlayIcon(imageId: number): void;
  /**
   * Applies a window state operation. Query ops (`is_*`) resolve to the
   * native boolean; mutation ops resolve immediately.
   */
  windowState(
    op: WindowStateOp,
    value?: boolean,
    effect?: { material?: string; state?: number; radius?: number },
  ): boolean | Promise<boolean> | { x: number; y: number } | null;
  /** Registers a handler for native window events. */
  onWindowEvent(cb: (event: WindowEvent, payload?: unknown) => void): void;
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
  | "create"
  | "set_title"
  | "set_tooltip"
  | "set_icon"
  | "set_menu"
  | "set_visible"
  | "set_icon_template"
  | "get_by_id"
  | "remove_by_id"
  | "set_show_menu_on_left_click"
  | "destroy";

/** Rich tray event payload (G5/B9 — click attribution is best-effort). */
export interface TrayEventPayload {
  event: string;
  /** Owning tray id ("" for the legacy default instance). */
  trayId?: string;
  button?: "left" | "right";
  clickCount?: number;
  double?: boolean;
  x?: number;
  y?: number;
}

/** Tray payload for `TrayController.apply`. */
export interface TrayPayload {
  title?: string;
  /** Explicit multi-instance id ("" / omitted = the legacy default). */
  id?: string;
  tooltip?: string;
  /** Icon file path. */
  icon?: string;
  /** Host image registry id (from `plugin:image|*`) — wins over `icon`. */
  image_id?: number | string;
  /** Registered menu id to attach (from `plugin:menu|create`). */
  menuId?: string;
  /** Show/hide the status item (macOS `visible` property). */
  visible?: boolean;
  /** Mark the current icon as a template image (light/dark adaptive). */
  asTemplate?: boolean;
}

/** System tray controller provided by the runtime backend. */
export interface TrayController {
  apply(op: TrayOp, payload?: TrayPayload): void;
  /** Whether an instance with this id exists (G5/B9 multi-instance). */
  getById?(id: string): boolean | Promise<boolean>;
  onEvent(cb: (event: TrayEventPayload) => void): void;
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
  /** Shortcut displayed on the item ("CmdOrCtrl+Shift+K"; parsed host-side). */
  accelerator?: string;
  /** Predefined system behavior: separator/copy/cut/paste/selectAll/undo/redo/minimize/maximize/fullscreen/hide/hideOthers/showAll/closeWindow/quit/about/bringAllToFront. */
  predefined?: string;
  /** Nested submenu items. */
  /** Stock native icon kind (Tauri NativeIcon name; host maps NSImageName). */
  icon?: string;
  children?: MenuItemConfig[];
}

/** A menu composed of items. */
export interface MenuConfig {
  id: string;
  items: MenuItemConfig[];
}

/** Structured child snapshot served by `plugin:menu|items` (upstream items()). */
export type MenuItemsSnapshot = Array<{
  id: string;
  menuId: string;
  title: string;
  enabled: boolean;
  checked: boolean;
  separator: boolean;
  hasSubmenu: boolean;
}>;

/** A physical display (translated from tao's Monitor). */
export interface MonitorInfo {
  name: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Usable area (excludes menu bar / dock). */
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

/** Menu controller provided by the runtime backend. */
export interface MenuController {
  createMenu(menu: MenuConfig): void;
  setAsAppMenu(menuId: string): void;
  destroyMenu(menuId: string): void;
  setItemEnabled(menuId: string, itemId: string, enabled: boolean): void;
  setItemTitle(menuId: string, itemId: string, title: string): void;
  /** Sets the state mark of a check/radio item. */
  setItemChecked(menuId: string, itemId: string, checked: boolean): void;
  /** Sets the item shortcut ("CmdOrCtrl+K" — parsed host-side). */
  setItemAccelerator(menuId: string, itemId: string, accelerator: string): void;
  /** Pops the menu as a context menu at window coords (omitted = cursor). */
  popup(menuId: string, x?: number, y?: number): void;
  /** Appends / inserts an item at runtime (at omitted = end). */
  addItem(
    menuId: string,
    item: MenuItemConfig,
    at?: number,
  ): void;
  /** Removes a runtime item by id. */
  removeItem(menuId: string, itemId: string): void;
  /** Removes a runtime item by structural index (upstream removeAt). */
  removeItemAt?(menuId: string, index: number): void;
  /** Attaches a child menu as a submenu item (runtime Submenu creation). */
  addSubmenu?(menuId: string, childId: string, text: string): void;
  /** Structured snapshot of every child of this menu (upstream items()). */
  items?(menuId: string): Promise<MenuItemsSnapshot>;
  /** Builds the standard platform application menu under one root id. */
  createDefaultMenu?(menuId: string): void;
  /** Mounts the menu as one window's own menu bar. */
  setAsWindowMenu?(menuId: string, label: string): void;
  /** NSApp windows-menu role (Window submenu routing). */
  setAsWindowsMenuForNSApp?(menuId: string): void;
  /** NSApp help-menu role (Help submenu routing). */
  setAsHelpMenuForNSApp?(menuId: string): void;
  /** Sets a stock native icon on an existing item. */
  setItemIcon?(menuId: string, itemId: string, icon: string): void;
  /** Reads item state: {enabled, checked, title} or null when absent. */
  getItemInfo(
    menuId: string,
    itemId: string,
  ): Promise<{ enabled: boolean; checked: boolean; title: string } | null>;
  onEvent(cb: (event: { menuId: string; itemId: string }) => void): void;
}

/** Native open-dialog options. */
export interface OpenDialogOptions {
  title?: string;
  directory?: boolean;
  multiple?: boolean;
  /** Upstream parity: allowed extensions, e.g. ["png","jpg"]. */
  filters?: string[];
  /** Max selectable files (>1 enables multi-select). */
  maxFiles?: number;
  /** Save/create-directories permission (NSSavePanel semantics). */
  canCreateDirectories?: boolean;
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
  /** Alert severity: "info" (default) | "warning" | "error". */
  kind?: "info" | "warning" | "error";
}

/** Native dialog controller provided by the runtime backend. */
export interface DialogController {
  /** maxFiles>1 may resolve an array of paths (upstream shape). */
  open(options: OpenDialogOptions): Promise<string | string[] | null>;
  save(options: SaveDialogOptions): Promise<string | null>;
  message(options: MessageDialogOptions): Promise<number>;
  /** OK/Cancel alert — resolves true when confirmed (Tauri `ask`). */
  ask(options: MessageDialogOptions): Promise<boolean>;
  /** OK/Cancel alert — resolves true when confirmed (Tauri `confirm`). */
  confirm(options: MessageDialogOptions): Promise<boolean>;
}

/** Clipboard controller provided by the runtime backend. */
export interface ClipboardController {
  readText(): Promise<string | null>;
  writeText(text: string): void;
  /** Reads the clipboard HTML flavor; null when not present. */
  readHtml(): Promise<string | null>;
  /** Writes HTML to the clipboard (with a plain-text fallback). */
  writeHtml(html: string): Promise<void>;
  /** Reads the clipboard image as PNG bytes (base64) — null when the
   * clipboard holds no image. */
  readImage(): Promise<{ base64: string } | null>;
  /** Writes an image to the clipboard — either base64 PNG bytes or a
   * registered image id (from `plugin:image|*`). */
  writeImage(image: { base64?: string; rid?: number }): Promise<void>;
  /** Clears the clipboard contents. */
  clear(): Promise<void>;
}

/** Native notification options (translated from Tauri's notification plugin). */
export interface NotificationOptions {
  title: string;
  body?: string;
}

/** Native notification controller provided by the runtime backend. */
export interface NotificationController {
  send(options: NotificationOptions): void;
  /** Whether the OS has authorized notifications for this app. */
  isPermissionGranted(): Promise<boolean>;
  /** Prompts the user (once); resolves to the grant result. */
  requestPermission(): Promise<boolean>;
}

/** Global shortcut controller provided by the runtime backend. */
export interface GlobalShortcutController {
  register(id: string, accelerator: string): Promise<boolean>;
  unregister(id: string): Promise<boolean>;
  /** Whether a shortcut with this id is currently registered. */
  isRegistered(id: string): Promise<boolean>;
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
  /** Host-decoded RGBA pixels (b64) for PNG/path-loaded images. */
  rgba?(id: number): Promise<string | null>;
  /** Host-decoded pixel dims for PNG/path-loaded images. */
  dims?(id: number): Promise<{ width: number; height: number } | null>;
}

/** Application-level (whole-app) visibility control — Tauri `AppHandle::show/hide`
    and macOS Dock visibility (`core:app` surface). */
export interface ApplicationController {
  /** Shows the whole application (macOS: unhide + activate). */
  show(): void;
  /** Hides the whole application (macOS: NSApp hide:). */
  hide(): void;
  /** Toggles the Dock icon (macOS activation policy Regular/Accessory). */
  setDockVisibility(visible: boolean): void;
}

/** A factory for creating windows on the current platform. */
export interface RuntimeAdapter {
  createWindow(config: WindowConfig): WebviewHandle;
  /** Optional whole-app visibility support (app show/hide/Dock). */
  application?: ApplicationController;
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
