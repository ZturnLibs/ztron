/**
 * Host adapter (Plan A) — connects the Ztron backend to the native `ztron-host`
 * process over a newline-delimited JSON TCP stream.
 *
 * The backend runs in txiki.js with a fully functional event loop, so async
 * commands work. Implements the same `RuntimeAdapter` / `WebviewHandle`
 * contract as the FFI adapter.
 */
import type {
  ClipboardController,
  DeepLinkController,
  DialogController,
  GlobalShortcutController,
  MenuController,
  NotificationController,
  RuntimeAdapter,
  TrayController,
  WebviewHandle,
  WindowConfig,
  WindowEvent,
  WindowFrame,
  WindowStateOp,
} from "@ztron/core";
import type { TjsSocket } from "./tjs-global.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Message protocol shared with `native/host/host.c`. */
type WireMessage = {
  type: string;
  [key: string]: unknown;
};

export interface HostRuntimeOptions {
  host?: string;
  port: number;
}

export class HostWebviewHandle implements WebviewHandle {
  #rt: HostRuntime;
  readonly label: string;
  #onMessage: ((id: string, req: string) => void) | null = null;
  #onWindowEvent: ((event: WindowEvent) => void) | null = null;

  constructor(rt: HostRuntime, label: string) {
    this.#rt = rt;
    this.label = label;
  }

  loadUrl(url: string): void {
    this.#rt.send({ type: "navigate", label: this.label, url });
  }

  loadHtml(html: string): void {
    this.#rt.send({ type: "set_html", label: this.label, html });
  }

  eval(js: string): void {
    this.#rt.send({ type: "eval", label: this.label, js });
  }

  setTitle(title: string): void {
    this.#rt.send({ type: "set_title", label: this.label, title });
  }

  setSize(width: number, height: number): void {
    this.#rt.send({ type: "set_size", label: this.label, width, height });
  }

  getFrame(): Promise<WindowFrame | null> {
    return this.#rt.sendRequest("window_get_frame").then((r) => {
      if (r && typeof r === "object") {
        const f = r as Record<string, unknown>;
        return {
          x: Number(f.x ?? 0),
          y: Number(f.y ?? 0),
          width: Number(f.width ?? 0),
          height: Number(f.height ?? 0),
        };
      }
      return null;
    });
  }

  getWindowState(): Promise<import("@ztron/core").WindowStateSnapshot | null> {
    return this.#rt.sendRequest("window_get_state").then((r) => {
      if (r && typeof r === "object") {
        const s = r as Record<string, unknown>;
        return {
          maximized: s.maximized === true,
          minimized: s.minimized === true,
          fullscreen: s.fullscreen === true,
          alwaysOnTop: s.always_on_top === true,
          visible: s.visible === true,
          resizable: s.resizable === true,
        };
      }
      return null;
    });
  }

  getWindowTitle(): Promise<string | null> {
    return this.#rt
      .sendRequest("window_get_title")
      .then((r) => (typeof r === "string" ? r : null));
  }

  getTheme(): Promise<string | null> {
    return this.#rt
      .sendRequest("window_get_theme")
      .then((r) => (typeof r === "string" ? r : null));
  }

  getScaleFactor(): Promise<number | null> {
    return this.#rt.sendRequest("window_get_scale_factor").then((r) => {
      const n = Number(r);
      return Number.isFinite(n) ? n : null;
    });
  }

  setIgnoreCursorEvents(ignore: boolean): void {
    this.#rt.send({
      type: "set_ignore_cursor_events",
      label: this.label,
      value: ignore,
    });
  }

  setCursor(cursor: string): void {
    this.#rt.send({ type: "set_cursor", label: this.label, cursor });
  }

  setZoom(zoom: number): void {
    this.#rt.send({ type: "set_zoom", label: this.label, zoom });
  }

  setPosition(x: number, y: number): void {
    this.#rt.send({ type: "window_set_position", label: this.label, x, y });
  }

  setBounds(x: number, y: number, width: number, height: number): void {
    this.#rt.send({
      type: "window_set_bounds",
      label: this.label,
      x,
      y,
      width,
      height,
    });
  }

  setOpacity(opacity: number): void {
    this.#rt.send({ type: "set_opacity", label: this.label, opacity });
  }

  startDragging(): void {
    this.#rt.send({ type: "start_dragging", label: this.label });
  }

  windowState(op: WindowStateOp, value?: boolean): boolean | Promise<boolean> {
    const query = op.startsWith("is_");
    if (query) {
      return this.#rt.sendQuery(op);
    }
    this.#rt.send({ type: op, label: this.label, value: Boolean(value) });
    return true;
  }

  onWindowEvent(cb: (event: WindowEvent) => void): void {
    this.#onWindowEvent = cb;
  }

  respond(id: string, status: number, result: string): void {
    this.#rt.send({ type: "response", label: this.label, id, status, result });
  }

  onMessage(cb: (id: string, req: string) => void): void {
    this.#onMessage = cb;
  }

  /** Under Plan A the backend does not drive the GUI; keep alive until quit. */
  run(): Promise<void> {
    return this.#rt.closed;
  }

  terminate(): void {
    this.#rt.send({ type: "quit" });
  }

  close(): void {
    this.#rt.send({ type: "close", label: this.label });
  }

  handleRequest(id: string, req: unknown): void {
    // The WebviewHandle contract passes `req` as a JSON-array string
    // (same shape as the webview bind callback); re-serialize the parsed array.
    this.#onMessage?.(id, JSON.stringify(req));
  }

  handleWindowEvent(event: WindowEvent): void {
    this.#onWindowEvent?.(event);
  }
}

