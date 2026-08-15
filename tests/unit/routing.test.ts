/**
 * Routing coverage — invokes every command that runs under Node (mock
 * adapters + in-memory tjs stub) and asserts it routes/behaves correctly.
 * Commands needing `tjs:*` modules (path/sql) or network (http/websocket/
 * network.getPublicIp) are covered by the surface test + the integration
 * spike; they're listed here as SKIPPED so coverage is explicit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../helpers/buildApp.ts";

test("webview create routes through the app", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:webview|create", {
    label: "second",
    title: "Second",
    width: 300,
    height: 200,
  });
  assert.ok(mock.handles.length >= 2);
  assert.equal(mock.handles[1]?.label, "second");
});

test("window commands route to the handle", async () => {
  const { mock } = buildApp();
  const w = mock.main;

  await mock.main.invoke("plugin:window|minimize", {});
  assert.deepEqual(w.windowStateLog[0]?.op, "minimize");
  await mock.main.invoke("plugin:window|unminimize", {});
  await mock.main.invoke("plugin:window|toggle_maximize", {});
  assert.equal(w.windowStateLog.at(-1)?.op, "toggle_maximize");

  const max = await mock.main.invoke("plugin:window|is_maximized", {});
  assert.equal(max, false);
  const min = await mock.main.invoke("plugin:window|is_minimized", {});
  assert.equal(min, false);

  await mock.main.invoke("plugin:window|set_fullscreen", { fullscreen: true });
  await mock.main.invoke("plugin:window|set_always_on_top", {
    alwaysOnTop: true,
  });
  await mock.main.invoke("plugin:window|center", {});
  await mock.main.invoke("plugin:window|set_focus", {});
  await mock.main.invoke("plugin:window|set_visible", { visible: true });
  await mock.main.invoke("plugin:window|set_resizable", { resizable: true });
  await mock.main.invoke("plugin:window|set_opacity", { opacity: 0.5 });
  await mock.main.invoke("plugin:window|set_transparent", {
    transparent: true,
  });
  await mock.main.invoke("plugin:window|set_decorations", {
    decorations: false,
  });

  const ops = w.windowStateLog.map((l) => l.op);
  for (const op of [
    "set_fullscreen",
    "set_always_on_top",
    "center",
    "set_focus",
    "set_visible",
    "set_resizable",
    "set_transparent",
    "set_decorations",
  ]) {
    assert.ok(ops.includes(op), `window op ${op} not routed`);
  }
  assert.deepEqual(w.opacityLog, [0.5]);

  await mock.main.invoke("plugin:window|set_position", { x: 10, y: 20 });
  assert.deepEqual(w.positionLog.at(-1), { x: 10, y: 20 });
  await mock.main.invoke("plugin:window|set_cursor", { cursor: "pointer" });
  assert.deepEqual(w.cursorLog, ["pointer"]);
  await mock.main.invoke("plugin:window|set_zoom", { zoom: 1.5 });
  assert.deepEqual(w.zoomLog, [1.5]);
  await mock.main.invoke("plugin:window|set_shadow", { shadow: true });
  await mock.main.invoke("plugin:window|set_enabled", { enabled: false });
  const ops2 = w.windowStateLog.map((l) => l.op);
  assert.ok(ops2.includes("set_shadow"));
  assert.ok(ops2.includes("set_enabled"));
  await mock.main.invoke("plugin:window|start_dragging", {});
  assert.equal(w.dragCount, 1);
  await mock.main.invoke("plugin:window|start_resize_dragging", {
    direction: "southeast",
  });
  assert.deepEqual(w.resizeDragLog, ["southeast"]);

  await mock.main.invoke("plugin:window|prevent_close", { prevent: true });
  assert.ok(w.windowStateLog.some((l) => l.op === "set_prevent_close"));
  await mock.main.invoke("plugin:window|destroy", {});
  assert.equal(w.destroyCount, 1);

  const frame = await mock.main.invoke("plugin:window|get_frame", {});
  assert.equal(frame?.width, 900);
  const pos = await mock.main.invoke("plugin:window|get_position", {});
  assert.equal(pos?.x, 10);
  const state = await mock.main.invoke("plugin:window|get_state", {});
  assert.equal(state?.resizable, true);
  const title = await mock.main.invoke("plugin:window|get_title", {});
  assert.equal(title, "t");
  const theme = await mock.main.invoke("plugin:window|get_theme", {});
  assert.ok(theme === "light" || theme === "dark");
  const sf = await mock.main.invoke("plugin:window|get_scale_factor", {});
  assert.ok(typeof sf === "number");

  await mock.main.invoke("plugin:window|set_bounds", {
    x: 1,
    y: 2,
    width: 300,
    height: 200,
  });
  assert.deepEqual(w.boundsLog.at(-1), { x: 1, y: 2, w: 300, h: 200 });
  const afterBounds = await mock.main.invoke("plugin:window|get_frame", {});
  assert.equal(afterBounds?.width, 300);
});

test("window v2 extras (size constraints, button flags, dock) route", async () => {
  const { mock } = buildApp();
  const w = mock.main;

  await mock.main.invoke("plugin:window|set_size_constraints", {
    min: { width: 300, height: 200 },
    max: { width: 800, height: 600 },
  });
  assert.deepEqual(w.minSizeLog, [{ w: 300, h: 200 }]);
  assert.deepEqual(w.maxSizeLog, [{ w: 800, h: 600 }]);
  await mock.main.invoke("plugin:window|set_min_size", { width: 10, height: 20 });
  await mock.main.invoke("plugin:window|set_max_size", { width: 30, height: 40 });
  assert.deepEqual(w.minSizeLog.at(-1), { w: 10, h: 20 });
  assert.deepEqual(w.maxSizeLog.at(-1), { w: 30, h: 40 });

  for (const [cmd, arg, op] of [
    ["set_minimizable", { minimizable: false }, "set_minimizable"],
    ["set_maximizable", { maximizable: true }, "set_maximizable"],
    ["set_closable", { closable: false }, "set_closable"],
    ["set_skip_taskbar", { skipTaskbar: true }, "set_skip_taskbar"],
    ["set_always_on_bottom", { alwaysOnBottom: true }, "set_always_on_bottom"],
    ["set_content_protected", { protected: true }, "set_content_protected"],
  ] as const) {
    await mock.main.invoke(`plugin:window|${cmd}`, arg);
    const hit = w.windowStateLog.find(
      (l) => l.op === op && l.value === Object.values(arg)[0],
    );
    assert.ok(hit, `${op} not routed`);
  }

  for (const cmd of [
    "is_minimizable",
    "is_maximizable",
    "is_closable",
    "is_decorated",
    "is_focused",
  ]) {
    const v = await mock.main.invoke(`plugin:window|${cmd}`, {});
    assert.equal(typeof v, "boolean");
    assert.ok(w.windowStateLog.some((l) => l.op === cmd));
  }

  /* request_user_attention: only Critical maps to the flag. */
  await mock.main.invoke("plugin:window|request_user_attention", {
    attentionType: "Informational",
  });
  await mock.main.invoke("plugin:window|request_user_attention", {
    attentionType: "Critical",
  });
  const attn = w.windowStateLog.filter(
    (l) => l.op === "request_user_attention",
  );
  assert.deepEqual(attn.map((l) => l.value), [false, true]);

  await mock.main.invoke("plugin:window|set_progress_bar", { progress: 0.5 });
  await mock.main.invoke("plugin:window|set_progress_bar", { progress: null });
  assert.deepEqual(w.progressBarLog, [0.5, null]);
  await mock.main.invoke("plugin:window|set_badge_count", { count: 3 });
  await mock.main.invoke("plugin:window|set_badge_count", { count: null });
  assert.deepEqual(w.badgeCountLog, [3, null]);
  /* badge label: `label` stays the window router, `badgeLabel` is the text.
     Since the label-routing fix, an unknown window label errors out
     (Tauri semantics); use the issuing window here. */
  await mock.main.invoke("plugin:window|set_badge_label", {
    badgeLabel: "hello",
  });
  assert.deepEqual(w.badgeLabelLog, ["hello"]);
  await assert.rejects(
    () =>
      mock.main.invoke("plugin:window|set_badge_label", {
        label: "other",
        badgeLabel: "x",
      }),
    (err: unknown) =>
      String((err as { error?: string }).error ?? "").includes(
        "window not found: other",
      ),
  );
  await mock.main.invoke("plugin:window|set_background_color", {
    color: "#11223344",
  });
  assert.deepEqual(w.backgroundColorLog, ["#11223344"]);
  await mock.main.invoke("plugin:window|set_titlebar_style", {
    style: "overlay",
  });
  assert.deepEqual(w.titleBarStyleLog, ["overlay"]);
});

