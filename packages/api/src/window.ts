/**
 * Window control API — a port of `@tauri-apps/api/window` (window states,
 * events), backed by the built-in `plugin:window|*` commands.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";
import type { Image } from "./image.js";
import {
  normalizePosition,
  normalizeSize,
  type PositionLike,
  type SizeLike,
} from "./dpi.js";

export type WindowEventName =
  | "resize"
  | "move"
  | "focus"
  | "blur"
  | "close-requested"
  | "scale-change"
  | "theme-changed"
  | "drag-enter"
  | "drag-over"
  | "drag-drop"
  | "drag-leave";

/**
 * Stock cursor shapes accepted by setCursor/setCursorIcon
 * (upstream `CursorIcon` union members).
 */
export const CursorIcon = {
  Default: "default",
  Crosshair: "crosshair",
  Hand: "hand",
  Arrow: "arrow",
  Move: "move",
  Text: "text",
  Wait: "wait",
  Help: "help",
  Progress: "progress",
  NotAllowed: "notAllowed",
  ContextMenu: "contextMenu",
  Cell: "cell",
  VerticalText: "verticalText",
  Alias: "alias",
  Copy: "copy",
  NoDrop: "noDrop",
  Grab: "grab",
  Grabbing: "grabbing",
  AllScroll: "allScroll",
  ZoomIn: "zoomIn",
  ZoomOut: "zoomOut",
  EResize: "eResize",
  NResize: "nResize",
  NeResize: "neResize",
  NwResize: "nwResize",
  SResize: "sResize",
  SeResize: "seResize",
  SwResize: "swResize",
  WResize: "wResize",
  EwResize: "ewResize",
  NsResize: "nsResize",
  NeswResize: "neswResize",
  NwseResize: "nwseResize",
  ColResize: "colResize",
  RowResize: "rowResize",
} as const;
export type CursorIcon = (typeof CursorIcon)[keyof typeof CursorIcon];

/** Dock/Tile progress-bar states (upstream ProgressBarStatus). */
export enum ProgressBarStatus {
  None = "none",
  Normal = "normal",
  Indeterminate = "indeterminate",
  Paused = "paused",
  Error = "error",
}

export interface ProgressBarStateInput {
  status: ProgressBarStatus;
  /** Determinate value when status is Normal/Paused/Error. */
  value?: number;
}

/** Attention request type for {@linkcode Window.requestUserAttention}. */
export enum UserAttentionType {
  Critical = "Critical",
  Informational = "Informational",
}

/** Title-bar style (macOS only). */
export type TitleBarStyle = "visible" | "transparent" | "overlay";

/** Window inner-size constraints (logical pixels; undefined = unset). */
export interface WindowSizeConstraints {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

const WINDOW_EVENT = {
  resize: "tauri://resize",
  move: "tauri://move",
  focus: "tauri://focus",
  blur: "tauri://blur",
  "close-requested": "tauri://close-requested",
  "scale-change": "tauri://scale-change",
  "theme-changed": "tauri://theme-changed",
  "drag-enter": "tauri://drag-enter",
  "drag-over": "tauri://drag-over",
  "drag-drop": "tauri://drag-drop",
  "drag-leave": "tauri://drag-leave",
} as const;

/** A physical display (values in physical pixels). */
export interface Monitor {
  name: string | null;
  position: { x: number; y: number };
  size: { width: number; height: number };
  /** Usable area (excludes menu bar / dock / taskbar). */
  workArea: { x: number; y: number; width: number; height: number };
  scaleFactor: number;
}

/**
 * Delivered to {@linkcode Window.onCloseRequested}: call
 * {@linkcode CloseRequestedEvent.preventDefault} inside the handler to keep
 * the window open (a port of `@tauri-apps/api` `CloseRequestedEvent`).
 */
export class CloseRequestedEvent {
  readonly event: string;
  readonly id: number;

  private _preventDefault = false;

  constructor(event: { event: string; id: number }) {
    this.event = event.event;
    this.id = event.id;
  }

  preventDefault(): void {
    this._preventDefault = true;
  }

