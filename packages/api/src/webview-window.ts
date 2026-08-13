/**
 * WebviewWindow API — a port of `@tauri-apps/api/webviewWindow`. Creates
 * additional native windows at runtime; each is an independent Window.
 */
import { invoke } from "./core.js";
import { Window } from "./window.js";

export interface WebviewWindowOptions {
  title?: string;
  width?: number;
  height?: number;
  url?: string;
  html?: string;
}

/** A native window created at runtime (multi-window). */
export class WebviewWindow extends Window {
  #options: WebviewWindowOptions;

  constructor(label: string, options: WebviewWindowOptions = {}) {
    super(label);
    this.#options = options;
  }

  /** Creates the native window with this instance's label + options. */
  async create(): Promise<void> {
    await invoke("plugin:webview|create", {
      label: this.label,
      ...this.#options,
    });
  }
}

/** The window that invoked this call (single-window alias of Window). */
export function getCurrentWebviewWindow(): Window {
  return Window.getCurrent();
}
