/**
 * M1 spike — events + Channel streaming + window commands (Plan A).
 *
 * The inline page exercises the exact protocol wrapped by `@ztron/api`
 * (listen / Channel / window): registers an event listener, streams ordered
 * messages over a Channel, and drives window setTitle/setSize. The backend
 * reports each step back and terminates when all three pass.
 *
 * Run: pnpm --filter @ztron/example-hello dev
 */
import { AppBuilder } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(`[m1] backend connected to host ${host}:${port}`);

const html = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Ztron M1</title></head>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center">
      <h1>Ztron M1</h1>
      <p>events: <span id="ev">-</span></p>
      <p>channel: <span id="ch">-</span></p>
      <p>window: <span id="win">-</span></p>
      <p id="status">running...</p>
    </div>
    <script>
      const I = window.__TAURI_INTERNALS__;
      const report = (received) => I.invoke("m1:report", { received });

      // Minimal Channel (same protocol as @ztron/api Channel).
      class Channel {
        constructor(onmessage) {
          this.id = I.transformCallback((raw) => onmessage(raw));
        }
        toJSON() { return "__CHANNEL__:" + this.id; }
      }

      async function run() {
        const status = document.getElementById("status");

        // 1. EVENTS — listen to m1:tick, ask the backend to emit 3 ticks.
        let ticks = 0;
        const unlisten = await I.invoke("plugin:event|listen", {
          event: "m1:tick",
          target: { kind: "Any" },
          handler: I.transformCallback((event) => {
            ticks++;
            document.getElementById("ev").textContent = "tick " + event.payload.n;
            if (ticks === 3) report("EVENTS_OK:" + event.id);
          }),
        });
        await I.invoke("m1:start", {});

        // 2. CHANNEL — stream 3 ordered messages from the backend.
        const msgs = [];
        const channel = new Channel((raw) => {
          if (raw.end) {
            const joined = msgs.map((m) => m.n ?? m).join(",");
            document.getElementById("ch").textContent = joined;
            report("CHANNEL_OK:" + joined);
          } else {
            msgs.push(raw.message);
          }
        });
        const streamed = await I.invoke("m1:stream", { ch: channel });
        status.textContent = "stream: " + streamed;

        // 3. WINDOW — setTitle + setSize through plugin:window|*.
        await I.invoke("plugin:window|set_title", { label: "main", title: "Ztron M1" });
        await I.invoke("plugin:window|set_size", { label: "main", width: 640, height: 480 });
        document.getElementById("win").textContent = "title/size set";
        report("WINDOW_OK");
      }

      window.addEventListener("DOMContentLoaded", run);
    </script>
  </body>
</html>`;

const done = new Set<string>();

new AppBuilder(runtime, "com.ztron.hello")
  .window({
    label: "main",
    title: "Ztron M1",
    width: 800,
    height: 600,
    html,
  })
  .setup((app) => {
    // Backend-driven async emits (proves the backend event loop is live).
    app.command("m1:start", async () => {
      for (let i = 1; i <= 3; i++) {
        await new Promise((r) => setTimeout(r, 30));
        app.emit("m1:tick", { n: i });
        console.log(`[m1] emitted tick ${i}`);
      }
      return "started";
    });

    // Channel streaming command.
    app.command("m1:stream", (args, ctx) => {
      const { ch } = args as { ch?: { kind: "channel"; id: number } };
      if (!ch) return "no-channel";
      const handle = ctx.getChannel(ch.id);
      if (!handle) return "no-handle";
      for (let i = 1; i <= 3; i++) {
        handle.send({ n: i });
      }
      handle.end();
      console.log("[m1] streamed 3 messages");
      return "streamed";
    });

    app.command("m1:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[m1] frontend reported: "${received}"`);
      const tag = received?.split(":")[0];
      if (tag) {
        done.add(tag);
      }
      if (done.size >= 3) {
        console.log("SPIKE_RESULT: M1_EVENTS_CHANNEL_WINDOW_OK");
        ctx.webview.terminate();
      }
    });
  })
  .build()
  .run();