  isPreventDefault(): boolean {
    return this._preventDefault;
  }
}

export class Window {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  /** Looks up a live window by label (null when it doesn't exist). */
  static async getByLabel(label: string): Promise<Window | null> {
    return (await getAllWindows()).find((w) => w.label === label) ?? null;
  }

  /** The current window (label from the bootstrap metadata). */
  static getCurrent(): Window {
    const meta = globalThis.window?.__TAURI_INTERNALS__?.metadata as
      | { label?: string; currentWindow?: { label?: string } }
      | undefined;
    return new Window(meta?.currentWindow?.label ?? meta?.label ?? "main");
  }

  // ---- title / size ----

  async setTitle(title: string): Promise<void> {
    await invoke("plugin:window|set_title", { label: this.label, title });
  }

  /** The current native window title. */
  async getTitle(): Promise<string> {
    return invoke("plugin:window|get_title", { label: this.label });
  }

  /** Sets the window title (alias of setTitle for Tauri v2 parity). */
  async title(): Promise<string> {
    return this.getTitle();
  }

  /** Whether the window is enabled (macOS: always true — no NSWindow state). */
  async isEnabled(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_enabled", { label: this.label });
  }

  /**
   * The window's inner (content) size in points — excludes title bar.
   */
  async innerSize(): Promise<{ width: number; height: number }> {
    return (
      (await invoke<{ width: number; height: number } | null>(
        "plugin:window|inner_size",
        { label: this.label },
      )) ?? { width: 0, height: 0 }
    );
  }

  /** The OS color scheme the window follows ("light" | "dark"). */
  async getTheme(): Promise<string | null> {
    return invoke("plugin:window|get_theme", { label: this.label });
  }

  /** The OS color scheme, alias of getTheme (Tauri v2 parity). */
  async theme(): Promise<string | null> {
    return this.getTheme();
  }

  /** App-wide theme override (`"dark"`/`"light"`; `null` follows system). */
  async setTheme(theme: "dark" | "light" | null): Promise<void> {
    await invoke("plugin:window|set_theme", { label: this.label, theme });
  }

  /** Alias of setVisible(true) / setVisible(false) (Tauri v2 parity). */
  async show(): Promise<void> {
    await invoke("plugin:window|show", { label: this.label });
  }

  async hide(): Promise<void> {
    await invoke("plugin:window|hide", { label: this.label });
  }

  /** The window's backing scale factor (2 on Retina/HiDPI). */
  async scaleFactor(): Promise<number | null> {
    return invoke("plugin:window|get_scale_factor", { label: this.label });
  }

  /** Toggles whether the window ignores mouse/cursor events. */
  async setIgnoreCursorEvents(ignore: boolean): Promise<void> {
    await invoke("plugin:window|set_ignore_cursor_events", {
      label: this.label,
      ignore,
    });
  }

  /**
   * Enables/disables the native file drag-and-drop handler. While enabled
   * (default) file drags produce {@linkcode Window.onDragDropEvent} events;
   * disable it to let the page use the HTML5 drag-and-drop APIs instead.
   */
  async setFileDropEnabled(enabled: boolean): Promise<void> {
    await invoke("plugin:window|set_file_drop_enabled", {
      label: this.label,
      value: enabled,
    });
  }

  /**
   * Locks the cursor at its current position (Tauri setCursorGrab). On
   * macOS the cursor visually parks in place; release with `false`.
   */
  async setCursorGrab(grab: boolean): Promise<void> {
    await invoke("plugin:window|set_cursor_grab", {
      label: this.label,
      value: grab,
    });
  }

  /**
   * Sets the window/dock icon from an {@linkcode Image} (registered host
   * image). Pass `null` to clear.
   */
  async setIcon(icon: Image | null): Promise<void> {
    await invoke("plugin:window|set_icon", {
      label: this.label,
      image_id: icon ? icon.rid : -1,
    });
  }

  /**
   * Sets a small titlebar accessory icon (the macOS take on Windows'
   * overlay/status badge). Pass `null` to clear.
   */
  async setOverlayIcon(icon: Image | null): Promise<void> {
    await invoke("plugin:window|set_overlay_icon", {
      label: this.label,
      image_id: icon ? icon.rid : -1,
    });
  }

