/**
 * Mock runtime — test infrastructure for unit-testing commands without a real
 * window or host process. Mirrors the role of Tauri's `tauri::test`.
 *
 * Usage:
 * ```ts
 * const mock = new MockRuntime();
 * const app = new AppBuilder(mock, "test").setup(...).build();
 * const result = await mock.invoke("my:command", { ... });
 * expect(result).toEqual(...);
 * ```
 */
import type {
  DeepLinkController,
  GlobalShortcutController,
  RuntimeAdapter,
  WebviewHandle,
  WindowConfig,
  WindowEvent,
  WindowFrame,
  WindowStateOp,
} from "../runtime.js";
import { unwrapRawResponse } from "../ipc/raw.js";

/** A mock WebviewHandle that records calls and lets tests drive responses. */
export class MockWebviewHandle implements WebviewHandle {
  readonly label: string;
  evalLog: string[] = [];
  respondLog: Array<{ id: string; status: number; result: string }> = [];
  titleLog: string[] = [];
  sizeLog: Array<{ w: number; h: number }> = [];
  positionLog: Array<{ x: number; y: number }> = [];
  boundsLog: Array<{ x: number; y: number; w: number; h: number }> = [];
  windowStateLog: Array<{ op: WindowStateOp; value?: boolean }> = [];
  /** Return values for `is_*` window-state queries. */
  windowStateValues: Partial<Record<WindowStateOp, boolean>> = {};
  windowEventLog: WindowEvent[] = [];
  terminated = false;
  loadedUrl: string | null = null;
  loadedHtml: string | null = null;

  #onMessage: ((id: string, req: string) => void) | null = null;
  #onWindowEvent:
    | ((event: WindowEvent, payload?: unknown) => void)
    | null = null;

  constructor(label = "main") {
    this.label = label;
  }

  loadUrl(url: string): void {
    this.loadedUrl = url;
  }

  loadHtml(html: string): void {
    this.loadedHtml = html;
  }

  eval(js: string): void {
    this.evalLog.push(js);
  }

  setTitle(title: string): void {
    this.titleLog.push(title);
  }

  setSize(w: number, h: number): void {
    this.sizeLog.push({ w, h });
    this.frame.width = w;
    this.frame.height = h;
  }

  frame: WindowFrame = { x: 100, y: 120, width: 900, height: 640 };

  getFrame(): Promise<WindowFrame | null> {
    return Promise.resolve({ ...this.frame });
  }

  stateSnapshot: {
    maximized: boolean;
    minimized: boolean;
    fullscreen: boolean;
    alwaysOnTop: boolean;
    visible: boolean;
    resizable: boolean;
  } = {
    maximized: false,
    minimized: false,
    fullscreen: false,
    alwaysOnTop: false,
    visible: true,
    resizable: true,
  };

  getWindowState() {
    return Promise.resolve({ ...this.stateSnapshot });
  }

  windowTitle = "t";

  getWindowTitle(): Promise<string | null> {
    return Promise.resolve(this.windowTitle);
  }

  theme: string = "light";
  scaleFactor: number = 1;

  getTheme(): Promise<string | null> {
    return Promise.resolve(this.theme);
  }

  getScaleFactor(): Promise<number | null> {
    return Promise.resolve(this.scaleFactor);
  }

  ignoreCursorEventsLog: boolean[] = [];

  setIgnoreCursorEvents(ignore: boolean): void {
    this.ignoreCursorEventsLog.push(ignore);
  }

  cursorLog: string[] = [];

  setCursor(cursor: string): void {
    this.cursorLog.push(cursor);
  }

  zoomLog: number[] = [];

  setZoom(zoom: number): void {
    this.zoomLog.push(zoom);
  }

  destroyCount = 0;

  destroy(): void {
    this.destroyCount += 1;
  }

  setPosition(x: number, y: number): void {
    this.positionLog.push({ x, y });
    this.frame.x = x;
    this.frame.y = y;
  }

  setBounds(x: number, y: number, width: number, height: number): void {
    this.boundsLog.push({ x, y, w: width, h: height });
    this.frame = { x, y, width, height };
  }

  minSizeLog: Array<{ w: number; h: number }> = [];
  maxSizeLog: Array<{ w: number; h: number }> = [];

  setMinSize(width: number, height: number): void {
    this.minSizeLog.push({ w: width, h: height });
  }

