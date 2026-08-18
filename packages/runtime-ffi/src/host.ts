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
} from "@zturnlibs/core";
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
  #onWindowEvent:
    | ((event: WindowEvent, payload?: unknown) => void)
    | null = null;

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
    return this.#rt.sendRequest("window_get_frame", {}, this.label).then((r) => {
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

  getWindowState(): Promise<import("@zturnlibs/core").WindowStateSnapshot | null> {
    return this.#rt.sendRequest("window_get_state", {}, this.label).then((r) => {
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
      .sendRequest("window_get_title", {}, this.label)
      .then((r) => (typeof r === "string" ? r : null));
  }

  getTheme(): Promise<string | null> {
    return this.#rt
      .sendRequest("window_get_theme", {}, this.label)
      .then((r) => (typeof r === "string" ? r : null));
  }

  getScaleFactor(): Promise<number | null> {
    return this.#rt
      .sendRequest("window_get_scale_factor", {}, this.label)
      .then((r) => {
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

  destroy(): void {
    this.#rt.send({ type: "window_destroy", label: this.label });
  }

  startResizeDragging(direction: string): void {
    this.#rt.send({
      type: "start_resize_dragging",
      label: this.label,
      direction,
    });
  }

  setIcon(imageId: number): void {
    this.#rt.send({
      type: "window_set_icon",
      label: this.label,
      image_id: String(imageId),
    });
  }

  setOverlayIcon(imageId: number): void {
    this.#rt.send({
      type: "window_set_overlay_icon",
      label: this.label,
      image_id: String(imageId),
    });
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

  setMinSize(width: number, height: number): void {
    this.#rt.send({
      type: "window_set_min_size",
      label: this.label,
      width,
      height,
    });
  }

  setMaxSize(width: number, height: number): void {
    this.#rt.send({
      type: "window_set_max_size",
      label: this.label,
      width,
      height,
    });
  }

  setProgressBar(progress: number | null): void {
    /* `opacity` carries the double on the wire (shared parser slot). */
    this.#rt.send({
      type: "set_progress_bar",
      label: this.label,
      opacity: progress ?? -1,
    });
  }

  setBadgeCount(count: number | null): void {
    /* `width` carries the int on the wire (shared parser slot). */
    this.#rt.send({
      type: "set_badge_count",
      label: this.label,
      width: count ?? 0,
    });
  }

  setBadgeLabel(label: string | null): void {
    /* `text` carries the string on the wire (shared parser slot). */
    this.#rt.send({ type: "set_badge_label", label: this.label, text: label ?? "" });
  }

  setBackgroundColor(color: string): void {
    this.#rt.send({
      type: "set_background_color",
      label: this.label,
      text: color,
    });
  }

  setTitleBarStyle(style: "visible" | "transparent" | "overlay"): void {
    this.#rt.send({
      type: "set_titlebar_style",
      label: this.label,
      text: style,
    });
  }

  setTheme(theme: "dark" | "light" | null): void {
    this.#rt.send({
      type: "set_theme",
      label: this.label,
      text: theme ?? "",
    });
  }

  getInnerSize(): Promise<{ width: number; height: number } | null> {
    return this.#rt
      .sendRequest("inner_size", {}, this.label)
      .then((r) => {
        if (r && typeof r === "object") {
          const s = r as Record<string, unknown>;
          return {
            width: Number(s.width ?? 0),
            height: Number(s.height ?? 0),
          };
        }
        return null;
      });
  }

  getCursorPosition(): Promise<{ x: number; y: number } | null> {
    return this.#rt
      .sendRequest("cursor_position", {}, this.label)
      .then((r) => {
        if (r && typeof r === "object") {
          const p = r as Record<string, unknown>;
          return { x: Number(p.x ?? 0), y: Number(p.y ?? 0) };
        }
        return null;
      });
  }

  setCursorPosition(x: number, y: number): void {
    this.#rt.send({ type: "set_cursor_position", label: this.label, x, y });
  }

  clearBrowsingData(): void {
    this.#rt.send({ type: "webview_clear_data", label: this.label });
  }

  setTrafficLightPosition(x: number, y: number): void {
    this.#rt.send({
      type: "set_traffic_light_position",
      label: this.label,
      x,
      y,
    });
  }

  queryMonitors(
    kind: "all" | "primary" | "current" | "point",
    x?: number,
    y?: number,
  ): Promise<import("@zturnlibs/core").MonitorInfo[] | null> {
    const op =
      kind === "all"
        ? "available_monitors"
        : kind === "primary"
          ? "primary_monitor"
          : kind === "current"
            ? "current_monitor"
            : "monitor_from_point";
    return this.#rt
      .sendRequest(op, { x: x ?? 0, y: y ?? 0 }, this.label)
      .then((r) =>
        Array.isArray(r)
          ? (r as import("@zturnlibs/core").MonitorInfo[])
          : null,
      );
  }

  setOpacity(opacity: number): void {
    this.#rt.send({ type: "set_opacity", label: this.label, opacity });
  }

  startDragging(): void {
    this.#rt.send({ type: "start_dragging", label: this.label });
  }

  windowState(
    op: WindowStateOp,
    value?: boolean,
    effect?: { material?: string; state?: number; radius?: number },
  ): boolean | Promise<boolean> {
    const query = op.startsWith("is_");
    if (query) {
      return this.#rt.sendQuery(op, this.label);
    }
    this.#rt.send({
      type: op,
      label: this.label,
      value: Boolean(value),
      ...(effect?.material
        ? { text: effect.material, state: effect.state ?? -1, radius: effect.radius ?? 0 }
        : {}),
    });
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

  handleWindowEvent(
    event: WindowEvent,
    payload?: unknown,
  ): void {
    this.#onWindowEvent?.(event, payload);
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
            image_id:
              payload?.image_id != null ? String(payload.image_id) : "",
          });
          break;
        case "set_menu": {
          const menuId = String(
            (payload as { menuId?: string } | undefined)?.menuId ?? "",
          );
          if (menuId) this.send({ type: "tray_set_menu", menu_id: menuId });
          break;
        }
        case "set_visible": {
          this.send({
            type: "tray_set_visible",
            value: (payload as { visible?: boolean } | undefined)?.visible ?? true,
          });
          break;
        }
        case "set_icon_template": {
          this.send({
            type: "tray_set_icon_template",
            value:
              (payload as { asTemplate?: boolean } | undefined)?.asTemplate ?? true,
          });
          break;
        }
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
        items: import("@zturnlibs/core").MenuItemConfig[],
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
          } else if (item.predefined) {
            this.send({
              type: "menu_add_predefined",
              menu_id: menuId,
              item_id: item.id,
              text: item.predefined,
              enabled: item.enabled ?? true,
            });
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
            if (item.accelerator) {
              this.send({
                type: "menu_item_set_accel",
                menu_id: menuId,
                item_id: item.id,
                text: item.accelerator,
              });
            }
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
    setItemChecked: (menuId, itemId, checked) => {
      this.send({
        type: "menu_item_set_checked",
        menu_id: menuId,
        item_id: itemId,
        checked,
      });
    },
    setItemAccelerator: (menuId, itemId, accelerator) => {
      this.send({
        type: "menu_item_set_accel",
        menu_id: menuId,
        item_id: itemId,
        text: accelerator,
      });
    },
    popup: (menuId, x, y) => {
      this.send({
        type: "menu_popup",
        menu_id: menuId,
        label: "main",
        x: x ?? 0,
        y: y ?? 0,
      });
    },
    addItem: (menuId, item, at) => {
      if (item.predefined) {
        this.send({
          type: "menu_add_predefined",
          menu_id: menuId,
          item_id: item.id,
          text: item.predefined,
          enabled: item.enabled ?? true,
        });
      } else {
        this.send({
          type: at == null ? "menu_add_item" : "menu_insert_item",
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
          ...(at == null ? {} : { x: at }),
        });
      }
    },
    removeItem: (menuId, itemId) => {
      this.send({ type: "menu_remove_item", menu_id: menuId, item_id: itemId });
    },
    getItemInfo: (menuId, itemId) =>
      this.sendRequest("menu_item_info", { menu_id: menuId, item_id: itemId })
        .then((r) =>
          r && typeof r === "object"
            ? (r as { enabled: boolean; checked: boolean; title: string })
            : null,
        ),
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
        kind: options.kind === "error" ? 2 : options.kind === "warning" ? 1 : 0,
      }).then((r) => Number(r)),
    ask: (options) =>
      this.sendRequest("dialog_ask", {
        title: options.title,
        message: options.message ?? "",
        kind: options.kind === "error" ? 2 : options.kind === "warning" ? 1 : 0,
      }).then((r) => r === true),
    confirm: (options) =>
      this.sendRequest("dialog_confirm", {
        title: options.title,
        message: options.message ?? "",
        kind: options.kind === "error" ? 2 : options.kind === "warning" ? 1 : 0,
      }).then((r) => r === true),
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
    readHtml: () =>
      this.sendRequest("clipboard_read_html").then((r) =>
        typeof r === "string" ? r : null,
      ),
    writeHtml: (html) => {
      this.send({ type: "clipboard_write_html", label: "main", text: html });
      return Promise.resolve();
    },
    readImage: () =>
      this.sendRequest("clipboard_read_image").then((r) => {
        if (r && typeof r === "object") {
          const base64 = (r as { base64?: unknown }).base64;
          if (typeof base64 === "string" && base64.length > 0) {
            return { base64 };
          }
        }
        return null;
      }),
    writeImage: ({ base64, rid }) => {
      if (typeof base64 === "string") {
        return this.sendRequest("clipboard_write_image", {
          b64: base64,
        }).then(() => undefined);
      }
      return this.sendRequest("clipboard_write_image", {
        image_id: String(rid ?? -1),
      }).then(() => undefined);
    },
    clear: () =>
      this.sendRequest("clipboard_clear").then(() => undefined),
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
    isPermissionGranted: () =>
      this.sendRequest("notification_is_granted").then((r) => r === true),
    requestPermission: () =>
      this.sendRequest("notification_request_permission").then(
        (r) => r === true,
      ),
  };

  /** Global shortcut controller (implements `RuntimeAdapter.globalShortcut`). */
  readonly globalShortcut: GlobalShortcutController = {
    register: (id, accelerator) =>
      this.sendRequest("shortcut_register", { id, accelerator }).then(
        (r) => r === true,
      ),
    unregister: (id) =>
      this.sendRequest("shortcut_unregister", { id }).then((r) => r === true),
    isRegistered: (id) =>
      this.sendRequest("shortcut_is_registered", { id }).then(
        (r) => r === true,
      ),
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

  /** Image controller (implements `RuntimeAdapter.image`). */
  readonly image: import("@zturnlibs/core").ImageController = {
    fromBytes: (base64) =>
      this.sendRequest("image_from_bytes", { b64: base64 }).then((r) =>
        typeof r === "string" ? Number(r) : -1,
      ),
    fromPath: (path) =>
      this.sendRequest("image_from_path", { path }).then((r) =>
        typeof r === "string" ? Number(r) : -1,
      ),
    destroy: (id) => {
      this.send({ type: "image_destroy", label: "main", image_id: String(id) });
    },
  };

  /** Process controller (implements `RuntimeAdapter.process`). */
  readonly process: import("@zturnlibs/core").ProcessController = {
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

  /* Structural type: avoids clashing with @types/node's stream/web
   * declaration when both are visible (txiki's reader has this shape). */
  async #readLoop(
    reader: { read(): Promise<{ done: boolean; value?: Uint8Array }> },
  ): Promise<void> {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) buf += dec.decode(value, { stream: true });
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
        /* wire names -> core WindowEvent; scale/theme/drag carry payloads. */
        const raw = String(msg.event);
        const event = (
          raw === "scale_change"
            ? "scale-change"
            : raw === "theme_change"
              ? "theme-change"
              : raw === "drag_enter"
                ? "drag-enter"
                : raw === "drag_over"
                  ? "drag-over"
                  : raw === "drag_drop"
                    ? "drag-drop"
                    : raw === "drag_leave"
                      ? "drag-leave"
                      : raw
        ) as WindowEvent;
        const position =
          typeof msg.x === "number" && typeof msg.y === "number"
            ? { x: msg.x, y: msg.y }
            : undefined;
        const payload =
          raw === "scale_change"
            ? {
                scaleFactor: msg.scale,
                size: { width: msg.width, height: msg.height },
              }
            : raw === "theme_change"
              ? msg.theme
              : raw === "drag_enter" || raw === "drag_drop"
                ? { paths: msg.paths ?? [], position }
                : raw === "drag_over"
                  ? { position }
                  : undefined;
        handle?.handleWindowEvent(event, payload);
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
    from = "main",
  ): Promise<unknown> {
    const id = this.#nextReqId++;
    return new Promise<unknown>((resolve) => {
      this.#requests.set(id, resolve);
      /* Route to the issuing window (`from`), not always main. */
      this.send({ type: op, label: from, req_id: id, ...payload });
    });
  }

  /** Window-state query (the host replies with a boolean). */
  sendQuery(op: WindowStateOp, from = "main"): Promise<boolean> {
    return this.sendRequest(op, {}, from).then((r) => r === true);
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