test("window v2 batch 3 (maximize/cursor/theme/workspaces) routes", async () => {
  const { mock } = buildApp();
  const w = mock.main;

  for (const [cmd, arg, op, value] of [
    ["maximize", {}, "maximize", undefined],
    ["unmaximize", {}, "unmaximize", undefined],
    ["set_focusable", { focusable: false }, "set_focusable", false],
    ["set_cursor_visible", { visible: false }, "set_cursor_visible", false],
    [
      "set_visible_on_all_workspaces",
      { visible: true },
      "set_visible_on_all_workspaces",
      true,
    ],
    ["set_simple_fullscreen", { fullscreen: true }, "set_simple_fullscreen", true],
  ] as const) {
    await mock.main.invoke(`plugin:window|${cmd}`, arg);
    const hit = w.windowStateLog.find(
      (l) => l.op === op && (value === undefined || l.value === value),
    );
    assert.ok(hit, `${op} not routed`);
  }

  const enabled = await mock.main.invoke("plugin:window|is_enabled", {});
  assert.equal(typeof enabled, "boolean");

  w.innerSizeValue = { width: 800, height: 600 };
  const inner = await mock.main.invoke("plugin:window|inner_size", {});
  assert.deepEqual(inner, { width: 800, height: 600 });

  w.cursorPositionValue = { x: 12, y: 34 };
  const cur = await mock.main.invoke("plugin:window|cursor_position", {});
  assert.deepEqual(cur, { x: 12, y: 34 });
  await mock.main.invoke("plugin:window|set_cursor_position", { x: 5, y: 6 });
  assert.deepEqual(w.cursorPositionLog, [{ x: 5, y: 6 }]);

  await mock.main.invoke("plugin:window|set_theme", { theme: "dark" });
  await mock.main.invoke("plugin:window|set_theme", { theme: null });
  assert.deepEqual(w.themeLog, ["dark", null]);
});

