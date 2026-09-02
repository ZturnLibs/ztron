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
    const meta = globalThis.window?.__ZTRON_INTERNALS__?.metadata as
      | { label?: string; currentWebview?: { label?: string } }
      | undefined;
    return new Webview(
      meta?.currentWebview?.label ?? meta?.label ?? "main",
    );
  }

  /**
   * Opens the page print dialog (wry parity: delegates to the page's own
   * window.print()).
   */
  async print(): Promise<void> {
    await invoke("plugin:webview|print", { label: this.label });
  }

  /** Webview-layer background color (single-webview era: window surface). */
  async setBackgroundColor(color: string): Promise<void> {
    await invoke("plugin:webview|set_background_color", {
      label: this.label,
      color,
    });
  }

  /**
   * Toggles the inspector. Upstream parity note: macOS WKWebView exposes no
   * public toggle (devtools are enabled in debug builds), so the host
   * reports `supported: false` there instead of failing silently.
   */
  async toggleDevtools(): Promise<{
    supported: boolean;
    platform: string;
    reason?: string;
  }> {
    return invoke("plugin:webview|toggle_devtools", { label: this.label });
  }

  /**
   * Webview position (single-webview era: congruent with the owning
   * window's outer position — the bare multi-webview split lands in G7).
   */
  async position(): Promise<{ x: number; y: number }> {
    return invoke("plugin:window|get_position", { label: this.label });
  }

  /** Webview size (window-congruent; see {@linkcode Webview.position}). */
  async size(): Promise<{ width: number; height: number }> {
    return invoke("plugin:window|inner_size", { label: this.label });
  }

  /**
   * Looks up a webview by label. In the single-webview-per-window era a
   * webview exists exactly when its window does.
   */
  static async getByLabel(label: string): Promise<Webview | null> {
    const list = await getAllWebviews();
    return list.find((w) => w.label === label) ?? null;
  }

  /**
   * Host webview capability map (G7): one webview per window on this
   * backend; same-window multi-webview/reparent/autoResize are reported
   * as false instead of silently no-op'ing.
   */
  static async capabilities(): Promise<{
    multipleWebviewsPerWindow: boolean;
    reparent: boolean;
    autoResize: boolean;
    perWindow: boolean;
  }> {
    return invoke("plugin:webview|capabilities", {});
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
  /* G15: real webview registry query (was a window-registry alias). */
  const list = await invoke<Array<{ label: string }>>(
    "plugin:webview|get_all_webviews",
    {},
  );
  return list.map((w) => new Webview(w.label));
}

/** Upstream naming alias of {@linkcode Webview.getCurrent}. */
export const getCurrentWebview = (): Webview => Webview.getCurrent();
