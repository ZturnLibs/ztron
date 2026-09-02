/**
 * The event system: emit events to the backend and listen to events from it.
 * Ported from `@tauri-apps/api/event`, simplified for the two-process model
 * (the listener registry lives in the backend `EventManager`).
 */
import { invoke, transformCallback } from "./core.js";

/** Tauri-compatible event target. */
export type EventTarget =
  | { kind: "Any" }
  | { kind: "AnyLabel"; label: string }
  | { kind: "App" }
  | { kind: "Window"; label: string }
  | { kind: "Webview"; label: string }
  | { kind: "WebviewWindow"; label: string };

/**
 * Upstream event-name constants (ZtronEvent parity). WINDOW_CREATED /
 * WEBVIEW_CREATED fire as app-wide broadcasts on window creation;
 * SUSPENDED/RESUMED are mobile-lifecycle events (desktop hosts do not
 * fire them - names carried for platform parity).
 */
export enum ZtronEvent {
  WINDOW_RESIZED = "ztron://resize",
  WINDOW_MOVED = "ztron://move",
  WINDOW_CLOSE_REQUESTED = "ztron://close-requested",
  WINDOW_DESTROYED = "ztron://destroyed",
  WINDOW_FOCUS = "ztron://focus",
  WINDOW_BLUR = "ztron://blur",
  WINDOW_SCALE_FACTOR_CHANGED = "ztron://scale-change",
  WINDOW_THEME_CHANGED = "ztron://theme-changed",
  WINDOW_CREATED = "ztron://window-created",
  WINDOW_SUSPENDED = "ztron://suspended",
  WINDOW_RESUMED = "ztron://resumed",
  WEBVIEW_CREATED = "ztron://webview-created",
  DRAG_ENTER = "ztron://drag-enter",
  DRAG_OVER = "ztron://drag-over",
  DRAG_DROP = "ztron://drag-drop",
  DRAG_LEAVE = "ztron://drag-leave",
}

export interface Event<T> {
  /** Event name. */
  event: string;
  /** Event identifier used to unlisten. */
  id: number;
  /** Event payload. */
  payload: T;
}

export type EventCallback<T> = (event: Event<T>) => void;

export type UnlistenFn = () => Promise<void>;

export interface Options {
  /** The event target to listen to, defaults to `{ kind: 'Any' }`. */
  target?: string | EventTarget;
}

function normalizeTarget(options?: Options): EventTarget {
  const target = options?.target;
  if (typeof target === "string") {
    return { kind: "AnyLabel", label: target };
  }
  return target ?? { kind: "Any" };
}

/**
 * Listens to an event.
 * @returns A promise resolving to an unlisten function (call it when the
 *   listener goes out of scope).
 */
export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options,
): Promise<UnlistenFn> {
  const eventId = await invoke<number>("plugin:event|listen", {
    event,
    target: normalizeTarget(options),
    handler: transformCallback(handler),
  });
  return async () => {
    await invoke("plugin:event|unlisten", { event, eventId });
  };
}

/** Listens to an event once; unlistens automatically after the first fire. */
export async function once<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options,
): Promise<UnlistenFn> {
  const unlisten = await listen<T>(
    event,
    (eventData) => {
      void unlisten();
      handler(eventData);
    },
    options,
  );
  return unlisten;
}

/** Emits an event to the backend (which fans it out to listeners). */
export async function emit<T>(event: string, payload?: T): Promise<void> {
  await invoke("plugin:event|emit", { event, payload });
}

/** Emits an event to listeners matching the given target. */
export async function emitTo<T>(
  target: EventTarget | string,
  event: string,
  payload?: T,
): Promise<void> {
  const eventTarget =
    typeof target === "string"
      ? { kind: "AnyLabel" as const, label: target }
      : target;
  await invoke("plugin:event|emit_to", { target: eventTarget, event, payload });
}
