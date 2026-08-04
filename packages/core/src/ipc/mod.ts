/**
 * IPC protocol — translated from Tauri's `crates/tauri/src/ipc/mod.rs`.
 *
 * Transport: the injected `__TAURI_INTERNALS__.invoke` calls the bound
 * `window.__TAURI_IPC__` global (via `webview_bind`). The runtime adapter
 * receives `(id, req)` where `req` is a JSON array of the JS arguments.
 * The command result is returned through `webview_return(id, status, result)`,
 * giving native Promise semantics on the frontend.
 */

import type { CommandContext } from "../commands/index.js";
import type { WebviewHandle } from "../runtime.js";

/** The message sent from the frontend for every `invoke`. */
export interface InvokeMessage {
  cmd: string;
  payload: unknown;
  /** Forwarded request headers (plain record — core has no DOM dependency). */
  options?: { headers?: Record<string, string> };
  /** Anti-injection key; must match what the `inject` package embeds. */
  __TAURI_INVOKE_KEY__?: string;
}

/** A Channel reference embedded in a payload as `__CHANNEL__:<id>`. */
export interface ChannelRef {
  kind: "channel";
  id: number;
}

/** Resolves `__CHANNEL__:<id>` markers inside a payload. */
export function deserializeChannelRefs(payload: unknown): {
  payload: unknown;
  channels: ChannelRef[];
} {
  const channels: ChannelRef[] = [];
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const m = /^__CHANNEL__:(\d+)$/.exec(value);
      if (m) {
        const ref: ChannelRef = { kind: "channel", id: Number(m[1]) };
        channels.push(ref);
        return ref;
      }
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };
  return { payload: walk(payload), channels };
}

/** A command handler. Args are the raw (channel-resolved) command payload. */
export type InvokeHandler = (
  args: unknown,
  ctx: CommandContext,
) => unknown | Promise<unknown>;

/** The hub that dispatches frontend IPC messages to registered commands. */
export class IpcHub {
  #commands = new Map<string, InvokeHandler>();

  register(cmd: string, handler: InvokeHandler): void {
    this.#commands.set(cmd, handler);
  }

  has(cmd: string): boolean {
    return this.#commands.has(cmd);
  }

  /**
   * Handles one raw bind request. `req` is the JSON array string of the
   * JS arguments; resolves/rejects the frontend promise via `handle.respond`.
   *
   * Synchronous command results are responded to immediately (no microtask
   * hop), so the round trip completes within a single bind callback. This is
   * important while `webview_run` blocks the JS thread (see DESIGN.md M0).
   */
  async handle(
    webview: WebviewHandle,
    id: string,
    req: string,
    invokeKey: string,
    ctx: (webview: WebviewHandle, args: unknown) => CommandContext,
  ): Promise<void> {
    let message: InvokeMessage;
    try {
      const [rawMessage] = JSON.parse(req) as [unknown];
      message = parseMessage(rawMessage, invokeKey);
    } catch (err) {
      webview.respond(id, 1, serialize(serializeError(err)));
      return;
    }

    const handler = this.#commands.get(message.cmd);
    if (!handler) {
      webview.respond(
        id,
        1,
        serialize({ error: `command ${message.cmd} not found` }),
      );
      return;
    }

    const { payload } = deserializeChannelRefs(message.payload);
    const commandCtx = ctx(webview, payload);

    try {
      const result = handler(payload, commandCtx);
      if (result instanceof Promise) {
        const value = await result;
        webview.respond(id, 0, serialize(value));
      } else {
        webview.respond(id, 0, serialize(result));
      }
    } catch (err) {
      webview.respond(id, 1, serialize(serializeError(err)));
    }
  }

  /** The string the injected `__TAURI_INTERNALS__.invoke` posts as arg #1. */
  static buildRequest(cmd: string, args: unknown): string {
    return JSON.stringify({ cmd, payload: args });
  }
}

function parseMessage(raw: unknown, invokeKey: string): InvokeMessage {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("invalid IPC message: expected an object");
  }
  const message = raw as Record<string, unknown>;
  if (
    message.__TAURI_INVOKE_KEY__ !== undefined &&
    message.__TAURI_INVOKE_KEY__ !== invokeKey
  ) {
    throw new Error("IPC message rejected: invalid invoke key");
  }
  if (typeof message.cmd !== "string") {
    throw new Error("invalid IPC message: missing cmd");
  }
  return {
    cmd: message.cmd,
    payload: message.payload,
    options: message.options as InvokeMessage["options"],
  };
}

function serialize(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  const json = JSON.stringify(value);
  return json ?? "";
}

/** Flattens a thrown error to a JSON-serializable value. */
function serializeError(err: unknown): { error: string } {
  if (err instanceof Error) {
    return { error: err.message };
  }
  return { error: String(err) };
}
