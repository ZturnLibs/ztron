/**
 * Scoped HTTP client — mirrors `plugin:http|fetch` from `@zturnlibs/core`.
 * Every request is checked against the app's configured HTTP scope.
 */
import { invoke, Channel } from "./core.js";
import type { InvokeArgs } from "./core.js";

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

export interface FetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Abort the request after N milliseconds. */
  timeoutMs?: number;
}

/** Performs a scoped HTTP request; throws if the URL is out of scope. */
export function fetch(
  url: string,
  options: FetchOptions = {},
): Promise<HttpResponse> {
  const args: InvokeArgs = { url, ...options };
  return invoke<HttpResponse>("plugin:http|fetch", args);
}

/** A streaming response: headers first, body chunks as they arrive. */
export interface HttpStreamResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  /** The response body as a byte stream (resolves progressively). */
  body: ReadableStream<Uint8Array>;
}

type StreamMsg = { b64?: string; done?: boolean; error?: string };

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Performs a scoped HTTP request whose body is delivered as a stream: the
 * returned promise resolves as soon as status + headers are available, and
 * `body` yields each network chunk (`Uint8Array`) as it arrives — the app
 * never has to buffer the whole response. Errors mid-stream reject the
 * `body` read.
 */
export async function fetchStream(
  url: string,
  options: FetchOptions = {},
): Promise<HttpStreamResponse> {
  // Push (Channel onmessage) -> pull (ReadableStream) bridge.
  const queue: StreamMsg[] = [];
  let notify: (() => void) | null = null;
  let streamEnded = false;
  let streamError: string | null = null;

  const channel = new Channel<StreamMsg>((msg) => {
    queue.push(msg);
    if (msg.error) streamError = msg.error;
    if (msg.done || msg.error) streamEnded = true;
    notify?.();
    notify = null;
  });

  const head = await invoke<Omit<HttpResponse, "body">>(
    "plugin:http|fetch",
    { url, ...options, channel },
  );

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (queue.length > 0) {
          const msg = queue.shift()!;
          if (msg.error) {
            controller.error(new Error(msg.error));
            return;
          }
          if (msg.done) {
            controller.close();
            return;
          }
          if (msg.b64) {
            controller.enqueue(fromB64(msg.b64));
            return;
          }
          continue;
        }
        if (streamEnded && queue.length === 0) {
          // end-of-stream without an explicit done (defensive)
          controller.close();
          return;
        }
        await new Promise<void>((r) => {
          notify = r;
        });
      }
    },
    cancel() {
      streamEnded = true;
      notify?.();
      notify = null;
    },
  });

  return { status: head.status, ok: head.ok, headers: head.headers, body };
}

export const http = { fetch, fetchStream };
