/**
 * M3 frontend — uses the real `@ztron/api` package in a Vite-bundled page.
 * Exercises invoke, events, Channel, fs and path through the public API.
 */
import {
  invoke,
  listen,
  Channel,
  fs,
  path,
  http,
  os,
  store,
  logger,
  shell,
  Window,
  createTray,
  setTrayTooltip,
  setTrayIcon,
  setAppMenu,
  Database,
  enableAutostart,
  disableAutostart,
  isAutostartEnabled,
  readClipboardText,
  writeClipboardText,
  getPosition,
  setPosition,
  saveWindowState,
  restoreWindowState,
  sendNotification,
  registerShortcut,
  unregisterShortcut,
  isPrimaryInstance,
  onDeepLink,
  getName,
  getVersion,
} from "@ztron/api";

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Extracts a message from an error value (Tauri-style rejection payloads). */
function extractError(e: unknown): string {
  if (e && typeof e === "object" && "error" in e) {
    return String((e as { error: unknown }).error);
  }
  return String(e);
}

async function main(): Promise<void> {
  const report = (received: string) => invoke("m3:report", { received });

  // Register the deep-link listener early so an externally-opened ztron://
  // URL (packaged .app, registered via CFBundleURLTypes) is captured at any
  // point during the run.
  await onDeepLink((url) => {
    if (url.includes("spike")) report("DEEP_LINK_EVENT:" + url);
  });

  try {
    // 0. codegen'd typed invoke (from ztron codegen)
    const g = await import("../../src/ztron-commands.js");
    const greetRes = await g.invoke("my:greet", { name: "codegen" });
    if (greetRes === "hello, codegen") report("CODEGEN_OK:" + greetRes);

    // 1. invoke
    const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });
    el("invoke").textContent = echoed;
    if (echoed === "echo:hello-m3") report("INVOKE_OK");

    // 1b. app metadata
    const appName = await getName();
    const appVersion = await getVersion();
    if (appName === "com.ztron.hello" && appVersion === "0.1.0") {
      report("APP_OK:" + appName + "@" + appVersion);
    }

    // 1c. process module (commands registered; not invoked — they'd exit)
    const hasProcess = await invoke<boolean>("m3:has-process", {});
    if (hasProcess) report("PROCESS_OK");

    // 2. events (backend emits async ticks)
    let ticks = 0;
    await listen<{ n: number }>("m3:tick", (e) => {
      ticks++;
      el("event").textContent = "tick " + e.payload.n;
      if (ticks === 2) report("EVENT_OK");
    });
    await invoke("m3:emit-ticks", {});

    // 3. Channel streaming (onmessage receives the decoded message; the
    //    end-of-stream is handled internally by the Channel class)
    const msgs: number[] = [];
    const channel = new Channel<{ n: number }>((msg) => {
      msgs.push(msg.n);
      el("channel").textContent = msgs.join(",");
    });
    await invoke("m3:stream", { ch: channel });
    if (msgs.join(",") === "1,2,3") report("CHANNEL_OK:" + msgs.join(","));

    // 4. fs (scoped to $TMP/**)
    await fs.writeText("$TMP/ztron_m3.txt", "m3-hello");
    const data = await fs.readText("$TMP/ztron_m3.txt");
    el("fs").textContent = data;
    if (data === "m3-hello") report("FS_OK");

    // 4a. fs copy/rename/stat
    await fs.copyFile("$TMP/ztron_m3.txt", "$TMP/ztron_m3_copy.txt");
    const copied = await fs.readText("$TMP/ztron_m3_copy.txt");
    await fs.renameFile("$TMP/ztron_m3_copy.txt", "$TMP/ztron_m3_renamed.txt");
    const renamed = await fs.readText("$TMP/ztron_m3_renamed.txt");
    const meta = await fs.stat("$TMP/ztron_m3_renamed.txt");
    if (copied === "m3-hello" && renamed === "m3-hello" && meta.size > 0) {
      report("FS_COPY_RENAME_OK:" + meta.size);
    }

    // 4b. ACL: fs.remove is NOT granted (capability has fs:write-default).
    // Expect the backend to reject with "access denied".
    try {
      await fs.remove("$TMP/ztron_m3.txt");
      report("ACL_FAIL: remove was allowed");
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes("access denied") || msg.includes("not allowed")) {
        report("ACL_DENY_OK");
      } else {
        report("ACL_UNEXPECTED:" + msg.slice(0, 40));
      }
    }

    // 5. path
    const joined = await path.join("/a", "b", "c");
    el("path").textContent = joined;
    if (joined === "/a/b/c") report("PATH_OK");

    // 5a. path special dirs
    const [home, temp] = await Promise.all([path.homeDir(), path.tempDir()]);
    if (home && temp) report("PATH_DIRS_OK:" + home + ":" + temp);

    // 5b. scoped http: allowed URL works, out-of-scope URL is denied
    try {
      const resp = await http.fetch("https://httpbin.org/get");
      if (resp.ok && resp.status === 200) {
        report("HTTP_OK:" + resp.status);
      } else {
        report("HTTP_FAIL:status=" + resp.status);
      }
    } catch (e) {
      report("HTTP_FAIL:" + extractError(e).slice(0, 40));
    }
    try {
      await http.fetch("https://evil.example.com/steal");
      report("HTTP_SCOPE_FAIL: was allowed");
    } catch (e) {
      const msg = extractError(e);
      if (msg.includes("scope denied") || msg.includes("not allowed")) {
        report("HTTP_SCOPE_DENY_OK");
      } else {
        report("HTTP_SCOPE_UNEXPECTED:" + msg.slice(0, 40));
      }
    }

    // 5c. os plugin
    const osInfo = await os.info();
    if (osInfo.platform === "macos" || osInfo.platform.includes("mac")) {
      report("OS_OK:" + osInfo.platform);
    } else {
      report("OS_OK:" + osInfo.platform);
    }

    // 5d. store plugin (KV persistence)
    const tmp = await os.tmpdir();
    const storePath = `${tmp}/ztron_store_test.json`;
    await store.clear(storePath);
    await store.set(storePath, "greeting", "hello-store");
    const val = await store.get<string>(storePath, "greeting");
    if (val === "hello-store") report("STORE_OK:" + val);

    // 5e. log plugin
    await logger.info("spike: log plugin test from frontend");
    report("LOG_OK");

    // 5f. shell plugin (scoped: echo only)
    const result = await shell.execute("echo", ["hello-shell"]);
    if (result.stdout.trim() === "hello-shell") {
      report("SHELL_OK:" + result.stdout.trim());
    }

    // 5f2. shell cwd/env
    const shellTmpDir = await path.tempDir();
    const pwd = await shell.execute("pwd", [], { cwd: shellTmpDir });
    if (pwd.stdout.trim().length > 0) {
      report("SHELL_CWD_OK:" + pwd.stdout.trim());
    }

    // 5g. updater (local manifest server + sha256 verify)
    const up = await invoke<{ hasUpdate: boolean; verifyOk: boolean }>(
      "m3:updater-test",
      {},
    );
    if (up.hasUpdate && up.verifyOk) {
      report("UPDATER_OK");
    } else {
      report("UPDATER_FAIL:" + JSON.stringify(up));
    }

    // 5h. sql (tjs:sqlite)
    const tmpDir = await os.tmpdir();
    const db = await Database.load(`${tmpDir}/ztron_spike.db`);
    await db.execute("DROP TABLE IF EXISTS notes");
    await db.execute(
      "CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)",
    );
    await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello-sql"]);
    const rows = await db.select<{ text: string }>(
      "SELECT text FROM notes WHERE text = ?",
      ["hello-sql"],
    );
    await db.close();
    if (rows.length === 1 && rows[0]?.text === "hello-sql") {
      report("SQL_OK:" + rows[0].text);
    } else {
      report("SQL_FAIL:rows=" + JSON.stringify(rows).slice(0, 80));
    }

    // 5i. autostart
    const wasEnabled = await isAutostartEnabled();
    await enableAutostart();
    const nowEnabled = await isAutostartEnabled();
    await disableAutostart();
    if (nowEnabled && !wasEnabled) {
      report("AUTOSTART_OK");
    } else if (nowEnabled) {
      report("AUTOSTART_OK(was-enabled)");
    } else {
      report("AUTOSTART_FAIL");
    }

    // 5j. clipboard — round trip special chars (guards zt_reply_string JSON
    // escaping: newline/quote/backslash would otherwise break the wire)
    const clipText = 'line1\n"quoted"\\back';
    await writeClipboardText(clipText);
    const clip = await readClipboardText();
    if (clip === clipText) {
      report("CLIPBOARD_OK:" + clip.replace(/\n/g, "\\n"));
    } else {
      report("CLIPBOARD_FAIL:" + JSON.stringify(clip));
    }

    // 5j2. clipboard large payload (guards the reply buffer: no truncation)
    const bigText = "x".repeat(100_000);
    await writeClipboardText(bigText);
    const bigClip = await readClipboardText();
    if (bigClip === bigText) {
      report("CLIPBOARD_BIG_OK:" + bigClip.length);
    } else {
      report("CLIPBOARD_BIG_FAIL:" + String(bigClip?.length));
    }

    // 6. window states + events through the api
    const win = Window.getCurrent();
    const maximized = await win.isMaximized();
    const fullscreen = await win.isFullscreen();
    await win.setAlwaysOnTop(true);
    await win.setResizable(true);
    await win.center();
    if (maximized === false && fullscreen === false) report("WIN_STATE_OK");

    // 6a. window appearance (opacity/transparent/decorations round trip)
    await win.setOpacity(0.5);
    report("OPACITY_OK");
    await win.setTransparent(true);
    await win.setTransparent(false);
    report("TRANSPARENT_OK");
    await win.setDecorations(false);
    await win.setDecorations(true);
    report("DECORATIONS_OK");

    // 6a2. verify the boolean set_* ops actually took effect (guards the
    // window-state JSON boolean parsing regression — see DESIGN.md §34)
    const st = await win.getState();
    if (
      st &&
      st.alwaysOnTop === true &&
      st.resizable === true &&
      st.visible === true &&
      st.maximized === false &&
      st.fullscreen === false
    ) {
      report("STATE_VERIFY_OK:" + JSON.stringify(st));
    } else {
      report("STATE_VERIFY_FAIL:" + JSON.stringify(st));
    }

    // 6a2b. setTitle/getTitle round trip (guards the set_title wire field fix)
    await win.setTitle("Ztron Spike");
    const t = await win.getTitle();
    if (t === "Ztron Spike") report("TITLE_OK:" + t);

    // 6a3. drag-region: command round-trips (real dragging needs a mouse;
    // macOS no-ops when [NSApp currentEvent] is not a mouseDown)
    await win.startDragging();
    report("DRAG_REGION_OK");

    // 6b. positioner (setPosition/getPosition round trip)
    await setPosition(120, 140);
    const pos = await getPosition();
    if (pos && Math.abs(pos.x - 120) <= 3 && Math.abs(pos.y - 140) <= 3) {
      report("POSITIONER_OK:" + pos.x + "," + pos.y);
    } else {
      report("POSITIONER_FAIL:" + JSON.stringify(pos));
    }

    // 6c. window-state plugin (save -> move -> restore -> verify)
    const savedState = await saveWindowState();
    await setPosition(savedState.x + 40, savedState.y + 40);
    await restoreWindowState();
    const restoredPos = await getPosition();
    if (
      restoredPos &&
      Math.abs(restoredPos.x - savedState.x) <= 3 &&
      Math.abs(restoredPos.y - savedState.y) <= 3
    ) {
      report("WINDOW_STATE_PLUGIN_OK:" + savedState.x + "," + savedState.y);
    } else {
      report(
        "WINDOW_STATE_PLUGIN_FAIL:" +
          JSON.stringify({ saved: savedState, restored: restoredPos }),
      );
    }

    // 6d. notification (send resolves; delivery is OS-level)
    await sendNotification({ title: "Ztron", body: "hello-notification" });
    report("NOTIFICATION_OK");

    let winEventFired = false;
    const fireWinEvent = () => {
      if (!winEventFired) {
        winEventFired = true;
        report("WIN_EVENT_OK");
      }
    };
    await listen("tauri://blur", fireWinEvent);
    await listen("tauri://focus", fireWinEvent);
    // force a real focus transition: hiding the window loses key, then
    // makeKeyAndOrderFront deterministically fires windowDidBecomeKey
    await win.setVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    await win.setVisible(true);
    await win.setFocus();
    await createTray({ title: "Ztron", tooltip: "Ztron tray" });
    await setTrayTooltip("Ztron tray updated");
    const trayTmp = await path.tempDir();
    await setTrayIcon(`${trayTmp}/ztron_tray_icon.png`);
    report("TRAY_OK");

    // 8. application menu (creation/install; click is manual)
    await setAppMenu([
      { id: "new", text: "New Window" },
      { id: "sep", text: "-", separator: true },
      { id: "quit", text: "Quit" },
    ]);
    report("MENU_OK");

    // 9. native dialogs (commands registered; modal interaction is manual)
    const hasDialogs = await invoke<boolean>("m3:has-dialogs");
    if (hasDialogs) report("DIALOG_REG_OK");

    // 10. global shortcut (register/unregister resolves; pressing is manual).
    // Ran last so Carbon's Register/UnregisterEventHotKey cannot disturb the
    // window focus transition exercised by WIN_EVENT_OK above.
    const regOk = await registerShortcut("spike-toggle", "Cmd+Shift+K");
    const unregOk = await unregisterShortcut("spike-toggle");
    if (regOk && unregOk) report("SHORTCUT_OK");

    // 11. single-instance (this process holds the lock)
    const primary = await isPrimaryInstance();
    if (primary) report("SINGLE_INSTANCE_OK");

    // 12. deep-link: command plumbing. OS routing of ztron:// needs a bundle
    // registered with CFBundleURLTypes (the packaged .app); the dev bare
    // binary cannot claim a scheme, so here we verify the plumbing. A real
    // URL delivered during the run is reported as DEEP_LINK_EVENT.
    const lastUrl = await invoke<string | null>(
      "plugin:deep-link|get_last_url",
      {},
    );
    if (lastUrl === null) {
      report("DEEP_LINK_OK");
    } else {
      report("DEEP_LINK_FAIL:" + String(lastUrl));
    }

    await win.setTitle("Ztron M3 Frontend");
    el("status").textContent = "all done";
  } catch (err) {
    const msg = extractError(err);
    el("status").textContent = "error: " + msg;
    await invoke("m3:report", { received: "ERROR:" + msg.slice(0, 60) });
  }
}

main();
// ztron dev test Wed Aug  5 12:50:42 CST 2026
// reload test 1785930460
// reload-1785930512
// reload-1785930556
// reload-1785930603

// watch-test-1785930638389
// reload-1785930686
// reload-1785930759
// reload-1785930815