test("window finishing batch (monitors/getAllWindows/traffic light) routes", async () => {
  const { mock } = buildApp();
  const w = mock.main;

  w.monitorsValue = [
    {
      name: "Built-in Retina",
      position: { x: 0, y: 0 },
      size: { width: 3456, height: 2234 },
      workArea: { x: 0, y: 0, width: 3456, height: 2100 },
      scaleFactor: 2,
    },
  ];
  const all = (await mock.main.invoke("plugin:window|available_monitors", {})) as Array<{
    scaleFactor: number;
  }>;
  assert.equal(all?.[0]?.scaleFactor, 2);
  await mock.main.invoke("plugin:window|primary_monitor", {});
  await mock.main.invoke("plugin:window|current_monitor", {});
  await mock.main.invoke("plugin:window|monitor_from_point", { x: 100, y: 100 });
  assert.deepEqual(w.monitorQueries.map((q) => q.kind), [
    "all",
    "primary",
    "current",
    "point",
  ]);
  assert.deepEqual(w.monitorQueries[3], { kind: "point", x: 100, y: 100 });

  const labels = (await mock.main.invoke("plugin:window|get_all_windows", {})) as string[];
  assert.deepEqual(labels, ["main"]);

  await mock.main.invoke("plugin:window|set_traffic_light_position", {
    x: 12,
    y: 12,
  });
  assert.deepEqual(w.trafficLightLog, [{ x: 12, y: 12 }]);
});

