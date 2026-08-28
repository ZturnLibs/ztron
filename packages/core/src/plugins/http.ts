/**
 * `plugin:http|*` — scoped HTTP client wrapping `fetch`.
 *
 * Translated from Tauri's `tauri-plugin-http`. Every request is gated by an
 * {@link HttpScope}: the URL is matched against the configured allowlist
 * before the request is dispatched.
 */
import { HttpScope, type HttpScopeConfig } from "../httpScope.js";
import { RawResponse } from "../ipc/raw.js";
import type { Plugin } from "../plugin.js";
import type { CommandContext } from "../commands/index.js";
import { bytesToB64 } from "./fs.js";

export interface HttpPluginOptions {
  scope?: HttpScopeConfig;
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
}

/** Wire messages for streaming fetch (pushed over the request Channel). */
export type HttpStreamMessage =
  | { b64: string }
  | { done: true }
  | { error: string };

export function httpPlugin(options: HttpPluginOptions = {}): Plugin {
  const scope = new HttpScope(options.scope ?? { allow: [] });

  /** Streams a fetch body chunk-by-chunk over a ChannelHandle. */
  async function pumpStream(
    chan: import("../ipc/channel.js").ChannelHandle<HttpStreamMessage>,
    body: { getReader(): { read(): Promise<{ done: boolean; value?: unknown }> } } | null,
  ): Promise<void> {
    try {
      if (body) {
        const reader = body.getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const bytes = value as Uint8Array | undefined;
          if (bytes && bytes.length > 0) {
            chan.send({
              b64: bytesToB64(
                new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
              ),
            });
          }
        }
      }
      chan.send({ done: true });
    } catch (err) {
      chan.send({ error: String((err as Error)?.message ?? err) });
    } finally {
      chan.end();
    }
  }

  return {
    name: "http",
    commands: {
      async fetch(args, ctx) {
        const { url, method, headers, body, timeoutMs, responseType } = args as {
          url: string;
          method?: string;
          headers?: Record<string, string>;
          /** string | Uint8Array/ArrayBuffer(b64 envelope) | plain object (auto-JSON). */
          body?:
            | string
            | { __bytesB64?: string; json?: unknown };
          /** Abort the request after N ms (scope-checked URL only). */
          timeoutMs?: number;
          /** "text" (default) | "json" | "binary" (Raw b64 envelope). */
          responseType?: "text" | "json" | "binary";
        };
        if (!scope.permits(url)) {
          throw new Error(`http scope denied: ${url}`);
        }
        // Body normalization (G9/D4): plain objects serialize to JSON with an
        // implicit content-type; binary arrives as a {__bytesB64} envelope
        // (FormData/streams are explicitly unsupported under tjs fetch).
        let wireBody: string | Uint8Array | undefined;
        const mergedHeaders: Record<string, string> = { ...(headers ?? {}) };
        if (body != null) {
          if (typeof body === "string") {
            wireBody = body;
          } else if (typeof (body as { __bytesB64?: string }).__bytesB64 === "string") {
            wireBody = Buffer.from(
              (body as { __bytesB64: string }).__bytesB64,
              "base64",
            );
            mergedHeaders["content-type"] ??=
              "application/octet-stream";
          } else {
            wireBody = JSON.stringify(body);
            mergedHeaders["content-type"] ??= "application/json";
          }
        }
        const resp = await fetch(url, {
          method: method ?? "GET",
          headers: mergedHeaders,
          body: wireBody,
          ...(timeoutMs && timeoutMs > 0
            ? { signal: AbortSignal.timeout(timeoutMs) }
            : {}),
        });
        const respHeaders: Record<string, string> = {};
        resp.headers.forEach((v, k) => {
          respHeaders[k] = v;
        });

        // Streaming mode: a resolved `channel` marker switches the handler
        // from "buffer whole body" to "push each network chunk". The invoke
        // resolves with status/headers immediately; the body is delivered as
        // {b64} / {done} / {error} messages (mirrors how the frontend keeps
        // Tauri's fetch()-streaming feel without buffering). "done" is an
        // explicit message because the Channel end signal is not observable
        // through onmessage on the frontend side.
        const channelRef = (args as { channel?: unknown }).channel as
          | { kind?: string; id?: number }
          | undefined;
        if (
          ctx &&
          channelRef &&
          channelRef.kind === "channel" &&
          typeof channelRef.id === "number"
        ) {
          const chan = ctx.getChannel(channelRef.id);
          if (chan) {
            void pumpStream(chan, resp.body);
            const out: Omit<HttpResponse, "body"> = {
              status: resp.status,
              ok: resp.ok,
              headers: respHeaders,
            };
            return out;
          }
        }

        if (responseType === "json") {
          const text = await resp.text();
          let parsed: unknown = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = null; // parity: upstream yields null on non-JSON bodies
          }
          return { status: resp.status, ok: resp.ok, headers: respHeaders, json: parsed };
        }
        if (responseType === "binary") {
          const buf = new Uint8Array(await resp.arrayBuffer());
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < buf.length; i += chunk) {
            bin += String.fromCharCode(...buf.subarray(i, i + chunk));
          }
          return new RawResponse(btoa(bin));
        }
        const text = await resp.text();
        const out: HttpResponse = {
          status: resp.status,
          ok: resp.ok,
          headers: respHeaders,
          body: text,
        };
        return out;
      },
    },
    permissions: [
      {
        identifier: "http:allow-fetch",
        description: "Allows scoped HTTP requests via plugin:http|fetch.",
        commands: ["plugin:http|fetch"],
      },
      {
        identifier: "http:deny-fetch",
        description: "Explicitly denies all HTTP requests.",
        commands: ["!plugin:http|fetch"],
      },
    ],
    permissionSets: [
      {
        name: "http:default",
        description: "Allows HTTP requests (subject to scope URL allowlist).",
        permissions: ["http:allow-fetch"],
      },
    ],
  };
}