  /** Vibrancy material (macOS). Windows-only effects are ignored there. */
  async setEffects(effects: Effects): Promise<void> {
    await invoke("plugin:window|set_effects", {
      label: this.label,
      value: effects,
    });
  }

  /** Removes any applied vibrancy effect. */
  async clearEffects(): Promise<void> {
    await invoke("plugin:window|clear_effects", { label: this.label });
  }

  /**
   * A normalized drag-and-drop notification (Tauri DragDropEvent): `enter`
   * carries paths + position, `over` only the position, `drop` paths +
   * position, and `leave` fires when the drag leaves the window without a
   * drop. Positions are physical pixels relative to the window's top-left.
   */
  onDragDropEvent(
    handler: (payload:
      | { type: "enter"; paths: string[]; position: { x: number; y: number } }
      | { type: "over"; position: { x: number; y: number } }
      | { type: "drop"; paths: string[]; position: { x: number; y: number } }
      | { type: "leave" }) => void,
  ): () => void {
    // Assigned synchronously after the awaits resolve (below).
    let unlisten: Array<() => void> = [];
    void Promise.all([
      this.onEvent<{ paths: string[]; position: { x: number; y: number } }>(
        "drag-enter",
        (e) => handler({ type: "enter", ...e }),
      ).then((u) => unlisten.push(u)),
      this.onEvent<{ position: { x: number; y: number } }>("drag-over", (e) =>
        handler({ type: "over", position: e.position }),
      ).then((u) => unlisten.push(u)),
      this.onEvent<{ paths: string[]; position: { x: number; y: number } }>(
        "drag-drop",
        (e) => handler({ type: "drop", ...e }),
      ).then((u) => unlisten.push(u)),
      this.onEvent("drag-leave", () => handler({ type: "leave" })).then(
        (u) => unlisten.push(u),
      ),
    ]);
    return () => {
      for (const u of unlisten) u();
      unlisten = [];
    };
  }

  /**
   * Sets the window cursor (CSS-style name: "default", "pointer", "text",
   * "crosshair", "move", "not-allowed", resize cursors, …).
   */
  async setCursor(cursor: string): Promise<void> {
    await invoke("plugin:window|set_cursor", { label: this.label, cursor });
  }

  /** Alias of setCursor (Tauri v2 name). */
  async setCursorIcon(icon: string): Promise<void> {
    return this.setCursor(icon);
  }

  /**
   * Hides/shows the system cursor (app-global hide counter — pair calls).
   */
  async setCursorVisible(visible: boolean): Promise<void> {
    await invoke("plugin:window|set_cursor_visible", {
      label: this.label,
      visible,
    });
  }

  /** Android-only upstream: current activity name (null on desktop). */
  async activityName(): Promise<string | null> {
    return invoke("plugin:window|activity_name", { label: this.label });
  }

  /** Android-only upstream: accepted as a documented no-op on desktop. */
  async setActivityName(name: string): Promise<void> {
    await invoke("plugin:window|set_activity_name", { label: this.label, name });
  }

  /** iOS-only upstream: current scene identifier (null on desktop). */
  async sceneIdentifier(): Promise<string | null> {
    return invoke("plugin:window|scene_identifier", { label: this.label });
  }

  /** iOS-only upstream: accepted as a documented no-op on desktop. */
  async setSceneIdentifier(id: string): Promise<void> {
    await invoke("plugin:window|set_scene_identifier", {
      label: this.label,
      id,
    });
  }

  /** Screen-space cursor position (no label needed; upstream parity). */
  async cursorPosition(): Promise<{ x: number; y: number }> {
    return invoke<{ x: number; y: number }>("plugin:window|cursor_position", {
      label: this.label,
    });
  }

  /** Warps the cursor to window coordinates (dpi types accepted). */
  async setCursorPosition(
    x: PositionLike,
    y?: number,
  ): Promise<void> {
    const p = normalizePosition(x, y);
    await invoke("plugin:window|set_cursor_position", {
      label: this.label,
      x: p.x,
      y: p.y,
    });
  }