  setMaxSize(width: number, height: number): void {
    this.maxSizeLog.push({ w: width, h: height });
  }

  progressBarLog: Array<number | null> = [];

  setProgressBar(progress: number | null): void {
    this.progressBarLog.push(progress);
  }

  badgeCountLog: Array<number | null> = [];
  badgeLabelLog: Array<string | null> = [];

  setBadgeCount(count: number | null): void {
    this.badgeCountLog.push(count);
  }

  setBadgeLabel(label: string | null): void {
    this.badgeLabelLog.push(label);
  }

  backgroundColorLog: string[] = [];
  titleBarStyleLog: string[] = [];

  setBackgroundColor(color: string): void {
    this.backgroundColorLog.push(color);
  }

  setTitleBarStyle(style: "visible" | "transparent" | "overlay"): void {
    this.titleBarStyleLog.push(style);
  }

  themeLog: Array<"dark" | "light" | null> = [];

  setTheme(theme: "dark" | "light" | null): void {
    this.themeLog.push(theme);
  }

  innerSizeValue: { width: number; height: number } | null = null;

  getInnerSize(): Promise<{ width: number; height: number } | null> {
    return Promise.resolve(this.innerSizeValue);
  }

  cursorPositionValue: { x: number; y: number } | null = null;

  getCursorPosition(): Promise<{ x: number; y: number } | null> {
    return Promise.resolve(this.cursorPositionValue);
  }

  cursorPositionLog: Array<{ x: number; y: number }> = [];

  setCursorPosition(x: number, y: number): void {
    this.cursorPositionLog.push({ x, y });
  }

  clearDataCount = 0;

  clearBrowsingData(): void {
    this.clearDataCount++;
  }

  trafficLightLog: Array<{ x: number; y: number }> = [];

  setTrafficLightPosition(x: number, y: number): void {
    this.trafficLightLog.push({ x, y });
  }

  monitorsValue: import("../runtime.js").MonitorInfo[] | null = null;

  queryMonitors(
    kind: "all" | "primary" | "current" | "point",
    x?: number,
    y?: number,
  ): Promise<import("../runtime.js").MonitorInfo[] | null> {
    this.monitorQueries.push({ kind, x, y });
    return Promise.resolve(this.monitorsValue);
  }

  monitorQueries: Array<{
    kind: string;
    x?: number;
    y?: number;
  }> = [];

  opacityLog: number[] = [];

  setOpacity(opacity: number): void {
    this.opacityLog.push(opacity);
  }

  dragCount = 0;
  resizeDragLog: string[] = [];

  startDragging(): void {
    this.dragCount += 1;
  }

  startResizeDragging(direction: string): void {
    this.resizeDragLog.push(direction);
  }

  iconLog: Array<{ kind: string; id?: number }> = [];
  setIcon(imageId: number): void {
    this.iconLog.push({ kind: "icon", id: imageId });
  }

  setOverlayIcon(imageId: number): void {
    this.iconLog.push({ kind: "overlay", id: imageId });
  }

  windowState(op: WindowStateOp, value?: boolean): boolean | Promise<boolean> {
    this.windowStateLog.push({ op, value });
    if (op.startsWith("is_")) {
      return this.windowStateValues[op] ?? false;
    }
    return true;
  }

  onWindowEvent(
    cb: (event: WindowEvent, payload?: unknown) => void,
  ): void {
    this.#onWindowEvent = cb;
  }

  respond(id: string, status: number, result: string): void {
    this.respondLog.push({ id, status, result });
  }

  onMessage(cb: (id: string, req: string) => void): void {
    this.#onMessage = cb;
  }

  run(): Promise<void> {
    return new Promise(() => {});
  }

  terminate(): void {
    this.terminated = true;
  }

  close(): void {}

  /** Simulates the frontend invoking a command: the webview library glue
   * JSON.parse(s) the result and the injected invoke unwraps raw envelopes
   * (mirrors the real frontend path — see ipc/raw.ts + inject/build.ts). */
  async invoke(cmd: string, args: unknown = {}): Promise<unknown> {
    const req = JSON.stringify([{ cmd, payload: args }]);
    const id = `mock-${Date.now()}`;
    return new Promise((resolve) => {
      const origRespond = this.respond.bind(this);
      this.respond = (rid: string, status: number, result: string) => {
        this.respondLog.push({ id: rid, status, result });
        if (rid === id) {
          this.respond = origRespond;
          resolve(
            status === 0
              ? unwrapRawResponse(JSON.parse(result || "null"))
              : Promise.reject(JSON.parse(result)),
          );
        }
      };
      this.#onMessage?.(id, req);
    });
  }

