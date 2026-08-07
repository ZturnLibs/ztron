/**
 * Runtime adapter backed by `webview/webview` via `tjs:ffi`.
 * Implements the `RuntimeAdapter` / `WebviewHandle` contract from `@ztron/core`.
 */
import type { RuntimeAdapter, WebviewHandle, WindowConfig } from "@ztron/core";
import { JSCallback, types, type Pointer } from "tjs:ffi";
import { loadWebviewLibrary, type WebviewLibrary } from "./webview.js";

/** Size hint constants from `api.h` (`WEBVIEW_HINT_NONE`). */
const WEBVIEW_HINT_NONE = 0;

/** Native handle kinds from `api.h`. */
export enum NativeHandleKind {
  None = 0,
  GtkWindow = 1,
  GtkWidget = 2,
  NsView = 3,
  NsWindow = 4,
  WinHwnd = 5,
  WebView2Controller = 6,
}

export interface FfiRuntimeOptions {
  /** Absolute path to the webview shared library. */
  libraryPath: string;
}

export class FfiWebviewHandle implements WebviewHandle {
  #lib: WebviewLibrary;
  #w: Pointer;
  #onMessage: ((id: string, req: string) => void) | null = null;
  // Keep a strong reference so QuickJS GC does not collect the JSCallback
  // while the C side still holds its libffi closure (would cause a segfault).
  #ipcCallback: JSCallback | null = null;

  constructor(lib: WebviewLibrary, w: Pointer) {
    this.#lib = lib;
    this.#w = w;
  }

  loadUrl(url: string): void {
    this.#lib.webview_navigate(this.#w, url);
  }

  loadHtml(html: string): void {
    this.#lib.webview_set_html(this.#w, html);
  }

  eval(js: string): void {
    this.#lib.webview_eval(this.#w, js);
  }

  setTitle(title: string): void {
    this.#lib.webview_set_title(this.#w, title);
  }

  setSize(width: number, height: number): void {
    this.#lib.webview_set_size(this.#w, width, height, 0);
  }

  // Reference FFI path: native window frame/position is handled by the host
  // adapter (Plan A); the FFI adapter only exercises the webview C surface.
  getFrame(): Promise<import("@ztron/core").WindowFrame | null> {
    return Promise.resolve(null);
  }

  setPosition(): void {
    /* no-op (host adapter provides window position) */
  }

  setOpacity(): void {
    /* no-op (host adapter provides window opacity) */
  }

  // Reference FFI path: native window state is handled by the host adapter.
  windowState(
    op: import("@ztron/core").WindowStateOp,
  ): boolean | Promise<boolean> {
    return op.startsWith("is_") ? false : true;
  }

  onWindowEvent(): void {
    /* no-op (host adapter provides window events) */
  }

  respond(id: string, status: number, result: string): void {
    this.#lib.webview_return(this.#w, id, status, result);
  }

  onMessage(cb: (id: string, req: string) => void): void {
    this.#onMessage = cb;
    // NOTE: the callback must declare `sint32` (not `void`) and return 0 —
    // tjs:ffi rejects `void` returns in JSCallback signatures.
    this.#ipcCallback = new JSCallback(
      types.sint32,
      [types.string, types.string, types.pointer],
      (id: string, req: string) => {
        this.#onMessage?.(id, req);
        return 0;
      },
    );
    this.#lib.webview_bind(this.#w, "__TAURI_IPC__", this.#ipcCallback, null);
  }

  run(): void {
    this.#lib.webview_run(this.#w);
  }

  terminate(): void {
    this.#lib.webview_terminate(this.#w);
  }

  close(): void {
    this.#lib.webview_destroy(this.#w);
  }

  nativeHandle(kind: NativeHandleKind): Pointer {
    return this.#lib.webview_get_native_handle(this.#w, kind);
  }
}

/** Runtime adapter that creates windows on the current platform. */
export class FfiRuntime implements RuntimeAdapter {
  #lib: WebviewLibrary;

  constructor(options: FfiRuntimeOptions) {
    this.#lib = loadWebviewLibrary(options.libraryPath);
  }

  createWindow(config: WindowConfig): WebviewHandle {
    const w = this.#lib.webview_create(config.debug ? 1 : 0, null);
    if (w === null || w === undefined) {
      throw new Error("webview_create failed: missing runtime dependency?");
    }
    const handle = new FfiWebviewHandle(this.#lib, w);
    this.#lib.webview_set_title(w, config.title);
    this.#lib.webview_set_size(
      w,
      config.width,
      config.height,
      WEBVIEW_HINT_NONE,
    );
    return handle;
  }
}
