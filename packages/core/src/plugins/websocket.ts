/**
 * `plugin:websocket|*` — WebSocket client bridging messages to frontend events.
 * Translated from Tauri's `tauri-plugin-websocket` (simplified: text messages,
 * one connection per client id). Incoming messages are pushed as
 * `ztron://websocket-message` events; connect/disconnect emit
 * `ztron://websocket-status`.
 */
import type { Plugin } from "../plugin.js";

interface WsLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
}

type WsCtor = new (url: string) => WsLike;

export function websocketPlugin(): Plugin {
  const sockets = new Map<number, WsLike>();
  let nextId = 1;

  return {
    name: "websocket",
    commands: {
      async connect(args, ctx) {
        const { url } = args as { url: string };
        if (!/^wss?:\/\//i.test(url)) {
          throw new Error(`websocket: invalid url: ${url}`);
        }
        const Ctor = (globalThis as { WebSocket?: WsCtor }).WebSocket;
        if (!Ctor) {
          throw new Error("websocket: runtime has no WebSocket");
        }
        const id = nextId++;
        const ws = new Ctor(url);
        sockets.set(id, ws);
        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error("websocket connect failed"));
        });
        ws.onmessage = (e) => {
          const message = typeof e.data === "string" ? e.data : String(e.data);
          ctx.app.emit("ztron://websocket-message", { id, message });
        };
        ws.onclose = () => {
          sockets.delete(id);
          ctx.app.emit("ztron://websocket-status", { id, state: "closed" });
        };
        return { id };
      },
      send(args) {
        const { id, message } = args as { id: number; message: string };
        const ws = sockets.get(Number(id));
        if (!ws) throw new Error(`websocket: no connection for id ${id}`);
        ws.send(String(message));
      },
      disconnect(args) {
        const { id } = args as { id: number };
        const ws = sockets.get(Number(id));
        if (ws) {
          ws.close();
          sockets.delete(Number(id));
        }
      },
    },
    permissions: [
      {
        identifier: "websocket:allow-connect",
        commands: ["plugin:websocket|connect"],
      },
      {
        identifier: "websocket:allow-send",
        commands: ["plugin:websocket|send"],
      },
      {
        identifier: "websocket:allow-disconnect",
        commands: ["plugin:websocket|disconnect"],
      },
    ],
    permissionSets: [
      {
        name: "websocket:default",
        description: "Allows WebSocket connect/send/disconnect.",
        permissions: [
          "websocket:allow-connect",
          "websocket:allow-send",
          "websocket:allow-disconnect",
        ],
      },
    ],
  };
}