  /** Simulates a window event firing. */
  emitWindowEvent(event: WindowEvent, payload?: unknown): void {
    this.windowEventLog.push(event);
    this.#onWindowEvent?.(event, payload);
  }
}

/** A mock RuntimeAdapter for tests. */
export class MockRuntime implements RuntimeAdapter {
  handles: MockWebviewHandle[] = [];
  shortcutRegisters: Array<{ id: string; accelerator: string }> = [];
  shortcutUnregisters: string[] = [];

  /** Records global-shortcut register/unregister calls. */
  readonly globalShortcut: GlobalShortcutController = {
    register: (id, accelerator) => {
      this.shortcutRegisters.push({ id, accelerator });
      return Promise.resolve(true);
    },
    unregister: (id) => {
      this.shortcutUnregisters.push(id);
      return Promise.resolve(true);
    },
    isRegistered: (id) =>
      Promise.resolve(
        this.shortcutRegisters.some((r) => r.id === id) &&
          !this.shortcutUnregisters.includes(id),
      ),
    onEvent: () => {},
  };

  deepLink: DeepLinkController = {
    onEvent: () => {},
    getLastUrl: () => null,
  };

  exitLog: number[] = [];
  /** Monotonic image-id source (mirrors real registries issuing fresh rids). */
  private nextImageId = 0;  imageLog: Array<{ kind: string; id?: number }> = [];
  readonly image: import("../runtime.js").ImageController = {
    fromBytes: async () => {
      this.imageLog.push({ kind: "bytes" });
      return ++this.nextImageId;
    },
    fromPath: async () => {
      this.imageLog.push({ kind: "path" });
      return ++this.nextImageId;
    },
    destroy: (id) => {
      this.imageLog.push({ kind: "destroy", id });
    },
  };
  /** Whole-app visibility ops (`plugin:app|show/hide/set_dock_visibility`). */
  appLifecycleLog: Array<{ kind: string; visible?: boolean }> = [];
  readonly application: import("../runtime.js").ApplicationController = {
    show: () => {
      this.appLifecycleLog.push({ kind: "show" });
    },
    hide: () => {
      this.appLifecycleLog.push({ kind: "hide" });
    },
    setDockVisibility: (visible) => {
      this.appLifecycleLog.push({ kind: "dock", visible });
    },
  };
  relaunchCount = 0;

  readonly process: import("../runtime.js").ProcessController = {
    exit: (code) => {
      this.exitLog.push(code ?? 0);
    },
    relaunch: () => {
      this.relaunchCount += 1;
    },
  };

  trayLog: Array<{ op: string; payload?: unknown }> = [];
  readonly tray: import("../runtime.js").TrayController = {
    apply: (op, payload) => {
      this.trayLog.push({ op, payload });
    },
    getById: (id) => {
      this.trayLog.push({ op: "get_by_id", payload: { id } });
      return false;
    },
    onEvent: () => {},
  };

