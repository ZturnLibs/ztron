/**
 * Raw IPC responses — Ztron's equivalent of Tauri's
 * `InvokeResponseBody::Raw` (`tauri::ipc::Response::new(bytes)`).
 *
 * Any command handler may return a `RawResponse` to deliver binary data: the
 * IpcHub serializes it as the wire envelope `{"__ZTRON_RAW__":"<base64>"}` and
 * the injected `__TAURI_INTERNALS__.invoke` unwraps it into a `Uint8Array`
 * before the promise resolves — so frontend `invoke<Uint8Array>(...)` reads
 * binary directly, and base64 decoding lives in exactly one place.
 *
 * NOTE ON "MESSAGEPACK": Tauri v2's desktop IPC has no MessagePack — its
 * payload enum is `InvokeBody::{Json, Raw(Vec<u8>)}` / `InvokeResponseBody::
 * {Json, Raw}` (see crates/tauri/src/ipc/mod.rs). On Android `Raw` is not
 * supported and the official recommendation IS a base64 string. Ztron's
 * base64-in-JSON wire therefore mirrors the Tauri-sanctioned encoding for
 * string-bound transports (webview_bind only carries C strings), with this
 * module providing the Raw *semantics* on top.
 */

/** Wire envelope key. A plain JSON result never carries this key — the hub
 * only emits it for `RawResponse` instances (instanceof-checked), and the
 * injected invoke unwraps it before the app sees the value. */
export const RAW_RESPONSE_KEY = "__ZTRON_RAW__";

/** A binary command result, delivered to the frontend as `Uint8Array`. */
export class RawResponse {
  readonly base64: string;

  constructor(base64: string) {
    this.base64 = base64;
  }
}

/**
 * Serializes a command result for the wire: RawResponse instances become the
 * `__ZTRON_RAW__` envelope; everything else is plain JSON.
 */
export function serializeResult(value: unknown): string {
  if (value instanceof RawResponse) {
    return JSON.stringify({ [RAW_RESPONSE_KEY]: value.base64 });
  }
  return JSON.stringify(value ?? null);
}

/**
 * Decodes the wire envelope into bytes — the same transform the injected
 * invoke performs (`b64 -> Uint8Array`). Non-envelope values pass through.
 * Exported for the mock runtime (tests) to mirror the injected layer.
 */
export function unwrapRawResponse<T>(value: T): T | Uint8Array {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as Record<string, unknown>)[RAW_RESPONSE_KEY] === "string"
  ) {
    const b64 = (value as Record<string, unknown>)[RAW_RESPONSE_KEY] as string;
    try {
      const bin = atob(b64);
      const out = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    } catch {
      // Invalid base64: NEVER throw here — callers invoke this inside a
      // resolve() argument, where a throw would hang the promise forever.
      // Pass the envelope through so the misbehavior is observable.
      return value;
    }
  }
  return value;
}
