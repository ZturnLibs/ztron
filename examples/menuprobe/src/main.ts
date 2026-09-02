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
import { AppBuilder } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

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

  // G17/B11: real decode readback for a PATH-loaded image.
  try {
    const path = `${tjs.cwd}/../../assets/app-icon.png`;
    const st = await tjs.stat(path).catch(() => null);
    if (!st) {
      console.log("IMG_READBACK_SKIP:no-icon");
    } else {
      const rid = await runtime.image.fromPath(path);
      const dims = await runtime.image.dims?.(rid);
      const b64 = await runtime.image.rgba?.(rid);
      if (
        dims &&
        dims.width > 0 &&
        typeof b64 === "string" &&
        b64.length > 100
      ) {
        console.log(`IMG_READBACK_OK:${dims.width}x${dims.height}:${b64.length}`);
        runtime.image.destroy(rid);
      } else {
        console.log("IMG_READBACK_FAIL:" + JSON.stringify(dims) + ":" + (b64?.length ?? 0));
      }
    }
  } catch (e) {
    console.log("IMG_READBACK_FAIL:" + String(e).slice(0, 60));
  }

  // G16/B14: inner position query (contentLayoutRect -> screen coords).
  try {
    const main = app.getWebview("main") as
      | { windowState(op: string): Promise<unknown> }
      | undefined;
    const ip = (await main?.windowState("get_inner_position")) as
      | { x: number; y: number }
      | null
      | undefined;
    if (ip && typeof ip.x === "number" && typeof ip.y === "number") {
      console.log(`INNER_POS_OK:${Math.round(ip.x)},${Math.round(ip.y)}`);
    } else {
      console.log("INNER_POS_FAIL:" + JSON.stringify(ip));
    }
  } catch (e) {
    console.log("INNER_POS_FAIL:" + String(e).slice(0, 60));
  }

  // Localhost origin (G11 / E1): real tjs.serve, fetch-handler round trip.
  try {
    const { localhostPlugin } = await import("@ztron/core");
    const lp = localhostPlugin({ dir: tjs.cwd });
    const started = (await lp.commands.start({})) as { port: number };
    const resp = await fetch(`http://localhost:${started.port}/__miss__`);
    await lp.commands.stop({});
    console.log(
      resp.status === 404 ? `LOCALHOST_OK:${started.port}` : `LOCALHOST_FAIL:${resp.status}`,
    );
  } catch (e) {
    console.log("LOCALHOST_FAIL:" + String(e).slice(0, 60));
  }
  await sleep(200);
  app.getWebview("main")?.terminate();
})();

await new Promise(() => {}); /* keep the event loop until terminate */