  menuLog: Array<{ op: string; payload?: unknown }> = [];
  itemInfoValue: { enabled: boolean; checked: boolean; title: string } | null =
    null;
  readonly menu: import("../runtime.js").MenuController = {
    createMenu: (menu) => {
      this.menuLog.push({ op: "create", payload: menu });
    },
    setAsAppMenu: (menuId) => {
      this.menuLog.push({ op: "set_as_app_menu", payload: { menuId } });
    },
    destroyMenu: (menuId) => {
      this.menuLog.push({ op: "destroy", payload: { menuId } });
    },
    setItemEnabled: (menuId, itemId, enabled) => {
      this.menuLog.push({
        op: "set_item_enabled",
        payload: { menuId, itemId, enabled },
      });
    },
    setItemTitle: (menuId, itemId, title) => {
      this.menuLog.push({
        op: "set_item_title",
        payload: { menuId, itemId, title },
      });
    },
    setItemChecked: (menuId, itemId, checked) => {
      this.menuLog.push({
        op: "set_item_checked",
        payload: { menuId, itemId, checked },
      });
    },
    setItemAccelerator: (menuId, itemId, accelerator) => {
      this.menuLog.push({
        op: "set_item_accel",
        payload: { menuId, itemId, accelerator },
      });
    },
    popup: (menuId, x, y) => {
      this.menuLog.push({ op: "popup", payload: { menuId, x, y } });
    },
    addItem: (menuId, item, at) => {
      this.menuLog.push({ op: at == null ? "add_item" : "insert_item", payload: { menuId, item, at } });
    },
    removeItem: (menuId, itemId) => {
      this.menuLog.push({ op: "remove_item", payload: { menuId, itemId } });
    },
    getItemInfo: (menuId, itemId) => {
      this.menuLog.push({ op: "item_info", payload: { menuId, itemId } });
      return Promise.resolve(this.itemInfoValue);
    },
    onEvent: () => {},
    removeItemAt: (menuId, index) => {
      this.menuLog.push({ op: "remove_at", payload: { menuId, index } });
    },
    items: async () => [],
    createDefaultMenu: (menuId) => {
      this.menuLog.push({ op: "create_default", payload: { menuId } });
    },
    setAsWindowMenu: (menuId, label) => {
      this.menuLog.push({ op: "set_as_window_menu", payload: { menuId, label } });
    },
    setAsWindowsMenuForNSApp: (menuId) => {
      this.menuLog.push({
        op: "set_as_windows_menu_for_nsapp",
        payload: { menuId },
      });
    },
    setAsHelpMenuForNSApp: (menuId) => {
      this.menuLog.push({
        op: "set_as_help_menu_for_nsapp",
        payload: { menuId },
      });
    },
    setItemIcon: (menuId, itemId, icon) => {
      this.menuLog.push({ op: "set_icon", payload: { menuId, itemId, icon } });
    },
  };

  dialogLog: Array<{ kind: string; options?: unknown }> = [];
  readonly dialog: import("../runtime.js").DialogController = {
    open: (options) => {
      this.dialogLog.push({ kind: "open", options });
      return Promise.resolve(null);
    },
    save: (options) => {
      this.dialogLog.push({ kind: "save", options });
      return Promise.resolve(null);
    },
    message: (options) => {
      this.dialogLog.push({ kind: "message", options });
      return Promise.resolve(0);
    },
    ask: (options) => {
      this.dialogLog.push({ kind: "ask", options });
      return Promise.resolve(true);
    },
    confirm: (options) => {
      this.dialogLog.push({ kind: "confirm", options });
      return Promise.resolve(true);
    },
  };

  clipboardLog: Array<{ kind: string; text?: string }> = [];
  /** Simulated clipboard image state ({base64} | {rid} | null). */
  clipImage: { base64?: string; rid?: number } | null = null;
  /** Simulated clipboard HTML flavor. */
  clipHtml: string | null = null;
  readonly clipboard: import("../runtime.js").ClipboardController = {
    readText: () => {
      this.clipboardLog.push({ kind: "read" });
      return Promise.resolve("mock-clip");
    },
    writeText: (text) => {
      this.clipboardLog.push({ kind: "write", text });
    },
    readHtml: () => {
      this.clipboardLog.push({ kind: "read_html" });
      return Promise.resolve(this.clipHtml);
    },
    writeHtml: (html) => {
      this.clipHtml = html;
      this.clipboardLog.push({ kind: "write_html", text: html });
      return Promise.resolve();
    },
    readImage: () => {
      this.clipboardLog.push({ kind: "read_image" });
      const img = this.clipImage;
      return Promise.resolve(
        img && typeof img.base64 === "string" ? { base64: img.base64 } : null,
      );
    },
    writeImage: (image) => {
      this.clipImage = { ...image };
      this.clipboardLog.push({ kind: "write_image" });
      return Promise.resolve();
    },
    clear: () => {
      this.clipImage = null;
      this.clipboardLog.push({ kind: "clear" });
      return Promise.resolve();
    },
  };

  notificationLog: Array<{ title: string; body?: string }> = [];
  readonly notification: import("../runtime.js").NotificationController = {
    send: (options) => {
      this.notificationLog.push(options);
    },
    isPermissionGranted: () => Promise.resolve(true),
    requestPermission: () => Promise.resolve(true),
  };

  createWindow(config: WindowConfig): WebviewHandle {
    const handle = new MockWebviewHandle(config.label);
    this.handles.push(handle);
    return handle;
  }

  /** Convenience: the first (primary) window handle. */
  get main(): MockWebviewHandle {
    return this.handles[0]!;
  }
}
