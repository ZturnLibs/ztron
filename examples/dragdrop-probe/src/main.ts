/**
 * dragdrop-probe — file drag-drop verification spike (GAP H8).
 * Self-driving: the page bootstraps one "run" command; the backend drives
 * the whole sequence through the host-only dragdrop_simulate op, which
 * builds a real CF_HDROP payload (DROPFILES + UTF-16 multi-sz) and runs the
 * production extractor + emitters — the same code a genuine OLE drop takes,
 * minus the OS drag loop a terminal CI cannot drive.
 *
 *   1. DRAG_SEQ_OK       — simulate -> drag_enter(paths,pos) then
 *                          drag_over(pos) -> drag_drop(paths,pos) ->
 *                          drag_leave, positions client-local physical;
 *   2. DRAG_PATHS_OK     — both simulated paths survive the CF_HDROP
 *                          round-trip verbatim;
 *   3. DRAG_DISABLE_OK   — set_file_drop_enabled(false) silences events
 *                          (the gate lives in the drop target + simulate);
 *   4. DRAG_REENABLE_OK  — re-enable restores the full sequence.
 *
 * The core-owned window-event slot is deliberately overridden here: this
 * probe window subscribes to nothing else, so rerouting drag events away
 * from the page-facing event bus costs nothing (see note in run()).
 *
 * Run: ztron check --expect DRAG_SEQ_OK --expect DRAG_PATHS_OK \
 *        --expect DRAG_DISABLE_OK --expect DRAG_REENABLE_OK
 */
import { AppBuilder } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const invokeKey = tjs.env.ZTRON_INVOKE_KEY ?? "k";

type DragEvent = {
  event: string;
  paths?: string[];
  x?: number;
  y?: number;
};

const sendReq = (
  runtime as unknown as {
    sendRequest: (
      op: string,
      payload?: Record<string, unknown>,
      from?: string,
    ) => Promise<unknown>;
  }
).sendRequest.bind(runtime);

/* Paths need not exist on disk: CF_HDROP extraction (DragQueryFileW) reads
   the payload, never the filesystem. Forward slashes keep the JSON escapes
   out of the assertion. */
const SIM_PATHS = ["C:/ztron-dragprobe/a.txt", "C:/ztron-dragprobe/b.bin"];
const SIM_X = 120;
const SIM_Y = 80;

const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const simulate = () =>
  sendReq("dragdrop_simulate", { paths: SIM_PATHS, x: SIM_X, y: SIM_Y }) as
    Promise<unknown>;

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">dragdrop-probe</h1>
<script>
(function go(n) {
  try {
    window.__ZTRON_INTERNALS__.invoke("run", {}).then(
      function () {},
      function (e) { console.log("[dragprobe] run err " + e); }
    );
  } catch (e) {
    if (n > 0) setTimeout(function () { go(n - 1); }, 400);
  }
})(10);
</script>`;

const app = new AppBuilder(runtime, "com.ztron.dragdropprobe")
  .configure({ invokeKey })
  .window({ label: "main", title: "dragdrop-probe", width: 480, height: 320, html: page })
  .setup((app) => {
    console.log("[dragprobe] setup registered");
    app.command("run", async () => {
      console.log("[dragprobe] run fired");
      const w = app.getWebview("main");
      if (!w) {
        console.log("DRAG_ENV_FAIL:no main handle");
        return { ok: false };
      }

      /* Override core's window-event slot (app.ts routes events to the
         page bus). This window's page listens to nothing, so capturing the
         events backend-side is lossless for the probe. */
      const events: DragEvent[] = [];
      w.onWindowEvent((event, payload) => {
        if (!String(event).startsWith("drag-")) return;
        const p = (payload ?? {}) as {
          paths?: string[];
          position?: { x: number; y: number };
        };
        events.push({
          event: String(event),
          paths: p.paths,
          x: p.position?.x,
          y: p.position?.y,
        });
      });

      const sequenceOk = (tag: string) => {
        const kinds = events.map((e) => e.event);
        const [enter, over, drop, leave] = events;
        const posOk = (e: DragEvent | undefined) =>
          !!e && e.x === SIM_X && e.y === SIM_Y;
        if (kinds.join(",") !== "drag-enter,drag-over,drag-drop,drag-leave") {
          console.log(`${tag}_FAIL order=[${kinds.join(" ")}]`);
          return false;
        }
        if (!posOk(enter) || !posOk(over) || !posOk(drop)) {
          console.log(
            `${tag}_FAIL pos enter=${enter?.x},${enter?.y} over=${over?.x},${over?.y} drop=${drop?.x},${drop?.y}`,
          );
          return false;
        }
        if (leave?.paths !== undefined || leave?.x !== undefined) {
          console.log(`${tag}_FAIL leave carries payload ${JSON.stringify(leave)}`);
          return false;
        }
        return true;
      };

      const pathsOk = (tag: string) => {
        const enter = events.find((e) => e.event === "drag-enter");
        const drop = events.find((e) => e.event === "drag-drop");
        const same = (a?: string[]) =>
          !!a && a.length === SIM_PATHS.length &&
          SIM_PATHS.every((p, i) => a[i] === p);
        if (!same(enter?.paths) || !same(drop?.paths)) {
          console.log(
            `${tag}_FAIL paths enter=${JSON.stringify(enter?.paths)} drop=${JSON.stringify(drop?.paths)}`,
          );
          return false;
        }
        return true;
      };

      try {
        /* 1+2: enabled window -> full sequence, paths intact. */
        await simulate();
        await settle();
        if (sequenceOk("DRAG_SEQ")) console.log("DRAG_SEQ_OK");
        if (pathsOk("DRAG_PATHS")) console.log("DRAG_PATHS_OK");

        /* 3: disabled -> the gate swallows everything (no events at all). */
        w.windowState("set_file_drop_enabled", false);
        await settle(150);
        const before = events.length;
        await simulate();
        await settle();
        console.log(
          events.length === before ? "DRAG_DISABLE_OK" : `DRAG_DISABLE_FAIL got ${events.length - before} events while disabled`,
        );

        /* 4: re-enable -> sequence returns. */
        w.windowState("set_file_drop_enabled", true);
        await settle(150);
        const before2 = events.length;
        await simulate();
        await settle();
        const window2 = events.slice(before2);
        const kinds2 = window2.map((e) => e.event).join(",");
        console.log(
          kinds2 === "drag-enter,drag-over,drag-drop,drag-leave"
            ? "DRAG_REENABLE_OK"
            : `DRAG_REENABLE_FAIL order=[${kinds2}]`,
        );
      } catch (e) {
        console.log("DRAG_RUN_FAIL " + String(e).slice(0, 160));
      }

      await settle();
      w.terminate();
      return { ok: true };
    });
  })
  .build();

await app.run().catch((e) => console.log("[dragprobe] ERROR", String(e)));
