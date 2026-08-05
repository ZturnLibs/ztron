/**
 * Window control API — a minimal port of `@tauri-apps/api/window`,
 * backed by the built-in `plugin:window|*` commands.
 */
import { invoke } from "./core.js";

export class Window {
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  /** The current window (v1: single window, label `main`). */
  static getCurrent(): Window {
    const label = (
      globalThis.window?.__TAURI_INTERNALS__?.metadata as
        { label?: string } | undefined
    )?.label;
    return new Window(label ?? "main");
  }

  async setTitle(title: string): Promise<void> {
    await invoke("plugin:window|set_title", { label: this.label, title });
  }

  async setSize(width: number, height: number): Promise<void> {
    await invoke("plugin:window|set_size", {
      label: this.label,
      width,
      height,
    });
  }

  async close(): Promise<void> {
    await invoke("plugin:window|close", { label: this.label });
  }
}
