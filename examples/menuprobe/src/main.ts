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
import { AppBuilder, detectPlatform } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

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
  const root = `$sys-${Date.now()}`;
  const isDarwin = detectPlatform() === "macos";
  try {
    runtime.menu.createMenu({ id: "probe", items: [] });
    // H14: menu_create_default now exists on BOTH platforms — the same
    // standard tree (App/Edit/View/Window, same item ids) on mac NSApp
    // and win32 (role items carry built-in behavior at click time).
    runtime.menu.createDefaultMenu?.(root);
    const snap1 = (await runtime.menu.items?.(root)) ?? [];
    const withSub = snap1.filter((x) => x.hasSubmenu).length;
    if (snap1.length < 4 || withSub < 4) {
      console.log(`MENU_V2_FAIL:${snap1.length}:${withSub}`);
    } else {
      if (isDarwin) {
        runtime.menu.setItemIcon?.(
          `${root}.edit`,
          `${root}.edit.copy`,
          "Copy",
        );
      }
      const preRemove =
        ((await runtime.menu.items?.(`${root}.edit`)) ?? []).length;
      runtime.menu.removeItemAt?.(`${root}.edit`, 0);
      const postRemove =
        ((await runtime.menu.items?.(`${root}.edit`)) ?? []).length;
      if (isDarwin) {
        runtime.menu.setAsWindowsMenuForNSApp?.(`${root}.window`);
        runtime.menu.setAsHelpMenuForNSApp?.(`${root}.window`);
        runtime.menu.setAsWindowMenu?.(root, "main");
      }
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

  // H14 win32 legs: per-window menu bar mount + SetMenuItemBitmaps icon +
  // a REAL role action (programmatic popup-select on the Window submenu's
  // first leaf = Minimize -> the window must actually be minimized).
  if (!isDarwin) {
    type Diag = {
      bars?: { menu: string; label: string }[];
      icons?: { menu: string; item: string }[];
    };
    // Leg 1: mount the default tree as main's window menu bar; bogus ids
    // must be rejected WITHOUT stealing the slot (diag shows exactly one
    // bar and it is ours).
    try {
      runtime.menu.setAsWindowMenu?.("$sys-dummy", "main");
      runtime.menu.setAsWindowMenu?.("$nonexistent", "main");
      runtime.menu.setAsWindowMenu?.(root, "main");
      await sleep(100);
      const d = (await sendReq("menu_diag")) as Diag | null;
      const bars = d?.bars ?? [];
      const ok =
        bars.length === 1 &&
        bars[0]?.menu === root &&
        bars[0]?.label === "main";
      console.log(
        ok ? "MENU_WINMENU_OK" : `MENU_WINMENU_FAIL:${JSON.stringify(bars)}`,
      );
    } catch (e) {
      console.log("MENU_WINMENU_FAIL:" + String(e).slice(0, 60));
    }
    // Leg 2: registry image -> bitmap on the default Edit/Copy item.
    try {
      const iconPath = `${tjs.cwd}/../../assets/app-icon.png`;
      const st = await tjs.stat(iconPath).catch(() => null);
      if (!st) {
        console.log("MENU_ICON_SKIP:no-icon");
      } else {
        const rid = await runtime.image.fromPath(iconPath);
        runtime.menu.setItemIcon?.(
          `${root}.edit`,
          `${root}.edit.copy`,
          String(rid),
        );
        await sleep(100);
        const d = (await sendReq("menu_diag")) as Diag | null;
        const icon = (d?.icons ?? []).find(
          (x) =>
            x.menu === `${root}.edit` && x.item === `${root}.edit.copy`,
        );
        console.log(
          icon
            ? "MENU_ICON_OK"
            : `MENU_ICON_FAIL:${JSON.stringify(d?.icons ?? [])}`,
        );
      }
    } catch (e) {
      console.log("MENU_ICON_FAIL:" + String(e).slice(0, 60));
    }
    // Leg 3: real Minimize role action via the H13 popup-select channel —
    // tracks the Window submenu popup and keys DOWN,ENTER onto its first
    // leaf (Minimize), then the native window state must reflect it.
    try {
      const sel = (await sendReq("menu_popup_select_test", {
        menu_id: `${root}.window`,
      })) as unknown;
      await sleep(400);
      const main = app.getWebview("main") as unknown as
        | { windowState(op: string): Promise<unknown> }
        | undefined;
      const ws = await main?.windowState("is_minimized");
      console.log(
        sel === true && ws === true
          ? "ROLE_MIN_OK"
          : `ROLE_MIN_FAIL:${String(sel)}:${String(ws)}`,
      );
    } catch (e) {
      console.log("ROLE_MIN_FAIL:" + String(e).slice(0, 60));
    }
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
    const { localhostPlugin } = await import("@zturnlibs/ztron-core");
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