test("scale/theme window events carry payloads to tauri:// names", async () => {
  const { app, mock } = buildApp();
  void app;
  await mock.main.invoke("plugin:event|listen", {
    event: "tauri://scale-change",
    target: { kind: "Any" },
    handler: 1,
  });
  await mock.main.invoke("plugin:event|listen", {
    event: "tauri://theme-changed",
    target: { kind: "Any" },
    handler: 2,
  });
  mock.main.emitWindowEvent("scale-change", {
    scaleFactor: 2,
    size: { width: 800, height: 600 },
  });
  mock.main.emitWindowEvent("theme-change", "dark");
  const evals = mock.main.evalLog.join("\n");
  assert.ok(evals.includes("tauri://scale-change"), evals);
  assert.ok(evals.includes('"scaleFactor":2'), evals);
  assert.ok(evals.includes("tauri://theme-changed"), evals);
  assert.ok(evals.includes('"payload":"dark"'), evals);
});

test("tray commands route to the adapter", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:tray|create", { title: "T", tooltip: "tip" });
  await mock.main.invoke("plugin:tray|set_title", { title: "T2" });
  await mock.main.invoke("plugin:tray|set_tooltip", { tooltip: "tip2" });
  await mock.main.invoke("plugin:tray|set_icon", { icon: "/x.png" });
  await mock.main.invoke("plugin:tray|destroy", {});
  assert.deepEqual(
    mock.trayLog.map((l) => l.op),
    ["create", "set_title", "set_tooltip", "set_icon", "destroy"],
  );
});

test("menu commands route to the adapter", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:menu|create", {
    menu: { id: "m", items: [{ id: "i1", text: "One" }] },
  });
  await mock.main.invoke("plugin:menu|set_as_app_menu", { menuId: "m" });
  await mock.main.invoke("plugin:menu|set_item_enabled", {
    menuId: "m",
    itemId: "i1",
    enabled: false,
  });
  await mock.main.invoke("plugin:menu|set_item_title", {
    menuId: "m",
    itemId: "i1",
    title: "Uno",
  });
  await mock.main.invoke("plugin:menu|set_item_checked", {
    menuId: "m",
    itemId: "i1",
    checked: true,
  });
  await mock.main.invoke("plugin:menu|set_item_accel", {
    menuId: "m",
    itemId: "i1",
    accelerator: "CmdOrCtrl+K",
  });
  await mock.main.invoke("plugin:menu|popup", { menuId: "m" });
  await mock.main.invoke("plugin:tray|set_menu", { menuId: "m" });
  await mock.main.invoke("plugin:menu|add_item", {
    menuId: "m",
    item: { id: "i2", text: "Two" },
  });
  await mock.main.invoke("plugin:menu|add_item", {
    menuId: "m",
    item: { id: "i0", text: "Zero" },
    at: 0,
  });
  await mock.main.invoke("plugin:menu|add_item", {
    menuId: "m",
    item: { id: "pd", text: "Quit", predefined: "quit" },
  });
  await mock.main.invoke("plugin:menu|remove_item", {
    menuId: "m",
    itemId: "i1",
  });
  mock.itemInfoValue = { enabled: true, checked: false, title: "Uno" };
  const info = await mock.main.invoke("plugin:menu|item_info", {
    menuId: "m",
    itemId: "i1",
  });
  assert.deepEqual(info, { enabled: true, checked: false, title: "Uno" });
  await mock.main.invoke("plugin:menu|destroy", { menuId: "m" });
  /* tray set_menu routes to the TRAY adapter with the menu id. */
  assert.deepEqual(mock.trayLog.at(-1), {
    op: "set_menu",
    payload: { menuId: "m" },
  });
  const pd = mock.menuLog.find(
    (l) => l.op === "add_item" && (l.payload as { item?: { id?: string } }).item?.id === "pd",
  );
  assert.equal((pd?.payload as { item?: { predefined?: string } }).item?.predefined, "quit");
  assert.deepEqual(
    mock.menuLog.map((l) => l.op),
    [
      "create",
      "set_as_app_menu",
      "set_item_enabled",
      "set_item_title",
      "set_item_checked",
      "set_item_accel",
      "popup",
      "add_item",
      "insert_item",
      "add_item",
      "remove_item",
      "item_info",
      "destroy",
    ],
  );
});

