/**
 * WebSocket API — a port of Tauri's `tauri-plugin-websocket`, backed by the
 * `plugin:websocket|*` commands and the `tauri://websocket-*` events.
 */
import { invoke } from "./core.js";
import { listen } from "./event.js";

/** Opens a WebSocket connection; resolves with a connection id. */
export async function connect(url: string): Promise<{ id: number }> {
  return invoke<{ id: number }>("plugin:websocket|connect", { url });
}

/** Sends a text message on a connection. */
export async function sendMessage(id: number, message: string): Promise<void> {
  await invoke("plugin:websocket|send", { id, message });
}

/** Closes a connection. */
export async function disconnect(id: number): Promise<void> {
  await invoke("plugin:websocket|disconnect", { id });
}

/** Listens for incoming messages: handler({ id, message }). */
export async function onMessage(
  handler: (event: { id: number; message: string }) => void,
): Promise<() => Promise<void>> {
  return listen<{ id: number; message: string }>(
    "tauri://websocket-message",
    (e) => handler(e.payload),
  );
}

/** Listens for connection state changes: handler({ id, state }). */
export async function onStatus(
  handler: (event: { id: number; state: string }) => void,
): Promise<() => Promise<void>> {
  return listen<{ id: number; state: string }>(
    "tauri://websocket-status",
    (e) => handler(e.payload),
  );
}

export const websocket = {
  connect,
  sendMessage,
  disconnect,
  onMessage,
  onStatus,
};
