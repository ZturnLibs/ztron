/**
 * The single seam between the frontend and the Ztron main process.
 *
 * Everything in `@ztron/api` goes through `window.__TAURI_INTERNALS__`.
 * The `@ztron/inject` package is responsible for providing this object
 * inside the WebView (via `webview_init`), so the transport contract below
 * MUST stay in sync between `api` and `inject`.
 */

/** Command arguments accepted by {@link Internals.invoke}. */
export type InvokeArgs =
  Record<string, unknown> | number[] | ArrayBuffer | Uint8Array;

/** Invoke options forwarded to the backend. */
export interface InvokeOptions {
  headers?: HeadersInit;
}

/** A callback handle returned by `transformCallback`. */
export interface CallbackHandle {
  id: number;
}

/** The full contract `@ztron/inject` must expose on the window global. */
export interface Internals {
  /** Sends a message to the backend and resolves with its response. */
  invoke<T>(
    cmd: string,
    args?: InvokeArgs,
    options?: InvokeOptions,
  ): Promise<T>;

  /** Registers a JS callback and returns its identifier for the backend. */
  transformCallback<T>(
    callback?: (response: T) => void,
    once?: boolean,
  ): number;

  /** Removes a previously registered callback by its identifier. */
  unregisterCallback(callbackId: number): void;

  /** Invokes a registered callback (called by the backend via eval). */
  runCallback(callbackId: number, ...args: unknown[]): void;

  /** Converts a file path to a URL loadable by the WebView. */
  convertFileSrc(filePath: string, protocol?: string): string;

  /** Sends a raw IPC message to the backend. */
  postMessage(message: unknown): void;

  /** Window metadata injected by the backend. */
  metadata: Record<string, unknown>;
}

/** Global exposure, matching Tauri's `window.__TAURI_INTERNALS__`. */
declare global {
  interface Window {
    __TAURI_INTERNALS__: Internals;
  }
}

/** Accessor with a helpful error when running outside of a Ztron WebView. */
export function internals(): Internals {
  const i = globalThis.window?.__TAURI_INTERNALS__;
  if (!i) {
    throw new Error(
      "Ztron is not available: window.__TAURI_INTERNALS__ is missing. " +
        "Are you running inside a Ztron WebView?",
    );
  }
  return i;
}