  /** Zooms the web content (CSS zoom factor, e.g. 1.5). */
  async setZoom(zoom: number): Promise<void> {
    await invoke("plugin:window|set_zoom", { label: this.label, zoom });
  }

  /**
   * Prevents the window from closing; a `tauri://close-requested` event is
   * emitted instead, letting the frontend confirm (then call destroy()).
   */
  async preventClose(prevent: boolean): Promise<void> {
    await invoke("plugin:window|prevent_close", { label: this.label, prevent });
  }

  /** Force-closes the window, bypassing preventClose. */
  async destroy(): Promise<void> {
    await invoke("plugin:window|destroy", { label: this.label });
  }

  /**
   * Starts a native resize drag (direction: "north"/"south"/"east"/"west" or
   * combinations like "southeast"). macOS is not implemented.
   */
  async startResizeDragging(direction = "southeast"): Promise<void> {
    await invoke("plugin:window|start_resize_dragging", {
      label: this.label,
      direction,
    });
  }

  /** Sets the window bounds (position + size in one op, dpi types accepted). */
  async setBounds(
    x: PositionLike,
    y: number | SizeLike,
    width?: number,
    height?: number,
  ): Promise<void> {
    const p = normalizePosition(x, typeof y === "number" ? y : undefined);
    const s = normalizeSize(
      typeof y === "number" ? (width ?? 0) : y,
      typeof y === "number" ? height : undefined,
    );
    await invoke("plugin:window|set_bounds", {
      label: this.label,
      x: p.x,
      y: p.y,
      width: s.width,
      height: s.height,
    });
  }

  /** Toggles the native window shadow. */
  async setShadow(shadow: boolean): Promise<void> {
    await invoke("plugin:window|set_shadow", { label: this.label, shadow });
  }

  /** Enables/disables the native window. */
  async setEnabled(enabled: boolean): Promise<void> {
    await invoke("plugin:window|set_enabled", { label: this.label, enabled });
  }

  /**
   * Sets the window size. Accepts plain numbers, a `LogicalSize` /
   * `PhysicalSize`, or a plain `{ width, height }` object.
   */
  async setSize(width: SizeLike, height?: number): Promise<void> {
    const s = normalizeSize(width, height);
    await invoke("plugin:window|set_size", {
      label: this.label,
      width: s.width,
      height: s.height,
    });
  }

  /**
   * Moves the window. Accepts plain numbers, a `LogicalPosition` /
   * `PhysicalPosition`, or a plain `{ x, y }` object.
   */
  async setPosition(x: PositionLike, y?: number): Promise<void> {
    const p = normalizePosition(x, y);
    await invoke("plugin:window|set_position", {
      label: this.label,
      x: p.x,
      y: p.y,
    });
  }

  /**
   * Sets the window minimum inner size. `null` unsets the constraint
   * (dpi types accepted, like `new LogicalSize(300, 200)`).
   */
  async setMinSize(size: SizeLike | null | undefined): Promise<void> {
    const s = size == null ? { width: 0, height: 0 } : normalizeSize(size);
    await invoke("plugin:window|set_min_size", {
      label: this.label,
      width: s.width,
      height: s.height,
    });
  }

  /**
   * Sets the window maximum inner size. `null` unsets the constraint
   * (dpi types accepted).
   */
  async setMaxSize(size: SizeLike | null | undefined): Promise<void> {
    const s = size == null ? { width: 0, height: 0 } : normalizeSize(size);
    await invoke("plugin:window|set_max_size", {
      label: this.label,
      width: s.width,
      height: s.height,
    });
  }

