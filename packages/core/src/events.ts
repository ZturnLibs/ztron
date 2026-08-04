/**
 * Event system — translated from Tauri's `crates/tauri/src/event/mod.rs`.
 *
 * Frontend listeners register through the `plugin:event|register_listener`
 * command; the backend pushes payloads via `webview_eval` + `runCallback`.
 * This module is the backend-side emitter.
 */
import type { WebviewHandle } from "./runtime.js";
import { formatCallback } from "./ipc/formatCallback.js";

/** Valid event names: alphanumeric plus `- / : _`. */
const EVENT_NAME_RE = /^[a-zA-Z0-9\-/:_.]+$/;

export function isValidEventName(event: string): boolean {
  return EVENT_NAME_RE.test(event);
}

export interface Event<T = unknown> {
  /** Event name. */
  event: string;
  /** Payload. */
  payload: T;
  /** The WebView label the event originated from ('' for global). */
  source: string;
}

type Listener<T> = (event: Event<T>) => void;

/**
 * A per-target emitter. Attach to an `App` (global events) or to a
 * single WebView (window-scoped events).
 */
export class EventTarget {
  #listeners = new Map<string, Set<Listener<unknown>>>();

  on<T>(event: string, listener: Listener<T>): () => void {
    assertValid(event);
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    const l = listener as Listener<unknown>;
    set.add(l);
    return () => set!.delete(l);
  }

  once<T>(event: string, listener: Listener<T>): () => void {
    const off = this.on(event, (e) => {
      off();
      (listener as Listener<unknown>)(e);
    });
    return off;
  }

  emit<T>(event: string, payload: T, source = ""): void {
    assertValid(event);
    const listeners = this.#listeners.get(event);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener({ event, payload, source });
    }
  }

  removeAllListeners(event?: string): void {
    if (event === undefined) {
      this.#listeners.clear();
    } else {
      this.#listeners.delete(event);
    }
  }
}

/**
 * Pushes an event into a WebView, invoking the frontend listener registered
 * for `event`.
 */
export function emitToWebview<T>(
  webview: WebviewHandle,
  callbackId: number,
  event: string,
  payload: T,
): void {
  assertValid(event);
  webview.eval(
    formatCallback(callbackId, { id: event, payload: { [event]: payload } }),
  );
}

function assertValid(event: string): void {
  if (!isValidEventName(event)) {
    throw new Error(
      `invalid event name "${event}": only alphanumeric and - / : _ are allowed`,
    );
  }
}
