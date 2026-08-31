/**
 * Test doubles — a port of `@tauri-apps/api/mocks` (C8).
 *
 * `mockIPC` swaps the page's invoke transport for an in-memory handler so
 * frontend logic can be unit-tested without a backend; `mockWindows` seeds
 * `window.__TAURI_INTERNALS__.metadata` (and legacy `label`) plus the
 * `__TAURI_METADATA__` shape some libraries probe; `mockConvertFileSrc`
 * overrides the asset-URL mapping; `clearMocks` restores everything.
 */

type IpcHandler = (cmd: string, args?: unknown) => unknown;

interface MockState {
  originalInvoke?: unknown;
  originalConvert?: unknown;
  originalMetadata?: unknown;
}

const state: MockState = {};

interface InternalsShape {
  invoke?: IpcHandler;
  transformCallback?: (cb: (data: unknown) => void, once?: boolean) => number;
  convertFileSrc?: (path: string, protocol?: string) => string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

function internals(): InternalsShape {
  const w = globalThis.window as unknown as
    | { __TAURI_INTERNALS__?: InternalsShape }
    | undefined;
  if (!w) {
    throw new Error(
      "mocks: no `window` in this environment (mocks target a DOM runtime)",
    );
  }
  if (!w.__TAURI_INTERNALS__) w.__TAURI_INTERNALS__ = {};
  return w.__TAURI_INTERNALS__;
}

/** Replaces the invoke transport with an in-memory handler. */
export function mockIPC(cb: IpcHandler): void {
  const i = internals();
  state.originalInvoke ??= i.invoke;
  i.invoke = (cmd: string, args?: unknown) => {
    try {
      return Promise.resolve(cb(cmd, args));
    } catch (e) {
      return Promise.reject(e);
    }
  };
}

/**
 * Seeds window metadata (currentWindow/currentWebview labels) — the shape
 * `Window.getCurrent()` / `Webview.getCurrent()` read.
 */
export function mockWindows(...labels: string[]): void {
  const i = internals();
  state.originalMetadata ??= i.metadata;
  const label = labels[0] ?? "main";
  i.metadata = {
    ...(i.metadata as Record<string, unknown> | undefined),
    currentWindow: { label },
    currentWebview: { label },
    currentWindowLabel: label,
    currentWebviewLabel: label,
    windows: labels.map((l) => ({ label: l })),
    webviews: labels.map((l) => ({ label: l })),
  };
  (
    globalThis.window as unknown as { __TAURI_METADATA__?: unknown }
  ).__TAURI_METADATA__ = (i.metadata ?? {}) as Record<string, unknown>;
  (globalThis.window as { label?: string }).label = label;
}

/** Overrides convertFileSrc for asset-URL assertions. */
export function mockConvertFileSrc(
  fn: (filePath: string, protocol?: string) => string,
): void {
  const i = internals();
  state.originalConvert ??= i.convertFileSrc;
  i.convertFileSrc = fn;
}

/** Restores the real transports/metadata installed by the mocks above. */
export function clearMocks(): void {
  const i = internals();
  if (state.originalInvoke !== undefined) i.invoke = state.originalInvoke as IpcHandler;
  if (state.originalMetadata !== undefined)
    i.metadata = (state.originalMetadata ?? {}) as Record<string, unknown>;
  if (state.originalConvert !== undefined)
    i.convertFileSrc = state.originalConvert as (
      path: string,
      protocol?: string,
    ) => string;
  state.originalInvoke = undefined;
  state.originalMetadata = undefined;
  state.originalConvert = undefined;
  const w = globalThis.window as unknown as
    | Record<string, unknown>
    | undefined;
  if (w) {
    delete w.__TAURI_METADATA__;
    delete w.label;
  }
}
