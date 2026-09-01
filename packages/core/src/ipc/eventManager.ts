/**
 * Backend event manager — the single source of truth for frontend listeners.
 *
 * Frontend `listen()` registers a callback id here; `emit()`/`App.emit()` push
 * payloads to matching listeners by `eval`-ing `runCallback(handlerId,
 * { event, id, payload })`. Translated from Tauri's event plugin, but with the
 * listener registry kept in the backend (simpler for the two-process model).
 */
import type { WebviewHandle } from "../runtime.js";
import { isValidEventName } from "../events.js";

/** Tauri-compatible event target. */
export type EventTarget =
  | { kind: "Any" }
  | { kind: "AnyLabel"; label: string }
  | { kind: "App" }
  | { kind: "Window"; label: string }
  | { kind: "Webview"; label: string }
  | { kind: "WebviewWindow"; label: string };

interface Listener {
  eventId: number;
  label: string;
  event: string;
  target: EventTarget;
  callbackId: number;
}

type GetWebview = (label: string) => WebviewHandle | undefined;

export class EventManager {
  #byKey = new Map<string, Set<number>>();
  #byId = new Map<number, Listener>();
  #nextId = 1;
  #getWebview: GetWebview;

  constructor(getWebview: GetWebview) {
    this.#getWebview = getWebview;
  }

  /** Registers a listener; returns a unique event id. */
  listen(
    label: string,
    event: string,
    target: EventTarget,
    callbackId: number,
  ): number {
    if (!isValidEventName(event)) {
      throw new Error(`invalid event name "${event}"`);
    }
    const eventId = this.#nextId++;
    const key = `${label}:${event}`;
    let set = this.#byKey.get(key);
    if (!set) {
      set = new Set();
      this.#byKey.set(key, set);
    }
    set.add(eventId);
    this.#byId.set(eventId, { eventId, label, event, target, callbackId });
    return eventId;
  }

  unlisten(event: string, eventId: number): void {
    const listener = this.#byId.get(eventId);
    if (!listener) {
      return;
    }
    this.#byId.delete(eventId);
    const set = this.#byKey.get(`${listener.label}:${event}`);
    set?.delete(eventId);
    if (set && set.size === 0) {
      this.#byKey.delete(`${listener.label}:${event}`);
    }
  }

  /**
   * Pushes `payload` to every listener whose target matches `target`.
   * Defaults to pushing to all registered listeners.
   */
  emit(event: string, payload: unknown, target?: EventTarget): void {
    if (!isValidEventName(event)) {
      throw new Error(`invalid event name "${event}"`);
    }
    for (const [key, ids] of this.#byKey) {
      const [listenerLabel, listenerEvent] = splitKey(key);
      if (listenerEvent !== event) {
        continue;
      }
      if (target && !targetMatches(listenerLabel, target)) {
        continue;
      }
      for (const eventId of ids) {
        const listener = this.#byId.get(eventId);
        if (!listener) {
          continue;
        }
        const webview = this.#getWebview(listener.label);
        if (!webview) {
          continue;
        }
        webview.eval(
          `window.__TAURI_INTERNALS__.runCallback(${listener.callbackId}, ${serializeEvent(event, eventId, payload)})`,
        );
      }
    }
  }

  /** Number of registered listeners (for diagnostics/tests). */
  get size(): number {
    return this.#byId.size;
  }
}

function splitKey(key: string): [string, string] {
  const i = key.indexOf(":");
  return [key.slice(0, i), key.slice(i + 1)];
}

/**
 * Target semantics in the two-process model (C6, DESIGN §119):
 *  - Window/Webview/WebviewWindow/AnyLabel → delivered only to listeners
 *    registered from that label's webview (upstream per-window routing;
 *    the C1 fix rides this).
 *  - App → broadcast to every webview. Upstream's "app" target denotes the
 *    app process; Ztron's app process has no in-process listeners, and
 *    upstream `app.emit` likewise reaches every window — broadcast IS the
 *    faithful mapping here.
 */
function targetMatches(listenerLabel: string, target: EventTarget): boolean {
  switch (target.kind) {
    case "Any":
    case "App":
      return true;
    case "AnyLabel":
    case "Window":
    case "Webview":
    case "WebviewWindow":
      return target.label === listenerLabel;
    default:
      return false;
  }
}

function serializeEvent(event: string, id: number, payload: unknown): string {
  const json = JSON.stringify({ event, id, payload });
  return json ?? "{event:'" + event + "',id:" + id + ",payload:null}";
}
