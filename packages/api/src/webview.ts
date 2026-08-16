/**
 * Webview API — a port of `@tauri-apps/api/webview` surface relevant to a
 * Ztron webview-window (the window and webview share one WKWebView/
 * WebView2 instance, so `Webview` here exposes the webview-layer controls).
 */
import { invoke } from "./core.js";
import { Window } from "./window.js";

/** Webview-layer controls for a window's embedded web content. */
export class Webview {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  /** The current webview (label from the bootstrap metadata). */
  static getCurrent(): Webview {
    const label = (
      globalThis.window?.__TAURI_INTERNALS__?.metadata as
        { label?: string } | undefined
    )?.label;
    return new Webview(label ?? "main");
  }

  /**
   * Clears all browsing data for the webview's store: cookies, cache,
   * local/session storage, IndexedDB (WKWebsiteDataStore / WebView2
   * profile equivalents).
   */
  async clearAllBrowsingData(): Promise<void> {
    await invoke("plugin:webview|clear_all_browsing_data", {
      label: this.label,
    });
  }

  /** The owning window handle (webview controls often mirror window ops). */
  window(): Window {
    return new Window(this.label);
  }

  /** Positions the webview content within its window (reparent-less). */
  async setPosition(x: number, y: number): Promise<void> {
    await invoke("plugin:window|set_position", {
      label: this.label,
      x,
      y,
    });
  }

  /** Resizes the webview content within its window. */
  async setSize(width: number, height: number): Promise<void> {
    await invoke("plugin:window|set_size", {
      label: this.label,
      width,
      height,
    });
  }

  /** Focuses the webview (its window's key state). */
  async setFocus(): Promise<void> {
    await invoke("plugin:window|set_focus", { label: this.label });
  }

  /** Hides the webview's window. */
  async hide(): Promise<void> {
    await invoke("plugin:window|hide", { label: this.label });
  }

  /** Shows the webview's window. */
  async show(): Promise<void> {
    await invoke("plugin:window|show", { label: this.label });
  }

  /** Closes the webview's window. */
  async close(): Promise<void> {
    await invoke("plugin:window|close", { label: this.label });
  }

  /** Sets the web content zoom factor (CSS zoom). */
  async setZoom(zoom: number): Promise<void> {
    await invoke("plugin:window|set_zoom", {
      label: this.label,
      zoom,
    });
  }
}

/** All live webviews as `Webview` handles. */
export async function getAllWebviews(): Promise<Webview[]> {
  const labels = await invoke<string[]>("plugin:window|get_all_windows", {});
  return labels.map((l) => new Webview(l));
}
