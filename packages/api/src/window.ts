/**
 * Window control API — a port of `@tauri-apps/api/window` (window states,
 * events), backed by the built-in `plugin:window|*` commands.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

export type WindowEventName =
  "resize" | "move" | "focus" | "blur" | "close-requested";

const WINDOW_EVENT = {
  resize: "tauri://resize",
  move: "tauri://move",
  focus: "tauri://focus",
  blur: "tauri://blur",
  "close-requested": "tauri://close-requested",
} as const;

export class Window {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  /** The current window (v1: single window, label `main`). */
  static getCurrent(): Window {
    const label = (
      globalThis.window?.__TAURI_INTERNALS__?.metadata as
        { label?: string } | undefined
    )?.label;
    return new Window(label ?? "main");
  }

  // ---- title / size ----

  async setTitle(title: string): Promise<void> {
    await invoke("plugin:window|set_title", { label: this.label, title });
  }

  async setSize(width: number, height: number): Promise<void> {
    await invoke("plugin:window|set_size", {
      label: this.label,
      width,
      height,
    });
  }

  async close(): Promise<void> {
    await invoke("plugin:window|close", { label: this.label });
  }

  // ---- window states ----

  async minimize(): Promise<void> {
    await invoke("plugin:window|minimize", { label: this.label });
  }

  async unminimize(): Promise<void> {
    await invoke("plugin:window|unminimize", { label: this.label });
  }

  async toggleMaximize(): Promise<void> {
    await invoke("plugin:window|toggle_maximize", { label: this.label });
  }

  async isMaximized(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_maximized", { label: this.label });
  }

  async isMinimized(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_minimized", { label: this.label });
  }

  async setFullscreen(fullscreen: boolean): Promise<void> {
    await invoke("plugin:window|set_fullscreen", {
      label: this.label,
      fullscreen,
    });
  }

  async isFullscreen(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_fullscreen", {
      label: this.label,
    });
  }

  async setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    await invoke("plugin:window|set_always_on_top", {
      label: this.label,
      alwaysOnTop,
    });
  }

  async center(): Promise<void> {
    await invoke("plugin:window|center", { label: this.label });
  }

  async setFocus(): Promise<void> {
    await invoke("plugin:window|set_focus", { label: this.label });
  }

  async setVisible(visible: boolean): Promise<void> {
    await invoke("plugin:window|set_visible", { label: this.label, visible });
  }

  async setResizable(resizable: boolean): Promise<void> {
    await invoke("plugin:window|set_resizable", {
      label: this.label,
      resizable,
    });
  }

  /** Sets the window opacity, 0.0 (transparent) to 1.0 (opaque). */
  async setOpacity(opacity: number): Promise<void> {
    await invoke("plugin:window|set_opacity", {
      label: this.label,
      opacity,
    });
  }

  /** Reads the window's boolean state flags (maximized/fullscreen/etc). */
  async getState(): Promise<{
    maximized: boolean;
    minimized: boolean;
    fullscreen: boolean;
    alwaysOnTop: boolean;
    visible: boolean;
    resizable: boolean;
  } | null> {
    return invoke("plugin:window|get_state", { label: this.label });
  }

  /** Toggles a transparent window background. */
  async setTransparent(transparent: boolean): Promise<void> {
    await invoke("plugin:window|set_transparent", {
      label: this.label,
      transparent,
    });
  }

  /** Toggles native window decorations (title bar / borders). */
  async setDecorations(decorations: boolean): Promise<void> {
    await invoke("plugin:window|set_decorations", {
      label: this.label,
      decorations,
    });
  }

  /**
   * Starts a native window drag — call from a `mousedown` on a
   * `data-tauri-drag-region` element of a frameless window.
   */
  async startDragging(): Promise<void> {
    await invoke("plugin:window|start_dragging", { label: this.label });
  }

  // ---- window events (listen to `tauri://*`) ----

  private async onEvent<T>(
    event: WindowEventName,
    handler: (payload: T) => void,
  ) {
    return listen<T>(WINDOW_EVENT[event], (e) => handler(e.payload), {
      target: this.label,
    });
  }

  onResized(handler: (payload: { width: number; height: number }) => void) {
    return this.onEvent("resize", handler);
  }

  onMoved(handler: (payload: { x: number; y: number }) => void) {
    return this.onEvent("move", handler);
  }

  onFocused(handler: () => void) {
    return this.onEvent("focus", handler);
  }

  onBlurred(handler: () => void) {
    return this.onEvent("blur", handler);
  }

  onCloseRequested(handler: () => void) {
    return this.onEvent("close-requested", handler);
  }
}

/**
 * Enables window dragging from any element with a `data-tauri-drag-region`
 * attribute (the Tauri frameless-window convention). Call once per page.
 */
export function setupDragRegion(
  target: Document | HTMLElement = document,
): () => void {
  const onMouseDown = (e: Event) => {
    const ev = e as MouseEvent;
    const el = (ev.target as HTMLElement | null)?.closest?.(
      "[data-tauri-drag-region]",
    );
    if (el) {
      ev.preventDefault();
      void Window.getCurrent().startDragging();
    }
  };
  target.addEventListener("mousedown", onMouseDown);
  return () => target.removeEventListener("mousedown", onMouseDown);
}
