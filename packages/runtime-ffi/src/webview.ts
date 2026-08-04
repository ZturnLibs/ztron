/**
 * Low-level FFI bindings to the `webview/webview` C API.
 *
 * Signature source: https://github.com/webview/webview/blob/master/core/include/webview/api.h
 *
 * NOTE: exact FFI type mappings (`i32` vs `cstring`, callback marshalling) are
 * verified during the M0 spike. This file is the single place to adjust them.
 */
import { dlopen, types, type JSCallback, type Pointer } from "tjs:ffi";

/** Every function we consume from the webview C API. */
export interface WebviewLibrary {
  webview_create(debug: number, window: Pointer | null): Pointer;
  webview_destroy(w: Pointer): number;
  webview_run(w: Pointer): number;
  webview_terminate(w: Pointer): number;
  webview_set_title(w: Pointer, title: string): number;
  webview_set_size(
    w: Pointer,
    width: number,
    height: number,
    hints: number,
  ): number;
  webview_navigate(w: Pointer, url: string): number;
  webview_set_html(w: Pointer, html: string): number;
  webview_init(w: Pointer, js: string): number;
  webview_eval(w: Pointer, js: string): number;
  webview_bind(
    w: Pointer,
    name: string,
    fn: JSCallback,
    arg: Pointer | null,
  ): number;
  webview_return(
    w: Pointer,
    id: string,
    status: number,
    result: string,
  ): number;
  webview_get_native_handle(w: Pointer, kind: number): Pointer;
}

/**
 * Loads the webview shared library and binds its exported symbols.
 *
 * @param path Absolute path to the platform library
 *   (`libwebview.dylib` / `webview.dll` / `libwebview.so`).
 */
export function loadWebviewLibrary(path: string): WebviewLibrary {
  const { symbols } = dlopen(path, {
    webview_create: {
      returns: types.pointer,
      args: [types.sint32, types.pointer],
    },
    webview_destroy: { returns: types.sint32, args: [types.pointer] },
    webview_run: { returns: types.sint32, args: [types.pointer] },
    webview_terminate: { returns: types.sint32, args: [types.pointer] },
    webview_set_title: {
      returns: types.sint32,
      args: [types.pointer, types.string],
    },
    webview_set_size: {
      returns: types.sint32,
      args: [types.pointer, types.sint32, types.sint32, types.sint32],
    },
    webview_navigate: {
      returns: types.sint32,
      args: [types.pointer, types.string],
    },
    webview_set_html: {
      returns: types.sint32,
      args: [types.pointer, types.string],
    },
    webview_init: {
      returns: types.sint32,
      args: [types.pointer, types.string],
    },
    webview_eval: {
      returns: types.sint32,
      args: [types.pointer, types.string],
    },
    webview_bind: {
      returns: types.sint32,
      args: [types.pointer, types.string, types.jscallback(), types.pointer],
    },
    webview_return: {
      returns: types.sint32,
      args: [types.pointer, types.string, types.sint32, types.string],
    },
    webview_get_native_handle: {
      returns: types.pointer,
      args: [types.pointer, types.sint32],
    },
  });

  return {
    webview_create: symbols.webview_create as never,
    webview_destroy: symbols.webview_destroy as never,
    webview_run: symbols.webview_run as never,
    webview_terminate: symbols.webview_terminate as never,
    webview_set_title: symbols.webview_set_title as never,
    webview_set_size: symbols.webview_set_size as never,
    webview_navigate: symbols.webview_navigate as never,
    webview_set_html: symbols.webview_set_html as never,
    webview_init: symbols.webview_init as never,
    webview_eval: symbols.webview_eval as never,
    webview_bind: symbols.webview_bind as never,
    webview_return: symbols.webview_return as never,
    webview_get_native_handle: symbols.webview_get_native_handle as never,
  };
}
