/**
 * Backend side of a streaming Channel. Translated from Tauri's
 * `crates/tauri/src/ipc/channel.rs`. Messages carry a monotonically
 * increasing index; the frontend `Channel` class preserves ordering.
 */
import type { WebviewHandle } from "../runtime.js";
import { formatCallback } from "./formatCallback.js";

export class ChannelHandle<T = unknown> {
  readonly id: number;
  #webview: WebviewHandle;
  #nextIndex = 0;
  #ended = false;

  constructor(id: number, webview: WebviewHandle) {
    this.id = id;
    this.#webview = webview;
  }

  /** Sends one ordered message to the frontend channel. */
  send(message: T): void {
    if (this.#ended) {
      throw new Error(`channel ${this.id} has already ended`);
    }
    this.#webview.eval(
      formatCallback(this.id, { message, index: this.#nextIndex }),
    );
    this.#nextIndex += 1;
  }

  /** Signals the end of the stream. */
  end(): void {
    if (this.#ended) {
      return;
    }
    this.#ended = true;
    this.#webview.eval(
      formatCallback(this.id, { end: true, index: this.#nextIndex }),
    );
  }

  get ended(): boolean {
    return this.#ended;
  }
}
