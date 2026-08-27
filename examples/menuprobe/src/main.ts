/**
 * menuprobe — G4 (A2) deterministic menu-surface probe, backend-only.
 *
 * Drives the HostRuntime menu controller against the REAL host: default-menu
 * construction, structured items() snapshot over the query channel,
 * native-icon set, removeAt tombstoning and the NSApp Window/Help role
 * mounts plus a per-window menu bar mount. Kept separate from multiwin so
 * the destroy-flood (known upstream UAF terrain on darwin 25.2 — DESIGN §98)
 * cannot mask this check.
 */
import { AppBuilder } from "@zturnlibs/core";
import { HostRuntime } from "@zturnlibs/runtime-ffi";

declare const tjs: {
  env: Record<string, string | undefined>;
};

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const app = new AppBuilder(runtime, "com.ztron.menuprobe")
  .configure({ invokeKey: tjs.env.ZTRON_INVOKE_KEY ?? "k" })
  .window({
    label: "main",
    title: "menu probe",
    width: 420,
    height: 180,
    html: "<p>menu v2 probe</p>",
  })
  .build();
void app.run().catch((e) => console.log("[menuprobe] ERROR", String(e)));
await sleep(400);

void (async () => {
  try {
    const root = `$sys-${Date.now()}`;
    runtime.menu.createMenu({ id: "probe", items: [] });
    runtime.menu.createDefaultMenu?.(root);
    const snap1 = (await runtime.menu.items?.(root)) ?? [];
    const withSub = snap1.filter((x) => x.hasSubmenu).length;
    if (snap1.length < 4 || withSub < 4) {
      console.log(`MENU_V2_FAIL:${snap1.length}:${withSub}`);
    } else {
      runtime.menu.setItemIcon?.(`${root}.edit`, `${root}.edit.copy`, "Copy");
      const preRemove =
        ((await runtime.menu.items?.(`${root}.edit`)) ?? []).length;
      runtime.menu.removeItemAt?.(`${root}.edit`, 0);
      const postRemove =
        ((await runtime.menu.items?.(`${root}.edit`)) ?? []).length;
      runtime.menu.setAsWindowsMenuForNSApp?.(`${root}.window`);
      runtime.menu.setAsHelpMenuForNSApp?.(`${root}.window`);
      runtime.menu.setAsWindowMenu?.(root, "main");
      if (postRemove === preRemove - 1) {
        console.log(
          `MENU_V2_OK:${snap1.length}:${withSub}:${preRemove}:${postRemove}`,
        );
      } else {
        console.log(`MENU_V2_FAIL:remove:${preRemove}:${postRemove}`);
      }
    }
  } catch (e) {
    console.log("MENU_V2_FAIL:" + String(e).slice(0, 80));
  }

  // Tray multi-instance surface (G5 / B9): id creation -> existence query ->
  // left-click toggle -> removal. Legacy default instance untouched here.
  try {
    runtime.tray.apply("create", { title: "", id: "g5-alt" });
    let exists = await runtime.tray.getById?.("g5-alt");
    if (exists !== true) throw new Error("getById(alt) != true after create");
    runtime.tray.apply("set_show_menu_on_left_click", {
      id: "g5-alt",
      visible: false,
    });
    runtime.tray.apply("set_show_menu_on_left_click", {
      id: "g5-alt",
      visible: true,
    });
    runtime.tray.apply("remove_by_id", { id: "g5-alt" });
    exists = await runtime.tray.getById?.("g5-alt");
    console.log(exists === false ? "TRAY_V2_OK" : `TRAY_V2_FAIL:${exists}`);
  } catch (e) {
    console.log("TRAY_V2_FAIL:" + String(e).slice(0, 60));
  }
  await sleep(200);
  app.getWebview("main")?.terminate();
})();

await new Promise(() => {}); /* keep the event loop until terminate */
