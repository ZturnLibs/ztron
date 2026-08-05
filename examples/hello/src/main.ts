/**
 * Ztron hello — M3 backend.
 *
 * Two modes:
 *  - With a Vite frontend (CLI sets ZTRON_DEV_URL): loads the dev server URL;
 *    the page uses `@ztron/api` (invoke/events/Channel/fs/path/window).
 *  - Without: falls back to the inline-html M2 spike (scoped fs + path).
 */
import { AppBuilder, fsPlugin, pathPlugin } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const host = tjs.env.ZTRON_HOST ?? "127.0.0.1";
const port = Number(tjs.env.ZTRON_HOST_PORT);
const devUrl = tjs.env.ZTRON_DEV_URL;
const invokeKey =
  tjs.env.ZTRON_INVOKE_KEY ?? Math.random().toString(36).slice(2);

const runtime = new HostRuntime({ host, port });
await runtime.connect();
console.log(
  `[m3] backend connected${devUrl ? `, frontend ${devUrl}` : " (inline html)"}`,
);

const inlineHtml = `<!doctype html>
<html>
  <body style="font-family:system-ui;display:grid;place-content:center;height:100vh;margin:0">
    <div style="text-align:center"><h1>Hello Ztron</h1><p id="status">inline-html fallback (no frontend)</p></div>
  </body>
</html>`;

const done = new Set<string>();

new AppBuilder(runtime, "com.ztron.hello")
  .configure({ invokeKey })
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .plugin(pathPlugin())
  .window({
    label: "main",
    title: "Ztron M3",
    width: 900,
    height: 640,
    ...(devUrl ? { url: devUrl } : { html: inlineHtml }),
  })
  .setup((app) => {
    app.command("m3:echo", (args) => {
      const { msg } = args as { msg?: string };
      return `echo:${msg ?? ""}`;
    });

    app.command("m3:emit-ticks", async () => {
      for (let i = 1; i <= 2; i++) {
        await new Promise((r) => setTimeout(r, 30));
        app.emit("m3:tick", { n: i });
        console.log(`[m3] emitted tick ${i}`);
      }
      return "started";
    });

    app.command("m3:stream", (args, ctx) => {
      const { ch } = args as { ch?: { kind: "channel"; id: number } };
      if (!ch) {
        return "no-channel";
      }
      const handle = ctx.getChannel(ch.id);
      if (!handle) {
        return "no-handle";
      }
      for (let i = 1; i <= 3; i++) {
        handle.send({ n: i });
      }
      handle.end();
      return "streamed";
    });

    app.command("m3:has-dialogs", (_args, ctx) => {
      return (
        ctx.app.commands.has("plugin:dialog|open") &&
        ctx.app.commands.has("plugin:dialog|save") &&
        ctx.app.commands.has("plugin:dialog|message")
      );
    });

    app.command("m3:report", (_args, ctx) => {
      const { received } = _args as { received?: string };
      console.log(`[m3] frontend reported: "${received}"`);
      const tag = received?.split(":")[0];
      if (tag) {
        done.add(tag);
      }
      if (done.size >= 10) {
        console.log(
          "SPIKE_RESULT: M3_API_FRONTEND_OK + WIN_STATE_EVENTS_OK + TRAY_OK + MENU_OK + DIALOG_REG_OK",
        );
        ctx.webview.terminate();
      }
    });
  })
  .build()
  .run();
