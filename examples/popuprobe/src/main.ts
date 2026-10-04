/**
 * popuprobe — GAP H13 programmatic menu popup verification (win32).
 * Backend-driven; the page is a static marker. The host-side modal
 * TrackPopupMenu loop is driven by host-only ops:
 *
 *   1. POPUP_CANCEL_OK — menu_popup_cancel_test opens the REAL modal
 *                          track and a host WM_TIMER cancels it 350ms in;
 *                          TrackPopupMenu must unwind with no selection
 *                          (a stub returns instantly, nothing to cancel);
 *   2. POPUP_LEAF_OK   — menu_popup_select_test injects DOWN,ENTER into
 *                          the tracking menu's input queue from a side
 *                          thread; TPM_RETURNCMD must select the first
 *                          leaf and menu_emit_for_cmd must emit a
 *                          menu_event attributed to the right menu;
 *   3. POPUP_SUB_OK    — same, one extra DOWN opens the submenu; the
 *                          event must carry the SUBMENU's menu id and its
 *                          leaf item id (unique per-menu command bases —
 *                          the old shared-1000+index mapping misattributed
 *                          submenu clicks to the attached/root menu).
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

const sendReq = (
  runtime as unknown as {
    sendRequest: (
      op: string,
      payload?: Record<string, unknown>,
      from?: string,
    ) => Promise<unknown>;
  }
).sendRequest.bind(runtime);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const page = `<style>html,body{background:#fff;margin:0}</style>
<h1 style="color:#888">popuprobe</h1>`;

const app = new AppBuilder(runtime, "com.ztron.popuprobe")
  .configure({ invokeKey: tjs.env.ZTRON_INVOKE_KEY ?? "k" })
  .window({ label: "main", title: "popuprobe", width: 420, height: 240, html: page })
  .build();
void app.run().catch((e) => console.log("[popuprobe] ERROR", String(e)));
await sleep(400);

void (async () => {
  const events: { menuId: string; itemId: string }[] = [];
  runtime.menu.onEvent?.((e) => events.push(e));

  try {
    runtime.menu.createMenu({ id: "ctx", items: [] });
    runtime.menu.addItem("ctx", { id: "alpha", text: "Alpha" });
    runtime.menu.addSubmenu?.("ctx", "ctx.more", "More");
    runtime.menu.addItem("ctx.more", { id: "beta", text: "Beta" });
    runtime.menu.addItem("ctx", { id: "gamma", text: "Gamma" });

    /* 1: real modal track, cancelled by the host timer. */
    const c = await sendReq("menu_popup_cancel_test", { menu_id: "ctx" });
    console.log(c === true ? "POPUP_CANCEL_OK" : `POPUP_CANCEL_FAIL ${String(c)}`);

    /* 2: keyboard-injected leaf selection -> menu_event(ctx, alpha). */
    events.length = 0;
    const s = await sendReq("menu_popup_select_test", { menu_id: "ctx" });
    const leaf = events.find((e) => e.menuId === "ctx" && e.itemId === "alpha");
    console.log(
      s === true && leaf
        ? "POPUP_LEAF_OK ctx/alpha"
        : `POPUP_LEAF_FAIL ${String(s)}:${JSON.stringify(events)}`,
    );

    /* 3: leaf-in-submenu selection -> menu_event(ctx.more, beta). */
    events.length = 0;
    const s2 = await sendReq("menu_popup_select_test", {
      menu_id: "ctx",
      id: "sub",
    });
    const sub = events.find(
      (e) => e.menuId === "ctx.more" && e.itemId === "beta",
    );
    console.log(
      s2 === true && sub
        ? "POPUP_SUB_OK ctx.more/beta"
        : `POPUP_SUB_FAIL ${String(s2)}:${JSON.stringify(events)}`,
    );
  } catch (e) {
    console.log("POPUP_RUN_FAIL " + String(e).slice(0, 160));
  }

  await sleep(300);
  app.getWebview("main")?.terminate();
})();

await new Promise(() => {}); /* keep the event loop until terminate */
