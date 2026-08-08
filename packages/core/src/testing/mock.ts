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

/** A mock WebviewHandle that records calls and lets tests drive responses. */
export class MockWebviewHandle implements WebviewHandle {
  readonly label: string;
  evalLog: string[] = [];
  respondLog: Array<{ id: string; status: number; result: string }> = [];
  titleLog: string[] = [];
  sizeLog: Array<{ w: number; h: number }> = [];
  positionLog: Array<{ x: number; y: number }> = [];
  windowStateLog: Array<{ op: WindowStateOp; value?: boolean }> = [];
  /** Return values for `is_*` window-state queries. */
  windowStateValues: Partial<Record<WindowStateOp, boolean>> = {};
  windowEventLog: WindowEvent[] = [];
  terminated = false;
  loadedUrl: string | null = null;
  loadedHtml: string | null = null;

  #onMessage: ((id: string, req: string) => void) | null = null;
  #onWindowEvent: ((event: WindowEvent) => void) | null = null;

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

  setPosition(x: number, y: number): void {
    this.positionLog.push({ x, y });
    this.frame.x = x;
    this.frame.y = y;
  }

  opacityLog: number[] = [];

  setOpacity(opacity: number): void {
    this.opacityLog.push(opacity);
  }

  dragCount = 0;

  startDragging(): void {
    this.dragCount += 1;
  }

  windowState(op: WindowStateOp, value?: boolean): boolean | Promise<boolean> {
    this.windowStateLog.push({ op, value });
    if (op.startsWith("is_")) {
      return this.windowStateValues[op] ?? false;
    }
    return true;
  }

  onWindowEvent(cb: (event: WindowEvent) => void): void {
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

  /** Simulates the frontend invoking a command. */
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
              ? JSON.parse(result || "null")
              : Promise.reject(JSON.parse(result)),
          );
        }
      };
      this.#onMessage?.(id, req);
    });
  }

  /** Simulates a window event firing. */
  emitWindowEvent(event: WindowEvent): void {
    this.windowEventLog.push(event);
    this.#onWindowEvent?.(event);
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
    onEvent: () => {},
  };

  deepLink: DeepLinkController = {
    onEvent: () => {},
    getLastUrl: () => null,
  };

  exitLog: number[] = [];
  relaunchCount = 0;

  readonly process: import("../runtime.js").ProcessController = {
    exit: (code) => {
      this.exitLog.push(code ?? 0);
    },
    relaunch: () => {
      this.relaunchCount += 1;
    },
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
