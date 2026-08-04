/**
 * Invoke your custom commands.
 *
 * Translated from `@tauri-apps/api/core` to the Ztron transport contract.
 */
import { internals, type InvokeArgs, type InvokeOptions } from "./internals.js";

/**
 * A key used by special types to define how they serialize across the IPC.
 * If this value changes, keep it in sync with the `inject` package.
 */
export const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";

/**
 * Stores a callback in a known location and returns an identifier the backend
 * can use to `eval()` it later.
 *
 * @returns A unique identifier associated with the callback.
 */
function transformCallback<T = unknown>(
  callback?: (response: T) => void,
  once = false,
): number {
  return internals().transformCallback(callback, once);
}

/**
 * A channel used to receive ordered streaming messages from the backend.
 *
 * The ordering logic is preserved from the Tauri implementation: messages
 * carry a monotonically increasing index and are delivered in order, with
 * out-of-order messages queued until the gap is filled.
 */
export class Channel<T = unknown> {
  /** The callback id returned from {@linkcode transformCallback}. */
  id: number;
  #onmessage: (response: T) => void;

  /** Index used as a mechanism to preserve message order. */
  #nextMessageIndex = 0;
  #pendingMessages: (T | undefined)[] = [];
  #messageEndIndex: number | undefined;

  constructor(onmessage?: (response: T) => void) {
    this.#onmessage = onmessage ?? (() => {});

    this.id = transformCallback<
      { message: T; index: number } | { end: true; index: number }
    >((rawMessage) => {
      const index = rawMessage.index;

      if ("end" in rawMessage) {
        if (index === this.#nextMessageIndex) {
          this.cleanupCallback();
        } else {
          this.#messageEndIndex = index;
        }
        return;
      }

      const message = rawMessage.message;
      if (index === this.#nextMessageIndex) {
        this.#onmessage(message);
        this.#nextMessageIndex += 1;

        while (this.#nextMessageIndex in this.#pendingMessages) {
          const pending = this.#pendingMessages[this.#nextMessageIndex];
          this.#onmessage(pending as T);
          delete this.#pendingMessages[this.#nextMessageIndex];
          this.#nextMessageIndex += 1;
        }

        if (this.#nextMessageIndex === this.#messageEndIndex) {
          this.cleanupCallback();
        }
      } else {
        this.#pendingMessages[index] = message;
      }
    });
  }

  private cleanupCallback(): void {
    internals().unregisterCallback(this.id);
  }

  set onmessage(handler: (response: T) => void) {
    this.#onmessage = handler;
  }

  get onmessage(): (response: T) => void {
    return this.#onmessage;
  }

  [SERIALIZE_TO_IPC_FN](): string {
    return `__CHANNEL__:${this.id}`;
  }

  toJSON(): string {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}

/**
 * Sends a message to the backend.
 *
 * @param cmd The command name.
 * @param args The optional arguments to pass to the command.
 * @param options The request options.
 * @returns A promise resolving or rejecting to the backend response.
 */
export async function invoke<T>(
  cmd: string,
  args: InvokeArgs = {},
  options?: InvokeOptions,
): Promise<T> {
  return internals().invoke<T>(cmd, args, options);
}

/**
 * Converts a device file path to an URL that can be loaded by the WebView.
 *
 * @param filePath The file path.
 * @param protocol The protocol to use. Defaults to `asset`.
 * @returns The URL usable as a source in the WebView.
 */
export function convertFileSrc(filePath: string, protocol = "asset"): string {
  return internals().convertFileSrc(filePath, protocol);
}

/**
 * A backend-owned resource stored through the resource table.
 * Lives in the main process and is released explicitly via {@linkcode close}.
 */
export class Resource {
  readonly #rid: number;

  get rid(): number {
    return this.#rid;
  }

  constructor(rid: number) {
    this.#rid = rid;
  }

  /** Destroys and cleans up this resource from memory. */
  async close(): Promise<void> {
    return invoke("plugin:resources|close", { rid: this.rid });
  }
}

/** Whether the current context is a Ztron WebView. */
export function isZtron(): boolean {
  const w = globalThis as { isTauri?: boolean };
  return Boolean(w.isTauri);
}

export type { InvokeArgs, InvokeOptions };
export { transformCallback };