export class HostRuntime implements RuntimeAdapter {
  #host: string;
  #port: number;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #pending: WireMessage[] = [];
  #handles = new Map<string, HostWebviewHandle>();
  #requests = new Map<number, (result: unknown) => void>();
  #nextReqId = 1;
  #trayEventCb: ((event: "click") => void) | null = null;
  #menuEventCb: ((event: { menuId: string; itemId: string }) => void) | null =
    null;
  #shortcutEventCb: ((event: { shortcutId: string }) => void) | null = null;
  #deepLinkCb: ((url: string) => void) | null = null;
  #lastDeepLink: string | null = null;
  #closedResolve: (() => void) | null = null;
  readonly closed: Promise<void>;

  /** System tray controller (implements `RuntimeAdapter.tray`). */
  readonly tray: TrayController = {
    apply: (op, payload) => {
      switch (op) {
        case "create":
          this.send({ type: "tray_create", title: payload?.title ?? "" });
          break;
        case "set_title":
          this.send({ type: "tray_set_title", title: payload?.title ?? "" });
          break;
        case "set_tooltip":
          this.send({
            type: "tray_set_tooltip",
            tooltip: payload?.tooltip ?? "",
          });
          break;
        case "set_icon":
          this.send({
            type: "tray_set_icon",
            icon: payload?.icon ?? "",
          });
          break;
        case "destroy":
          this.send({ type: "tray_destroy" });
          break;
      }
    },
    onEvent: (cb) => {
      this.#trayEventCb = cb;
    },
  };

  /** Application menu controller (implements `RuntimeAdapter.menu`). */
  readonly menu: MenuController = {
    createMenu: (menu) => {
      const addItems = (
        menuId: string,
        items: import("@ztron/core").MenuItemConfig[],
      ) => {
        for (const item of items) {
          if (item.children?.length) {
            const submenuId = `${menuId}.${item.id}`;
            this.send({
              type: "menu_add_submenu_item",
              menu_id: menuId,
              text: item.text,
              submenu: submenuId,
            });
            addItems(submenuId, item.children);
          } else {
            this.send({
              type: "menu_add_item",
              menu_id: menuId,
              item_id: item.id,
              text: item.text,
              enabled: item.enabled ?? true,
              separator: item.separator ?? false,
              checked:
                item.type === "check" || item.type === "radio"
                  ? item.checked
                    ? 1
                    : 0
                  : -1,
            });
          }
        }
      };
      this.send({ type: "menu_create", menu_id: menu.id });
      addItems(menu.id, menu.items);
    },
    setAsAppMenu: (menuId) => {
      this.send({ type: "menu_set_app", menu_id: menuId });
    },
    destroyMenu: (menuId) => {
      this.send({ type: "menu_destroy", menu_id: menuId });
    },
    setItemEnabled: (menuId, itemId, enabled) => {
      this.send({
        type: "menu_item_set_enabled",
        menu_id: menuId,
        item_id: itemId,
        enabled,
      });
    },
    setItemTitle: (menuId, itemId, title) => {
      this.send({
        type: "menu_item_set_title",
        menu_id: menuId,
        item_id: itemId,
        text: title, // `title` would collide with item_id on the wire (m->id)
      });
    },
    onEvent: (cb) => {
      this.#menuEventCb = cb;
    },
  };

  /** Native dialog controller (implements `RuntimeAdapter.dialog`). */
  readonly dialog: DialogController = {
    open: (options) =>
      this.sendRequest("dialog_open", {
        title: options.title ?? "Open",
        directory: options.directory ?? false,
      }).then((r) => (typeof r === "string" ? r : null)),
    save: (options) =>
      this.sendRequest("dialog_save", {
        title: options.title ?? "Save",
        default_name: options.defaultName ?? "",
      }).then((r) => (typeof r === "string" ? r : null)),
    message: (options) =>
      this.sendRequest("dialog_message", {
        title: options.title,
        message: options.message ?? "",
      }).then((r) => Number(r)),
  };

  /** Clipboard controller (implements `RuntimeAdapter.clipboard`). */
  readonly clipboard: ClipboardController = {
    readText: () =>
      this.sendRequest("clipboard_read_text").then((r) =>
        typeof r === "string" ? r : null,
      ),
    writeText: (text) => {
      this.send({ type: "clipboard_write_text", label: "main", text });
    },
  };