  /** Sets min/max inner-size constraints in one call. */
  async setSizeConstraints(
    constraints: WindowSizeConstraints | null | undefined,
  ): Promise<void> {
    const { minWidth, minHeight, maxWidth, maxHeight } = constraints ?? {};
    await invoke("plugin:window|set_size_constraints", {
      label: this.label,
      min:
        minWidth || minHeight
          ? { width: minWidth ?? 0, height: minHeight ?? 0 }
          : undefined,
      max:
        maxWidth || maxHeight
          ? { width: maxWidth ?? 0, height: maxHeight ?? 0 }
          : undefined,
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

  /** Sets the native maximize state without toggling (Tauri v2 split). */
  async maximize(): Promise<void> {
    await invoke("plugin:window|maximize", { label: this.label });
  }

  /** Restores a maximized window (no-op when not zoomed). */
  async unmaximize(): Promise<void> {
    await invoke("plugin:window|unmaximize", { label: this.label });
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

  /** Keeps the window below all other windows (v2-only). */
  async setAlwaysOnBottom(alwaysOnBottom: boolean): Promise<void> {
    await invoke("plugin:window|set_always_on_bottom", {
      label: this.label,
      alwaysOnBottom,
    });
  }

  /**
   * Toggles the native minimize button (macOS/Windows; button-mask based).
   */
  async setMinimizable(minimizable: boolean): Promise<void> {
    await invoke("plugin:window|set_minimizable", {
      label: this.label,
      minimizable,
    });
  }

  /** Whether the native minimize button is enabled. */
  async isMinimizable(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_minimizable", {
      label: this.label,
    });
  }

  /** Toggles the native maximize/zoom button. */
  async setMaximizable(maximizable: boolean): Promise<void> {
    await invoke("plugin:window|set_maximizable", {
      label: this.label,
      maximizable,
    });
  }

  /** Whether the native maximize/zoom button is enabled. */
  async isMaximizable(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_maximizable", {
      label: this.label,
    });
  }

  /** Toggles the native close button. */
  async setClosable(closable: boolean): Promise<void> {
    await invoke("plugin:window|set_closable", {
      label: this.label,
      closable,
    });
  }

  /** Whether the native close button is enabled. */
  async isClosable(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_closable", { label: this.label });
  }

  /** Whether the window has native decorations (title bar / borders). */
  async isDecorated(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_decorated", { label: this.label });
  }

  /** Whether the window is currently focused (key window). */
  async isFocused(): Promise<boolean> {
    return invoke<boolean>("plugin:window|is_focused", { label: this.label });
  }

  /** Hides the window icon from the taskbar/dock (macOS: whole app). */
  async setSkipTaskbar(skipTaskbar: boolean): Promise<void> {
    await invoke("plugin:window|set_skip_taskbar", {
      label: this.label,
      skipTaskbar,
    });
  }

  /** Prevents the window contents from being captured by other apps. */
  async setContentProtected(protect: boolean): Promise<void> {
    await invoke("plugin:window|set_content_protected", {
      label: this.label,
      protected: protect,
    });
  }

