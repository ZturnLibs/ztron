/**
 * The canonical `window.__TAURI_INTERNALS__` implementation for every Ztron
 * WebView page.
 *
 * This script is embedded directly into the page HTML (as a `<script>` tag,
 * prepended by the app core) — it must run before the app bundle. It is NOT
 * injected through `webview_init`, which in webview/webview is a post-handler
 * setter rather than a page-init hook (see DESIGN.md §M0 findings).
 *
 * Transport contract (must stay in sync with `@zturnlibs/api/src/internals.ts`):
 *   - `invoke(cmd, args, options)` → Promise, resolved/rejected through the
 *     bound `window.__TAURI_IPC__` (webview_bind + webview_return).
 *   - `transformCallback` / `unregisterCallback` / `runCallback` → callback
 *     registry used by Channel and events (pushed via `webview_eval`).
 *   - `convertFileSrc` / `postMessage` / `metadata`.
 */

export interface InitScriptOptions {
  /** Anti-injection key; the backend rejects mismatched IPC messages. */
  invokeKey: string;
  /** Window metadata exposed as `__TAURI_INTERNALS__.metadata`. */
  metadata?: Record<string, unknown>;
}

/**
 * Builds the init script for a window. The invoke key lives inside a closure
 * so that `window.__TAURI_INTERNALS__.invoke.toString()` does not leak it.
 */
export function buildInitScript(options: InitScriptOptions): string {
  const metadata = JSON.stringify(options.metadata ?? {});
  const invokeKey = JSON.stringify(options.invokeKey);

  return `;(function () {
  var __KEY__ = ${invokeKey}
  var __CB__ = {}
  var __CB_ID__ = 0

  function transformCallback(callback, once) {
    var id = ++__CB_ID__
    __CB__[id] = { cb: callback, once: !!once }
    return id
  }
  function unregisterCallback(id) { delete __CB__[id] }

  function b64Bytes(b64) {
    var bin = atob(b64), n = bin.length, out = new Uint8Array(n)
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i)
    return out
  }

  window.__TAURI_INTERNALS__ = {
    transformCallback: transformCallback,
    unregisterCallback: unregisterCallback,
    runCallback: function (id, value) {
      var entry = __CB__[id]
      if (entry) {
        if (typeof entry.cb === 'function') entry.cb(value)
        if (entry.once) delete __CB__[id]
      }
    },
    invoke: function (cmd, args, options) {
      // Raw IPC envelope (InvokeResponseBody::Raw semantics): the backend
      // serializes binary command results as {__ZTRON_RAW__: <base64>};
      // unwrap here so callers receive Uint8Array directly.
      return window.__TAURI_IPC__({ cmd: cmd, payload: args, options: options, __TAURI_INVOKE_KEY__: __KEY__ }).then(function (res) {
        if (res && typeof res === 'object' && typeof res.__ZTRON_RAW__ === 'string') {
          return b64Bytes(res.__ZTRON_RAW__)
        }
        return res
      })
    },
    convertFileSrc: function (filePath, protocol) {
      // When served through the ztron:// scheme, map to an asset URL that the
      // scheme handler serves from the decoded absolute path.
      if (!protocol && (location.protocol === 'ztron:')) {
        return 'ztron://host/asset/' + encodeURIComponent(filePath)
      }
      return (protocol || 'asset') + '://' + encodeURI(filePath)
    },
    postMessage: function (message) {
      window.__TAURI_IPC__(message)
    },
    metadata: ${metadata}
  }
  window.isTauri = true
})();
`;
}
