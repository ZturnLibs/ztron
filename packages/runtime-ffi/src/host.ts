/**
 * Host adapter (Plan A) — connects the Ztron backend to the native `ztron-host`
 * process over a newline-delimited JSON TCP stream.
 *
 * The backend runs in txiki.js with a fully functional event loop, so async
 * commands work. Implements the same `RuntimeAdapter` / `WebviewHandle`
 * contract as the FFI adapter.
 */
import type {
  RuntimeAdapter,
  WebviewHandle,
  WindowConfig,
  WindowEvent,
  WindowStateOp,
} from "@ztron/core";
import type { TjsSocket } from "./tjs-global.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Message protocol shared with `native/host/host.c`. */
type WireMessage = {
  type: string;
  [key: string]: unknown;
};

export interface HostRuntimeOptions {
  host?: string;
  port: number;
}

export class HostWebviewHandle implements WebviewHandle {
  #rt: HostRuntime;
  readonly label: string;
  #onMessage: ((id: string, req: string) => void) | null = null;
  #onWindowEvent: ((event: WindowEvent) => void) | null = null;

  constructor(rt: HostRuntime, label: string) {
    this.#rt = rt;
    this.label = label;
  }

  loadUrl(url: string): void {
    this.#rt.send({ type: "navigate", label: this.label, url });
  }

  loadHtml(html: string): void {
    this.#rt.send({ type: "set_html", label: this.label, html });
  }

  eval(js: string): void {
    this.#rt.send({ type: "eval", label: this.label, js });
  }

  setTitle(title: string): void {
    this.#rt.send({ type: "set_title", label: this.label, title });
  }

  setSize(width: number, height: number): void {
    this.#rt.send({ type: "set_size", label: this.label, width, height });
  }

  windowState(op: WindowStateOp, value?: boolean): boolean | Promise<boolean> {
    const query = op.startsWith("is_");
    if (query) {
      return this.#rt.sendQuery(op);
    }
    this.#rt.send({ type: op, label: this.label, value: Boolean(value) });
    return true;
  }

  onWindowEvent(cb: (event: WindowEvent) => void): void {
    this.#onWindowEvent = cb;
  }

  respond(id: string, status: number, result: string): void {
    this.#rt.send({ type: "response", label: this.label, id, status, result });
  }

  onMessage(cb: (id: string, req: string) => void): void {
    this.#onMessage = cb;
  }

  /** Under Plan A the backend does not drive the GUI; keep alive until quit. */
  run(): Promise<void> {
    return this.#rt.closed;
  }

  terminate(): void {
    this.#rt.send({ type: "quit" });
  }

  close(): void {
    this.#rt.send({ type: "close", label: this.label });
  }

  handleRequest(id: string, req: unknown): void {
    // The WebviewHandle contract passes `req` as a JSON-array string
    // (same shape as the webview bind callback); re-serialize the parsed array.
    this.#onMessage?.(id, JSON.stringify(req));
  }

  handleWindowEvent(event: WindowEvent): void {
    this.#onWindowEvent?.(event);
  }
}

export class HostRuntime implements RuntimeAdapter {
  #host: string;
  #port: number;
  #writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  #pending: WireMessage[] = [];
  #handles = new Map<string, HostWebviewHandle>();
  #requests = new Map<number, (result: boolean) => void>();
  #nextReqId = 1;
  #closedResolve: (() => void) | null = null;
  readonly closed: Promise<void>;

  constructor(options: HostRuntimeOptions) {
    this.#host = options.host ?? "127.0.0.1";
    this.#port = options.port;
    this.closed = new Promise((resolve) => {
      this.#closedResolve = resolve;
    });
  }

  /** Connects to the host and starts the line reader. */
  async connect(): Promise<void> {
    const socket = await tjs.connect("tcp", this.#host, this.#port);
    const streams = socket.readable ? socket : await socket.opened;
    if (!streams) {
      throw new Error("host socket has no streams");
    }
    this.#writer = streams.writable.getWriter();
    for (const msg of this.#pending.splice(0)) {
      this.#sendNow(msg);
    }
    this.#readLoop(streams.readable.getReader());
  }

  async #readLoop(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl = buf.indexOf("\n");
        while (nl >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          this.#onLine(line);
          nl = buf.indexOf("\n");
        }
      }
    } catch {
      /* host disconnected */
    }
    this.#closedResolve?.();
  }

  #onLine(line: string): void {
    let msg: WireMessage;
    try {
      msg = JSON.parse(line) as WireMessage;
    } catch {
      return;
    }
    switch (msg.type) {
      case "request": {
        const label = String(msg.label ?? "main");
        const handle = this.#handles.get(label);
        handle?.handleRequest(String(msg.id), msg.req);
        break;
      }
      case "window_event": {
        const label = String(msg.label ?? "main");
        const handle = this.#handles.get(label);
        handle?.handleWindowEvent(String(msg.event) as WindowEvent);
        break;
      }
      case "query_result": {
        const id = Number(msg.req_id);
        const resolve = this.#requests.get(id);
        if (resolve) {
          this.#requests.delete(id);
          resolve(msg.result === true);
        }
        break;
      }
      case "quit":
      case "closed": {
        this.#closedResolve?.();
        break;
      }
    }
  }

  /** Sends a fire-and-forget message. */
  send(msg: WireMessage): void {
    if (this.#writer) {
      this.#sendNow(msg);
    } else {
      this.#pending.push(msg);
    }
  }

  /** Sends a window-state query and awaits the host's boolean reply. */
  sendQuery(op: WindowStateOp): Promise<boolean> {
    const id = this.#nextReqId++;
    return new Promise<boolean>((resolve) => {
      this.#requests.set(id, resolve);
      this.send({ type: op, label: "main", req_id: id });
    });
  }

  #sendNow(msg: WireMessage): void {
    void this.#writer
      ?.write(enc.encode(JSON.stringify(msg) + "\n"))
      .catch(() => {});
  }

  createWindow(config: WindowConfig): WebviewHandle {
    const handle = new HostWebviewHandle(this, config.label);
    this.#handles.set(config.label, handle);
    this.send({
      type: "create_window",
      label: config.label,
      title: config.title,
      width: config.width,
      height: config.height,
      debug: Boolean(config.debug),
    });
    return handle;
  }

  dispose(): void {
    this.#closedResolve?.();
  }
}