test("dialog commands route to the adapter", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:dialog|open", { title: "Open" });
  await mock.main.invoke("plugin:dialog|save", { title: "Save" });
  await mock.main.invoke("plugin:dialog|message", {
    title: "Hi",
    message: "msg",
  });
  assert.deepEqual(
    mock.dialogLog.map((l) => l.kind),
    ["open", "save", "message"],
  );
});

test("clipboard + notification + shortcut + deep-link + process route", async () => {
  const { mock } = buildApp();
  const read = await mock.main.invoke("plugin:clipboard|read_text", {});
  assert.equal(read, "mock-clip");
  await mock.main.invoke("plugin:clipboard|write_text", { text: "hi" });
  assert.deepEqual(mock.clipboardLog.at(-1), { kind: "write", text: "hi" });

  await mock.main.invoke("plugin:notification|send", { title: "N", body: "b" });
  assert.deepEqual(mock.notificationLog.at(-1), { title: "N", body: "b" });

  const reg = await mock.main.invoke("plugin:global-shortcut|register", {
    id: "k",
    accelerator: "Cmd+Shift+K",
  });
  assert.equal(reg, true);
  const unreg = await mock.main.invoke("plugin:global-shortcut|unregister", {
    id: "k",
  });
  assert.equal(unreg, true);

  const last = await mock.main.invoke("plugin:deep-link|get_last_url", {});
  assert.equal(last, null);

  const imgId = await mock.main.invoke("plugin:image|from_bytes", {
    base64: "aGk=",
  });
  assert.equal(imgId, 1);
  const imgPath = await mock.main.invoke("plugin:image|from_path", { path: "/x.png" });
  assert.equal(imgPath, 2);
  await mock.main.invoke("plugin:image|destroy", { id: 1 });
  assert.deepEqual(mock.imageLog.map((l) => l.kind), ["bytes", "path", "destroy"]);

  await mock.main.invoke("plugin:process|exit", { code: 3 });
  assert.deepEqual(mock.exitLog, [3]);
  await mock.main.invoke("plugin:process|relaunch", {});
  assert.equal(mock.relaunchCount, 1);
});

test("app metadata + config commands", async () => {
  const { mock } = buildApp();
  assert.equal(await mock.main.invoke("plugin:app|name", {}), "com.ztron.test");
  assert.equal(await mock.main.invoke("plugin:app|version", {}), "0.1.0");
  assert.equal(await mock.main.invoke("plugin:app|tauri_version", {}), "2.0.0");
  const cfg = await mock.main.invoke("plugin:app|get_config", {});
  assert.equal(cfg?.identifier, "com.ztron.test");
  assert.equal("invokeKey" in cfg, false);
});