  /** Notification controller (implements `RuntimeAdapter.notification`). */
  readonly notification: NotificationController = {
    send: ({ title, body }) => {
      this.send({
        type: "notification_send",
        label: "main",
        title,
        message: body ?? "",
      });
    },
  };

  /** Global shortcut controller (implements `RuntimeAdapter.globalShortcut`). */
  readonly globalShortcut: GlobalShortcutController = {
    register: (id, accelerator) =>
      this.sendRequest("shortcut_register", { id, accelerator }).then(
        (r) => r === true,
      ),
    unregister: (id) =>
      this.sendRequest("shortcut_unregister", { id }).then((r) => r === true),
    onEvent: (cb) => {
      this.#shortcutEventCb = cb;
    },
  };

  /** Deep-link controller (implements `RuntimeAdapter.deepLink`). */
  readonly deepLink: DeepLinkController = {
    onEvent: (cb) => {
      this.#deepLinkCb = cb;
    },
    getLastUrl: () => this.#lastDeepLink,
  };

  /** Process controller (implements `RuntimeAdapter.process`). */
  readonly process: import("@ztron/core").ProcessController = {
    exit: (code) => {
      this.send({ type: "app_exit", label: "main", status: code ?? 0 });
    },
    relaunch: () => {
      this.send({ type: "app_relaunch", label: "main" });
    },
  };

  constructor(options: HostRuntimeOptions) {
    this.#host = options.host ?? "127.0.0.1";
    this.#port = options.port;
    this.closed = new Promise((resolve) => {
      this.#closedResolve = resolve;
    });
  }

  /** Connects to the host and starts the line reader. */
  async connect(): Promise<void> {
    const socket = await tjs.connect("tcp", this.#host, this.#port);
    const streams = socket.readable ? socket : await socket.opened;
    if (!streams) {
      throw new Error("host socket has no streams");
    }
    this.#writer = streams.writable.getWriter();
    for (const msg of this.#pending.splice(0)) {
      this.#sendNow(msg);
    }
    this.#readLoop(streams.readable.getReader());
  }

  async #readLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          this.#onLine(line);
          nl = buf.indexOf("\n");
        }
      }
    } catch {
      /* host disconnected */
    }
    this.#closedResolve?.();
  }

  #onLine(line: string): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(line) as WireMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "request": {
        const label = String(msg.label ?? "main");
        const handle = this.#handles.get(label);
        handle?.handleRequest(String(msg.id), msg.req);
        break;
      }
      case "window_event": {
        const label = String(msg.label ?? "main");
        const handle = this.#handles.get(label);
        handle?.handleWindowEvent(String(msg.event) as WindowEvent);
        break;
      }
      case "tray_event": {
        this.#trayEventCb?.(String(msg.event) as "click");
        break;
      }
      case "menu_event": {
        this.#menuEventCb?.({
          menuId: String(msg.menu_id),
          itemId: String(msg.item_id),
        });
        break;
      }
      case "shortcut_event": {
        this.#shortcutEventCb?.({ shortcutId: String(msg.shortcut_id) });
        break;
      }
      case "deep_link": {
        this.#lastDeepLink = String(msg.url ?? "");
        this.#deepLinkCb?.(this.#lastDeepLink);
        break;
      }
      case "query_result": {
        const id = Number(msg.req_id);
        const resolve = this.#requests.get(id);
        if (resolve) {
          this.#requests.delete(id);
          resolve(msg.result);
        }
        break;
      }
      case "quit":
      case "closed": {
        this.#closedResolve?.();
        break;
      }
    }
  }

  /** Sends a fire-and-forget message. */
  send(msg: WireMessage): void {
    if (this.#writer) {
      this.#sendNow(msg);
    } else {
      this.#pending.push(msg);
    }
  }

  /**
   * Sends a request to the host and awaits its `query_result` reply.
   * The host replies with an arbitrary JSON value.
   */
  sendRequest(
    op: string,
    payload: Record<string, unknown> = {},
  ): Promise<unknown> {
    const id = this.#nextReqId++;
    return new Promise<unknown>((resolve) => {
      this.#requests.set(id, resolve);
      this.send({ type: op, label: "main", req_id: id, ...payload });
    });
  }

  /** Window-state query (the host replies with a boolean). */
  sendQuery(op: WindowStateOp): Promise<boolean> {
    return this.sendRequest(op).then((r) => r === true);
  }

  #sendNow(msg: WireMessage): void {
    void this.#writer
      ?.write(enc.encode(JSON.stringify(msg) + "\n"))
      .catch((e) =>
        console.log("[be-send:ERR]", msg.type, String(e).slice(0, 60)),
      );
  }

  createWindow(config: WindowConfig): WebviewHandle {
    const handle = new HostWebviewHandle(this, config.label);
    this.#handles.set(config.label, handle);
    this.send({
      type: "create_window",
      label: config.label,
      title: config.title,
      width: config.width,
      height: config.height,
      debug: Boolean(config.debug),
    });
    return handle;
  }

  dispose(): void {
    this.#closedResolve?.();
  }
}