  /**
   * Bounces the dock icon until activated. `null` cancels the request.
   * (macOS maps Critical/Informational to the bounce style.)
   */
  async requestUserAttention(
    type: UserAttentionType | null = null,
  ): Promise<void> {
    await invoke("plugin:window|request_user_attention", {
      label: this.label,
      attentionType: type,
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

  /** Whether the window stays on top of other windows. */
  async isAlwaysOnTop(): Promise<boolean> {
    return (await this.getState())?.alwaysOnTop ?? false;
  }

  /** Whether the window is visible. */
  async isVisible(): Promise<boolean> {
    return (await this.getState())?.visible ?? false;
  }

  /** Whether the window is resizable. */
  async isResizable(): Promise<boolean> {
    return (await this.getState())?.resizable ?? false;
  }

  /** The window's outer size (width × height, including decorations). */
  async outerSize(): Promise<{ width: number; height: number }> {
    const f = await invoke<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>("plugin:window|get_frame", { label: this.label });
    return f ? { width: f.width, height: f.height } : { width: 0, height: 0 };
  }

  /** The window's outer position (top-left origin). */
  async outerPosition(): Promise<{ x: number; y: number }> {
    const f = await invoke<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>("plugin:window|get_frame", { label: this.label });
    return f ? { x: f.x, y: f.y } : { x: 0, y: 0 };
  }

  /**
   * The window's inner position (content top-left). Approximated by the outer
   * frame origin — exact content origin needs titlebar-height measurement.
   */
  async innerPosition(): Promise<{ x: number; y: number }> {
    return (
      (await invoke<{ x: number; y: number } | null>(
        "plugin:window|inner_position",
        { label: this.label },
      )) ?? { x: 0, y: 0 }
    );
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

  // ---- dock/taskbar app-wide extras (v2) ----

  /**
   * Sets the dock/taskbar progress (`0.0`–`1.0`); `null` clears it.
   * App-wide on macOS (dock tile), per-window on Windows taskbar.
   */
  /**
   * Dock/taskbar progress. Accepts a bare determinate value / null (v1
   * shape) or an upstream ProgressBarState object: `Indeterminate` toggles
   * the spinning bar, `None` clears it.
   */
  async setProgressBar(
    progress:
      | number
      | null
      | ProgressBarStateInput,
  ): Promise<void> {
    let wire: number | null;
    let statusArg: string | undefined;
    if (progress !== null && typeof progress === "object") {
      statusArg = progress.status as string;
      if (progress.status === ProgressBarStatus.None) wire = null;
      else if (progress.status === ProgressBarStatus.Indeterminate) wire = -3;
      else wire = progress.value ?? 0;
    } else {
      wire = progress;
    }
    await invoke("plugin:window|set_progress_bar", {
      label: this.label,
      progress: wire,
      ...(statusArg ? { status: statusArg } : {}),
    });
  }
  /**
   * Sets the dock badge count. `null`/`undefined` removes the badge.
   * macOS dock / Windows taskbar; unsupported elsewhere.
   */
  async setBadgeCount(count: number | null): Promise<void> {
    await invoke("plugin:window|set_badge_count", {
      label: this.label,
      count,
    });
  }

  /**
   * Sets the dock badge to arbitrary text (macOS only).
   * `null`/`undefined`/`""` removes the badge.
   */
  async setBadgeLabel(badgeLabel: string | null): Promise<void> {
    await invoke("plugin:window|set_badge_label", {
      label: this.label,
      badgeLabel,
    });
  }

  /**
   * Sets the window background color: `"#rrggbb"`, `"#rrggbbaa"` or
   * `"transparent"`. Takes effect on frameless/transparent windows.
   */
  async setBackgroundColor(color: string): Promise<void> {
    await invoke("plugin:window|set_background_color", {
      label: this.label,
      color,
    });
  }

  /**
   * Sets the title-bar style (macOS only): `"visible"` (default),
   * `"transparent"` (hidden chrome) or `"overlay"` (content under the
   * traffic lights — the Tauri "transparent + full-size content view").
   */
  async setTitleBarStyle(style: TitleBarStyle): Promise<void> {
    await invoke("plugin:window|set_titlebar_style", {
      label: this.label,
      style,
    });
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

  /** Toggles whether the window can take keyboard focus. */
  async setFocusable(focusable: boolean): Promise<void> {
    await invoke("plugin:window|set_focusable", {
      label: this.label,
      focusable,
    });
  }

  /** Shows the window on all workspaces / virtual desktops (macOS). */
  async setVisibleOnAllWorkspaces(visible: boolean): Promise<void> {
    await invoke("plugin:window|set_visible_on_all_workspaces", {
      label: this.label,
      visible,
    });
  }

  /**
   * Borderless "simple" fullscreen: content fills the screen without the
   * native fullscreen space transition (frame + decorations restored on off).
   */
  async setSimpleFullscreen(fullscreen: boolean): Promise<void> {
    await invoke("plugin:window|set_simple_fullscreen", {
      label: this.label,
      fullscreen,
    });
  }

  onFocused(handler: () => void) {
    return this.onEvent("focus", handler);
  }

  onBlurred(handler: () => void) {
    return this.onEvent("blur", handler);
  }

  /** Focus + blur combined (Tauri v2 sugar). */
  async onFocusChanged(
    handler: (focused: boolean) => void,
  ): Promise<() => void> {
    const unFocus = await this.onEvent("focus", () => handler(true));
    const unBlur = await this.onEvent("blur", () => handler(false));
    return () => {
      unFocus();
      unBlur();
    };
  }

  /**
   * Fires when a close is requested. The handler decides dynamically:
   * call `event.preventDefault()` to keep the window open, otherwise the
   * window is destroyed when the handler completes (Tauri v2 semantics).
   */
  async onCloseRequested(
    handler: (event: CloseRequestedEvent) => unknown,
  ): Promise<() => void> {
    // Arm interception so the native close request never closes the window
    // directly; the fallback below performs the actual destroy.
    await this.preventClose(true);
    return listen<unknown>(
      WINDOW_EVENT["close-requested"],
      (e) => {
        const evt = new CloseRequestedEvent(e);
        void Promise.resolve(handler(evt)).then(() => {
          if (!evt.isPreventDefault()) void this.destroy();
        });
      },
      { target: this.label },
    );
  }

  /** Fires when the backing scale factor changes (Retina display moves). */
  onScaleChanged(
    handler: (payload: { scaleFactor: number; size: { width: number; height: number } }) => void,
  ) {
    return this.onEvent("scale-change", handler);
  }

  /** Fires when the system theme changes (payload: "dark" | "light"). */
  onThemeChanged(handler: (theme: string) => void) {
    return this.onEvent("theme-changed", handler);
  }

  /**
   * Moves the traffic-light buttons (close/minimize/zoom) — for frameless
   * macOS windows with `titleBarStyle: "overlay"`.
   */
  async setTrafficLightPosition(x: number, y: number): Promise<void> {
    await invoke("plugin:window|set_traffic_light_position", {
      label: this.label,
      x,
      y,
    });
  }
}

/** All live window labels as `Window` handles. */
export async function getAllWindows(): Promise<Window[]> {
  const labels = await invoke<string[]>("plugin:window|get_all_windows", {});
  return labels.map((l) => new Window(l));
}

/** The list of all monitors (physical px). */
export async function availableMonitors(): Promise<Monitor[]> {
  return (await invoke<Monitor[] | null>(
    "plugin:window|available_monitors",
    {},
  )) ?? [];
}

/** The monitor containing the window (or null off-screen). */
export async function currentMonitor(): Promise<Monitor | null> {
  return invoke<Monitor | null>("plugin:window|current_monitor", {});
}

/** The primary display. */
export async function primaryMonitor(): Promise<Monitor | null> {
  return invoke<Monitor | null>("plugin:window|primary_monitor", {});
}

/** The monitor containing a desktop point (physical px, top-left origin). */
export async function monitorFromPoint(
  x: number,
  y: number,
): Promise<Monitor | null> {
  return invoke<Monitor | null>("plugin:window|monitor_from_point", {
    x,
    y,
  });
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

/** macOS vibrancy materials (NSVisualEffectMaterial). */
export enum Effect {
  AppearanceBased = "appearanceBased",
  Titlebar = "titlebar",
  Selection = "selection",
  Menu = "menu",
  Popover = "popover",
  Sidebar = "sidebar",
  HeaderView = "headerView",
  Sheet = "sheet",
  WindowBackground = "windowBackground",
  HudWindow = "hudWindow",
  FullScreenUI = "fullScreenUI",
  ToolTip = "toolTip",
  ContentBackground = "contentBackground",
  UnderWindowBackground = "underWindowBackground",
  UnderPageBackground = "underPageBackground",
  /** Windows only (no-op on macOS, kept for cross-platform config). */
  Blur = "blur",
  Acrylic = "acrylic",
  Tabbed = "tabbed",
  Mica = "mica",
  TabbedDark = "tabbedDark",
  TabbedLight = "tabbedLight",
}

/** Effect active state (macOS only). */
export enum EffectState {
  FollowsWindowActiveState = -1,
  Active = 0,
  Inactive = 1,
}

/** Window effect configuration (Tauri `Effects`). */
export interface Effects {
  effects: Effect[];
  state?: EffectState;
  radius?: number;
  color?: string | null;
}

/**
 * Global mouse position in screen coordinates — no window label required
 * (upstream `cursorPosition()` standalone helper).
 */
export async function cursorPosition(): Promise<{ x: number; y: number }> {
  return invoke<{ x: number; y: number }>("plugin:window|cursor_position", {});
}