test("fs commands operate on the in-memory tjs", async () => {
  const { tjs, mock } = buildApp();
  await mock.main.invoke("plugin:fs|write_text", {
    path: "$TMP/a.txt",
    contents: "hello",
  });
  const data = await mock.main.invoke("plugin:fs|read_text", {
    path: "$TMP/a.txt",
  });
  assert.equal(data, "hello");

  await mock.main.invoke("plugin:fs|copy", {
    path: "$TMP/a.txt",
    dest: "$TMP/b.txt",
  });
  assert.equal(
    await mock.main.invoke("plugin:fs|read_text", { path: "$TMP/b.txt" }),
    "hello",
  );

  await mock.main.invoke("plugin:fs|rename", {
    path: "$TMP/b.txt",
    newPath: "$TMP/c.txt",
  });
  assert.equal(
    await mock.main.invoke("plugin:fs|exists", { path: "$TMP/c.txt" }),
    true,
  );

  const meta = await mock.main.invoke("plugin:fs|stat", { path: "$TMP/c.txt" });
  assert.equal(meta?.size, 5);

  await mock.main.invoke("plugin:fs|make_dir", { path: "$TMP/sub" });
  await mock.main.invoke("plugin:fs|write_text", {
    path: "$TMP/sub/x.txt",
    contents: "x",
  });
  const entries = await mock.main.invoke("plugin:fs|read_dir", {
    path: "$TMP",
  });
  assert.ok(entries.some((e: { name: string }) => e.name === "sub"));

  await mock.main.invoke("plugin:fs|remove", { path: "$TMP/c.txt" });
  assert.equal(
    await mock.main.invoke("plugin:fs|exists", { path: "$TMP/c.txt" }),
    false,
  );
});

test("os commands return platform info from the stub", async () => {
  const { mock } = buildApp();
  assert.equal(await mock.main.invoke("plugin:os|homedir", {}), "/home/tester");
  assert.equal(
    await mock.main.invoke("plugin:os|tmpdir", {}),
    "/tmp/ztron-test",
  );
  assert.equal(await mock.main.invoke("plugin:os|locale", {}), "en-US");
  assert.ok(
    typeof (await mock.main.invoke("plugin:os|platform", {})) === "string",
  );
  assert.equal(await mock.main.invoke("plugin:os|type", {}), "Darwin");
  assert.equal(await mock.main.invoke("plugin:os|family", {}), "macos");
  assert.equal(await mock.main.invoke("plugin:os|eol", {}), "\n");
});

test("path special-dir commands return the stub paths", async () => {
  const { mock } = buildApp();
  assert.equal(
    await mock.main.invoke("plugin:path|home_dir", {}),
    "/home/tester",
  );
  assert.equal(
    await mock.main.invoke("plugin:path|temp_dir", {}),
    "/tmp/ztron-test",
  );
  assert.equal(await mock.main.invoke("plugin:path|cwd", {}), "/work");
  // platform directory getters (macOS conventions under the stub navigator)
  const appData = await mock.main.invoke("plugin:path|app_data_dir", {});
  assert.ok(typeof appData === "string" && appData.includes("com.ztron.test"));
  const desktop = await mock.main.invoke("plugin:path|desktop_dir", {});
  assert.ok(desktop.includes("/Desktop"));
  const document = await mock.main.invoke("plugin:path|document_dir", {});
  assert.ok(document.includes("/Documents"));
  const download = await mock.main.invoke("plugin:path|download_dir", {});
  assert.ok(download.includes("/Downloads"));
});

test("store commands persist through the tjs stub", async () => {
  const { mock } = buildApp();
  const sp = { path: "app.json" };
  await mock.main.invoke("plugin:store|set", { ...sp, key: "k", value: "v" });
  assert.equal(
    await mock.main.invoke("plugin:store|get", { ...sp, key: "k" }),
    "v",
  );
  assert.equal(
    await mock.main.invoke("plugin:store|has", { ...sp, key: "k" }),
    true,
  );
  await mock.main.invoke("plugin:store|delete", { ...sp, key: "k" });
  assert.equal(
    await mock.main.invoke("plugin:store|has", { ...sp, key: "k" }),
    false,
  );
});

test("shell execute runs through the tjs spawn stub", async () => {
  const { mock } = buildApp();
  const r = await mock.main.invoke("plugin:shell|execute", {
    program: "echo",
    args: ["hi"],
  });
  assert.equal(r?.stdout.trim(), "hi");
  assert.equal(r?.code, 0);
});

test("log commands resolve", async () => {
  const { mock } = buildApp();
  for (const lvl of ["trace", "debug", "info", "warn", "error"]) {
    await mock.main.invoke(`plugin:log|${lvl}`, { message: "m" });
  }
  await mock.main.invoke("plugin:log|log", { level: "info", message: "m" });
});

test("window-state save/restore round trips geometry", async () => {
  const { mock } = buildApp();
  await mock.main.invoke("plugin:window|set_position", { x: 40, y: 50 });
  const saved = await mock.main.invoke("plugin:window-state|save", {});
  assert.equal(saved?.x, 40);
  await mock.main.invoke("plugin:window|set_position", { x: 1, y: 1 });
  const restored = await mock.main.invoke("plugin:window-state|restore", {});
  assert.equal(restored?.x, 40);
});

test("local-ip + network return the stub IPs", async () => {
  const { mock } = buildApp();
  assert.equal(
    await mock.main.invoke("plugin:local-ip|get", {}),
    "192.168.0.134",
  );
  assert.equal(
    await mock.main.invoke("plugin:network|get_local_ipv4", {}),
    "192.168.0.134",
  );
  const v6 = await mock.main.invoke("plugin:network|get_local_ipv6", {});
  assert.ok(v6 === null || v6.includes(":"));
});

test("persisted-scope returns the merged allowlist", async () => {
  const { mock } = buildApp();
  const merged = await mock.main.invoke("plugin:persisted-scope|get", {});
  // serializeAllow returns the $TMP-expanded base pattern.
  assert.ok(merged.allow.some((a: string) => a.includes("/tmp/ztron-test/**")));
  const saved = await mock.main.invoke("plugin:persisted-scope|save", {});
  assert.equal(saved?.saved, true);
});

test("cli plugin parses argv into matches", async () => {
  const { mock, tjs } = buildApp();
  tjs.args = [
    "/usr/bin/ztron-host",
    "serve",
    "--port=8080",
    "--verbose",
    "-n",
    "4",
    "--",
    "raw arg",
  ];
  const argv = (await mock.main.invoke("plugin:cli|get_argv", {})) as string[];
  assert.equal(argv.length, 8);
  const m = (await mock.main.invoke("plugin:cli|get_matches", {})) as {
    args: Record<string, unknown>;
    subcommand: { name: string; matches: { args: Record<string, unknown> } };
  };
  assert.equal(m.subcommand?.name, "serve");
  assert.equal(m.subcommand?.matches.args.port, 8080);
  assert.equal(m.subcommand?.matches.args.verbose, true);
  assert.equal(m.subcommand?.matches.args.n, 4);
  assert.deepEqual(m.subcommand?.matches.args._, ["raw arg"]);
});

test("opener plugin opens URLs/paths and denies foreign schemes", async () => {
  const { mock } = buildApp();
  const r = (await mock.main.invoke("plugin:opener|open_url", {
    url: "https://example.com",
  })) as { opened: boolean };
  assert.equal(r.opened, true);
  const p = (await mock.main.invoke("plugin:opener|open_path", {
    path: "/tmp/ztron-test",
  })) as { opened: boolean };
  assert.equal(p.opened, true);
  const rev = (await mock.main.invoke("plugin:opener|reveal_item_in_dir", {
    path: "/tmp/ztron-test/file.txt",
  })) as { revealed: boolean };
  assert.equal(rev.revealed, true);
  await assert.rejects(
    mock.main.invoke("plugin:opener|open_url", { url: "file:///etc/passwd" }),
    (e: unknown) =>
      String((e as { error?: string }).error ?? e).includes(
        "scheme not allowed",
      ),
  );
});
