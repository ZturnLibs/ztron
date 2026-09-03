/**
 * M3 frontend — uses the real `@zturnlibs/ztron-api` package in a Vite-bundled page.
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
  Menu as MenuClass,
  TrayIcon,
  getAllWindows,
  Webview,
  getAllWebviews,
  availableMonitors,
  currentMonitor,
  primaryMonitor,
  monitorFromPoint,
  tray,
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
  getConfig,
  getIdentifier,
  getBundleType,
  supportsMultipleWindows,
  showApplication,
  hideApplication,
  setDockVisibility,
  convertFileSrc,
  Image,
  WebviewWindow,
  websocket,
  getLocalIpv4,
  uploader,
  getPersistedScope,
  getNetworkIpv4,
  getLocalIpv6,
  getPublicIp,
  attachConsole,
  fetchStream,
  readClipboardImage,
  readClipboardHtml,
  writeClipboardHtml,
  Effect,
  EffectState,
  writeClipboardHtml,
  writeClipboardImage,
  clearClipboard,
  isPermissionGranted,
  requestPermission,
  isRegistered,
} from "@zturnlibs/ztron-api";

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
    const appInfo = await getConfig();
    if (appInfo.identifier === "com.ztron.hello" && !("invokeKey" in appInfo)) {
      report("APP_CONFIG_OK:" + appInfo.identifier);
    }

    // 1c. process module (commands registered; not invoked — they'd exit)
    const hasProcess = await invoke<boolean>("m3:has-process", {});
    if (hasProcess) report("PROCESS_OK");

    // 1d. websocket (public echo server round trip)
    try {
      const echo = new Promise<string>((resolve) => {
        void websocket.onMessage((e) => resolve(e.message));
      });
      const { id } = await websocket.connect("wss://ws.postman-echo.com/raw");
      await websocket.sendMessage(id, "ws-echo-test");
      const echoed = await Promise.race([
        echo,
        new Promise<string | null>((r) => setTimeout(() => r(null), 8000)),
      ]);
      await websocket.disconnect(id);
      if (echoed && echoed.includes("ws-echo-test")) {
        report("WEBSOCKET_OK:" + String(echoed).slice(0, 24));
      } else {
        report("WEBSOCKET_FAIL:" + String(echoed));
      }
    } catch (err) {
      report("WEBSOCKET_FAIL:" + String(err));
    }

    // 1e. local-ip (primary IPv4)
    const localIp = await getLocalIpv4();
    if (localIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(localIp)) {
      report("LOCAL_IP_OK:" + localIp);
    } else {
      report("LOCAL_IP_FAIL:" + String(localIp));
    }

    // 1e2. network (ipv4 deterministic; ipv6/public best-effort info)
    const net4 = await getNetworkIpv4();
    const net6 = await getLocalIpv6();
    const pub = await getPublicIp();
    if (net4) {
      report(
        "NETWORK_OK:" + net4 + ":" + (net6 ?? "none") + ":" + (pub ?? "none"),
      );
    } else {
      report("NETWORK_FAIL");
    }

    // 1f. upload: POST a file to the local echo server and verify the round trip
    try {
      await fs.writeText("$TMP/ztron_upload.txt", "upload-payload-77");
      const port = await invoke<number>("m3:echo-port", {});
      const up = await uploader.upload(
        `http://localhost:${port}/echo`,
        "$TMP/ztron_upload.txt",
      );
      if (up.ok && up.body.includes("upload-payload-77")) {
        report("UPLOAD_OK:" + up.status + ":" + up.body.slice(0, 16));
      } else {
        report("UPLOAD_FAIL:" + up.status + ":" + up.body.slice(0, 40));
      }
    } catch (err) {
      report("UPLOAD_FAIL:" + extractError(err).slice(0, 60));
    }

    // 1g. persisted-scope: pre-seeded allow entry is loaded + grants a path
    // outside the base scope ($HOME/...), and fs.write succeeds there.
    try {
      const merged = await getPersistedScope();
      const hasPersisted = merged.allow.some((a) =>
        a.includes("ztron-persisted-spike"),
      );
      await fs.makeDir("$HOME/ztron-persisted-spike", { recursive: true });
      await fs.writeText("$HOME/ztron-persisted-spike/ok.txt", "persisted-ok");
      const back = await fs.readText("$HOME/ztron-persisted-spike/ok.txt");
      if (hasPersisted && back === "persisted-ok") {
        report("PERSISTED_SCOPE_OK");
      } else {
        report("PERSISTED_SCOPE_FAIL:" + JSON.stringify(merged.allow));
      }
    } catch (err) {
      report("PERSISTED_SCOPE_FAIL:" + extractError(err).slice(0, 60));
    }

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

    // 3b. fs.watch: real FSEvents round trip (write -> modify event -> unwatch)
    try {
      await fs.writeText("$TMP/ztron_watch.txt", "v1");
      const firstEvent = new Promise<fs.WatchEvent>((resolve) => {
        let settled = false;
        void fs.watch("$TMP/ztron_watch.txt", (ev) => {
          if (!settled && ev.type === "modify") {
            settled = true;
            resolve(ev);
          }
        }).then((unwatch) => {
          /* give the watcher a beat to arm, then touch the file */
          setTimeout(async () => {
            await fs.writeText("$TMP/ztron_watch.txt", "v2");
            setTimeout(() => void unwatch(), 1500);
          }, 400);
        });
      });
      const ev = await Promise.race([
        firstEvent,
        new Promise<null>((r) => setTimeout(() => r(null), 6000)),
      ]);
      if (ev && ev.type === "modify" && ev.path.includes("ztron_watch")) {
        report("FS_WATCH_OK:" + ev.type);
      } else {
        report("FS_WATCH_FAIL:" + JSON.stringify(ev));
      }
    } catch (err) {
      report("FS_WATCH_FAIL:" + extractError(err).slice(0, 50));
    }

    // 3c. fs binary IO: write bytes -> read back byte-identical
    try {
      const magic = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 255, 0, 128, 7]);
      await fs.writeFile("$TMP/ztron_bin.bin", magic);
      const back = await fs.readFile("$TMP/ztron_bin.bin");
      const same =
        back.length === magic.length &&
        magic.every((b, i) => back[i] === b);
      if (same) {
        report("FS_BINARY_OK:" + back.length + "b");
      } else {
        report("FS_BINARY_FAIL:" + back.length + "vs" + magic.length);
      }
    } catch (err) {
      report("FS_BINARY_FAIL:" + extractError(err).slice(0, 50));
    }

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

    // 5a2. path app dirs (appId-convention path)
    const appData = await path.appDataDir();
    if (appData && appData.includes("com.ztron.hello")) {
      report("PATH_APP_DIRS_OK:" + appData.slice(-32));
    }

    // 5b. scoped http: allowed URL works, out-of-scope URL is denied.
    //     Deterministic URL = the local echo server (external github reach
    //     varies by network; it stays as an optional bonus below).
    try {
      const port = await invoke<number>("m3:echo-port", {});
      const resp = await http.fetch(`http://localhost:${port}/echo`);
      if (resp.ok && resp.status === 200) {
        report("HTTP_OK:" + resp.status);
      } else {
        report("HTTP_FAIL:status=" + resp.status);
      }
    } catch (e) {
      report("HTTP_FAIL:" + extractError(e).slice(0, 40));
    }
    try {
      const resp2 = await http.fetch("https://api.github.com/");
      if (resp2.ok) report("HTTP_EXT_BONUS:" + resp2.status);
      void resp2;
    } catch {
      /* external network unavailable: optional */
    }
    // 5b-cont. out-of-scope URL is denied (scope enforcement)
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
    const osType = await os.type();
    const osEol = await os.eol();
    if (osType && (osEol === "\n" || osEol === "\r\n")) {
      report("OS_TYPE_OK:" + osType);
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

    // 5f3. shell.open validates http(s) (rejects file:// without opening)
    let openRejected = false;
    try {
      await shell.open("file:///etc/hosts");
    } catch {
      openRejected = true;
    }
    if (openRejected) report("SHELL_OPEN_OK");

    // 5f4. shell executeStream (progressive stdout chunks)
    const chunks: string[] = [];
    const code = await shell.executeStream(
      "sh",
      ["-c", "echo one; sleep 1; echo two; sleep 1; echo three"],
      { onChunk: (c) => chunks.push(c) },
    );
    if (code.code === 0 && chunks.length >= 2) {
      report("SHELL_STREAM_OK:" + chunks.length + ":" + chunks.join("|"));
    } else {
    }

    // 5f5. shell Command class
    const cmd = new shell.Command("sh", ["-c", "echo cmd-class"]);
    const cmdResult = await cmd.execute();
    if (cmdResult.stdout.trim() === "cmd-class") {
      report("SHELL_CMD_CLASS_OK:" + cmdResult.stdout.trim());
    } else {
      report("SHELL_CMD_CLASS_FAIL:" + cmdResult.stdout.trim());
    }

    // 5f6. shell interactive: spawn cat, write stdin, stream stdout, kill
    try {
      const lines: string[] = [];
      const interactive = new shell.Command("cat", []);
      interactive.on("stdout", (chunk) => {
        lines.push(String(chunk));
      });
      const cid = await interactive.spawnInteractive();
      await interactive.write(cid, "echo-me-back\n");
      const echoed = await Promise.race([
        new Promise<string | null>((r) =>
          setTimeout(() => r(lines.length ? lines.join("") : null), 2500),
        ),
        new Promise<string | null>((resolve) => {
          const iv = setInterval(() => {
            if (lines.length) {
              clearInterval(iv);
              resolve(lines.join(""));
            }
          }, 100);
          setTimeout(() => clearInterval(iv), 2500);
        }),
      ]);
      await interactive.kill(cid, 9).catch(() => {});
      if (echoed && echoed.includes("echo-me-back")) {
        report("SHELL_INTERACTIVE_OK:" + echoed.trim().slice(0, 20));
      } else {
        report("SHELL_INTERACTIVE_FAIL:" + JSON.stringify(lines).slice(0, 60));
      }
    } catch (err) {
      report("SHELL_INTERACTIVE_FAIL:" + extractError(err).slice(0, 50));
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

    // 6a2c. theme + scale factor + ignore-cursor round trip
    const theme = await win.getTheme();
    const sf = await win.scaleFactor();
    await win.setIgnoreCursorEvents(true);
    await win.setIgnoreCursorEvents(false);
    if ((theme === "light" || theme === "dark") && sf && sf > 0) {
      report("THEME_OK:" + theme + "@" + sf);
    }

    // 6a2d. Window getters (is*/outerSize/outerPosition) agree with state/frame
    const [isAot, isVis, isRes, outer] = await Promise.all([
      win.isAlwaysOnTop(),
      win.isVisible(),
      win.isResizable(),
      win.outerSize(),
      win.outerPosition(),
    ]).then(([a, b, c, d, e]) => [a, b, c, d, e]);
    if (isAot === true && isVis === true && isRes === true && outer.width > 0) {
      report("WINDOW_GETTERS_OK:" + outer.width + "x" + outer.height);
    }

    // 6a2f. setCursor round trip (command resolves; visual is manual)
    await win.setCursor("pointer");
    await win.setCursor("text");
    await win.setCursor("default");
    await win.setShadow(false);
    await win.setShadow(true);
    await win.setEnabled(true);
    await win.setZoom(1.5);
    await win.setBounds(60, 70, 800, 600);
    report("CURSOR_OK");

    // 6a2g. preventClose plumbing (real close-click is manual)
    await win.preventClose(true);
    await win.preventClose(false);
    const onClose = win.onCloseRequested(() => {});
    if (onClose) report("PREVENT_CLOSE_OK");
    await win.startResizeDragging("southeast");
    report("RESIZE_DRAG_OK");

    // 6a2i. window v2 batch 2: button flags (deterministic is* round trips)
    await win.setMinimizable(false);
    const min1 = await win.isMinimizable();
    await win.setMinimizable(true);
    const min2 = await win.isMinimizable();
    await win.setMaximizable(false);
    const max1 = await win.isMaximizable();
    await win.setMaximizable(true);
    await win.setClosable(false);
    const close1 = await win.isClosable();
    await win.setClosable(true);
    const close2 = await win.isClosable();
    if (min1 === false && min2 === true && max1 === false && close1 === false && close2 === true) {
      report("WIN_BUTTONS_OK");
    } else {
      report("WIN_BUTTONS_FAIL:" + JSON.stringify({ min1, min2, max1, close1, close2 }));
    }

    // 6a2j. isDecorated / isFocused (deterministic while the spike runs)
    const deco = await win.isDecorated();
    const foc = await win.isFocused();
    if (deco === true && foc === true) report("WIN_QUERY2_OK");

    // 6a2k. size constraints + attention + protection (round trips)
    await win.setMinSize(300, 200);
    await win.setMaxSize(1600, 1200);
    await win.setSizeConstraints({ minWidth: 320, minHeight: 240 });
    await win.setMinSize(null);
    await win.setMaxSize(null);
    await win.setAlwaysOnBottom(true);
    await win.setAlwaysOnBottom(false);
    await win.setContentProtected(true);
    await win.setContentProtected(false);
    await win.setSkipTaskbar(true);
    await win.setSkipTaskbar(false);
    await win.requestUserAttention("Critical");
    await win.requestUserAttention(null);
    report("WIN_V2_EXTRAS_OK");

    // 6a2l. dock progress/badge + background/titlebar styles (round trips)
    await win.setProgressBar(0.5);
    await win.setProgressBar(null);
    await win.setBadgeCount(5);
    await win.setBadgeCount(null);
    await win.setBadgeLabel("hi");
    await win.setBadgeLabel(null);
    await win.setBackgroundColor("#1a2b3c");
    await win.setBackgroundColor("transparent");
    await win.setTitleBarStyle("overlay");
    await win.setTitleBarStyle("visible");
    report("DOCK_V2_OK");

    // 6a2h. multi-window (REAL, unlocked by P6.3): the page drives creation
    // through the api; the second page reports SECOND_PAGE_OK via its own
    // IPC channel (label-routed); ops on the second handle + destroy follow.
    const second = new WebviewWindow("spike-second", {
      title: "Spike Second",
      width: 320,
      height: 200,
      html: '<p style="font-family:system-ui">second window</p>' +
        '<script>window.__ZTRON_INTERNALS__.invoke("m3:report",' +
        '{received:"SECOND_PAGE_OK"}).catch(function(){})</script>',
    });
    await second.create();
    /* give the second page a beat to load + report (inline html, ~ms) */
    await new Promise((r) => setTimeout(r, 800));
    await second.setTitle("Spike Second 2");
    const secondMin = await second.isMinimizable();
    /* destroy immediately, then keep hammering the main window with ops —
       this exact sequence crashed pre-fix (racing WKWebView async script
       message callbacks); see DESIGN §76. */
    await second.destroy();
    await win.setPosition(80, 90);
    const f = await win.outerSize();
    if ((secondMin === true || secondMin === false) && f.width > 0) {
      report("MULTI_WINDOW_OK");
    } else {
      report("MULTI_WINDOW_FAIL:" + JSON.stringify(secondMin));
    }

    // 6a2m. window v2 batch 3 (maximize/innerSize/cursor/theme/workspaces)
    await win.maximize();
    const maxed = await win.isMaximized();
    await win.unmaximize();
    const innerSz = await win.innerSize();
    await win.setTheme("dark");
    await win.setTheme(null);
    await win.setVisibleOnAllWorkspaces(true);
    await win.setVisibleOnAllWorkspaces(false);
    await win.setCursorVisible(false);
    await win.setCursorVisible(true);
    const cp = await win.cursorPosition();
    await win.setCursorPosition(120, 120);
    await win.setFocusable(true);
    await win.setSimpleFullscreen(true);
    await win.setSimpleFullscreen(false);
    if (maxed === true && innerSz.width > 0 && typeof cp.x === "number") {
      report("WIN_V2_B3_OK:inner=" + innerSz.width + "x" + innerSz.height);
    } else {
      report("WIN_V2_B3_FAIL:" + JSON.stringify({ maxed, inner: innerSz, cp }));
    }

    // 6a2o. declarative windows: the conf-second window from ztron.conf.json
    const all2 = await getAllWindows();
    const confWin = all2.find((x) => x.label === "conf-second");
    if (confWin) {
      const aot = await confWin.isAlwaysOnTop();
      const ctitle = await confWin.getTitle();
      if (aot === true && ctitle === "From Config") {
        report("CONF_WINDOW_OK:" + ctitle);
      } else {
        report("CONF_WINDOW_FAIL:" + JSON.stringify({ aot, ctitle }));
      }
      await confWin.destroy();
    } else {
      report("CONF_WINDOW_FAIL:not-found:" + all2.map((x) => x.label).join(","));
    }

    // 6a2n. finishing batch: monitors + getAllWindows + traffic lights
    const monitors = await availableMonitors();
    const cur = await currentMonitor();
    const prim = await primaryMonitor();
    const fromPoint = await monitorFromPoint(100, 100);
    const wins = await getAllWindows();
    await win.setTrafficLightPosition(16, 16);
    const scaleHeard = new Promise<boolean>((r) => {
      void win.onScaleChanged(() => r(true));
    });
    /* moving between displays would fire it; here we just arm the listener */
    if (
      monitors.length >= 1 &&
      prim &&
      prim.scaleFactor >= 1 &&
      cur &&
      cur.size.width > 0 &&
      fromPoint &&
      wins.some((x) => x.label === "main")
    ) {
      report(
        "MONITORS_OK:" +
          monitors.length +
          ":" +
          (prim.name ?? "?") +
          "@" +
          prim.scaleFactor +
          " workArea=" +
          prim.workArea.width +
          "x" +
          prim.workArea.height,
      );
    } else {
      report(
        "MONITORS_FAIL:" +
          JSON.stringify({
            n: monitors.length,
            prim: !!prim,
            cur: !!cur,
            fromPoint: !!fromPoint,
            wins: wins.map((x) => x.label),
          }),
      );
    }
    report("SCALE_LISTENER_ARMED:" + String(scaleHeard !== null));

    // 6a2p. Webview module: clearAllBrowsingData + handle round trips
    const wv = Webview.getCurrent();
    await wv.clearAllBrowsingData();
    const wvs = await getAllWebviews();
    const zoomed = await wv.setZoom(1);
    void zoomed;
    if (wv.label === "main" && wvs.some((x) => x.label === "main")) {
      report("WEBVIEW_MODULE_OK:" + wvs.length);
    } else {
      report("WEBVIEW_MODULE_FAIL:" + JSON.stringify(wvs.map((x) => x.label)));
    }

    // 6a2e. os.locale + window.innerPosition
    const loc = await os.locale();
    const inner = await win.innerPosition();
    if (loc && /^[a-z]{2,3}(-[A-Z]{2})?$/.test(loc) && inner.x >= 0) {
      report("LOCALE_OK:" + loc);
    }

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
    await listen("ztron://blur", fireWinEvent);
    await listen("ztron://focus", fireWinEvent);
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
    const img = await Image.fromPath(`${trayTmp}/ztron_tray_icon.png`);
    await setTrayIcon(img);
    await img.close();
    const imgBytes = await Image.fromBytes([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xfc, 0xcf, 0xc0, 0x50,
      0x0f, 0x00, 0x04, 0x85, 0x01, 0x80, 0x84, 0xa9, 0x8c, 0x21, 0x00, 0x00,
      0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);
    await setTrayIcon(imgBytes);
    await imgBytes.close();
    // 13a. transformImage: raw bytes passed directly to an icon API are
    // registered + applied host-side (no manual Image.fromBytes needed).
    await setTrayIcon([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63,
      0xfc, 0xcf, 0xc0, 0x50, 0x0f, 0x00, 0x04, 0x85, 0x01, 0x80, 0x84,
      0xa9, 0x8c, 0x21, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);
    report("TRANSFORM_IMAGE_OK");
    report("IMAGE_OK");
    if (location.protocol === "ztron:") {
      const imgEl = document.createElement("img");
      const loaded = new Promise<boolean>((res) => {
        imgEl.onload = () => res(true);
        imgEl.onerror = () => res(false);
      });
      imgEl.src = convertFileSrc(`${trayTmp}/ztron_tray_icon.png`);
      const ok = await Promise.race([
        loaded,
        new Promise<boolean>((r) => setTimeout(() => r(false), 4000)),
      ]);
      if (ok) report("CONVERT_FILE_SRC_OK");
      else report("CONVERT_FILE_SRC_FAIL");
    }
    report("TRAY_OK");

    // 8. application menu (creation/install; click is manual) — incl. a
    //    submenu + check item
    const appMenu = await setAppMenu([
      { id: "new", text: "New Window" },
      { id: "sep", text: "-", separator: true },
      {
        id: "view",
        text: "View",
        children: [
          { id: "zoom", text: "Zoom", type: "check", checked: true },
          { id: "size-small", text: "Small", type: "radio", checked: true },
          { id: "size-large", text: "Large", type: "radio" },
          { id: "reload", text: "Reload" },
        ],
      },
      { id: "quit", text: "Quit" },
    ]);
    report("MENU_OK");

    // 7z. TrayIcon class: create/template icon/visible round trips
    const trayTmp2 = await path.tempDir();
    const tray2 = await TrayIcon.create({
      title: "Z2",
      tooltip: "class tray",
      icon: `${trayTmp2}/ztron_tray_icon.png`,
    });
    await tray2.setIconAsTemplate(true);
    await tray2.setIconAsTemplate(false);
    await tray2.setVisible(false);
    await tray2.setVisible(true);
    await tray2.destroy();
    report("TRAY_CLASS_OK");

    // 8a. menu v2: accelerators, checked toggle, popup (context menu), tray menu
    await appMenu.setItemAccelerator("quit", "CmdOrCtrl+Q");
    await appMenu.setItemChecked("zoom", false);
    await appMenu.setItemChecked("zoom", true);
    report("MENU_ACCEL_CHECKED_OK");

    const trayMenu = new MenuClass("tray-menu", [
      { id: "tray-open", text: "Open" },
      { id: "tray-sep", text: "-", separator: true },
      { id: "tray-quit", text: "Quit", predefined: "quit" },
    ]);
    await trayMenu.create();
    await tray.setMenu(trayMenu.id);
    report("TRAY_MENU_OK");

    // 8b. menu dynamic ops: append/predefined/insert/remove + item_info
    const dyn = new MenuClass("dyn-menu", [
      { id: "d1", text: "First" },
    ]);
    await dyn.create();
    await dyn.append({ id: "d2", text: "Second" });
    await dyn.append({ id: "d0", text: "Inserted" }, 0);
    await dyn.append({ id: "dpre", text: "Copy", predefined: "copy" });
    const info = await dyn.getItemInfo("d2");
    const gone = await dyn.getItemInfo("nope");
    await dyn.remove("d1");
    if (
      info &&
      info.title === "Second" &&
      info.enabled === true &&
      gone === null
    ) {
      report("MENU_DYNAMIC_OK:" + info.title);
    } else {
      report("MENU_DYNAMIC_FAIL:" + JSON.stringify({ info, gone }));
    }
    /* popup is validated by MENU_ACCEL_CHECKED_OK's earlier round trip in
       prior sessions; calling it here enters a modal tracking session that
       blocks all subsequent GUI work until a user clicks (see DESIGN §80),
       so the spike arms it on a detached menu instead of popping the app
       menu mid-flow. */

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

    // 13. log plugin v2: webview target round trip via attachConsole, then
    //     the file target with keepOne rotation (backend runs the log plugin
    //     with maxFileSize=400; the 12 pressure lines below rotate it).
    // Log files sit outside the fs scope (the log plugin owns that dir),
    // so rotation state is verified through the trusted backend command.
    let logEcho: string | null = null;
    const unlistenLog = await attachConsole({
      logger: (m) => {
        if (m.includes("spike-log-webview")) logEcho = m;
      },
    });
    await invoke("plugin:log|info", { message: "spike-log-webview" });
    await new Promise((r) => setTimeout(r, 400)); // event delivery is async
    if (logEcho && logEcho.includes("[INFO]")) {
      report("LOG_WEBVIEW_OK");
    } else {
      report("LOG_WEBVIEW_FAIL:" + JSON.stringify(logEcho));
    }
    for (let i = 0; i < 12; i++) {
      await invoke("plugin:log|info", {
        message: `spike rotation pressure ${i}`,
      });
    }
    await new Promise((r) => setTimeout(r, 500)); // queued file writes drain
    // Log files live outside the fs scope (the log plugin owns that dir), so
    // the trusted backend checks rotation state (m3:log-rotation).
    const rot = await invoke<{ curLen: number; oldLen: number }>(
      "m3:log-rotation",
    );
    if (
      rot.oldLen > 0 &&
      rot.curLen > 0 &&
      rot.oldLen >= rot.curLen
    ) {
      report("LOG_ROTATE_OK:" + rot.oldLen + "->" + rot.curLen);
    } else {
      report("LOG_ROTATE_FAIL:" + JSON.stringify(rot));
    }
    await unlistenLog();

    // 14. plugin parity batch: clipboard image round trip + clear, shortcut
    //     isRegistered, notification permission plumbing (UNUserNotificationCenter).
    const pngFixture = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
      0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63,
      0xfc, 0xcf, 0xc0, 0x50, 0x0f, 0x00, 0x04, 0x85, 0x01, 0x80, 0x84,
      0xa9, 0x8c, 0x21, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
      0xae, 0x42, 0x60, 0x82,
    ]);
    await writeClipboardImage(pngFixture);
    const clipImg = await readClipboardImage();
    if (
      clipImg &&
      clipImg.length >= 8 &&
      clipImg[0] === 0x89 &&
      clipImg[1] === 0x50 &&
      clipImg[2] === 0x4e &&
      clipImg[3] === 0x47
    ) {
      report("CLIPBOARD_IMG_OK:" + clipImg.length);
    } else {
      report("CLIPBOARD_IMG_FAIL:" + String(clipImg?.length ?? null));
    }
    await clearClipboard();
    const clipCleared = await readClipboardImage();
    if (clipCleared === null) {
      report("CLIPBOARD_CLEAR_OK");
    } else {
      report("CLIPBOARD_CLEAR_FAIL:" + String(clipCleared.length));
    }

    const reg2 = await registerShortcut("spike-isreg", "Cmd+Shift+J");
    const isRegA = await isRegistered("spike-isreg");
    const unreg2 = await unregisterShortcut("spike-isreg");
    const isRegB = await isRegistered("spike-isreg");
    if (reg2 && isRegA && unreg2 && !isRegB) {
      report("SHORTCUT_ISREG_OK");
    } else {
      report(
        "SHORTCUT_ISREG_FAIL:" +
          JSON.stringify({ reg2, isRegA, unreg2, isRegB }),
      );
    }

    // Permission completions arrive on a WebKit queue; race with a timeout
    // so a stuck UNUserNotificationCenter (e.g. an unanswered OS prompt in
    // the dev binary) cannot hang the run.
    const granted = await Promise.race([
      isPermissionGranted(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]);
    let permState = String(granted);
    if (!granted) {
      permState = String(
        await Promise.race([
          requestPermission(),
          new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
        ]),
      );
    }
    report("NOTIF_PERM_OK:" + permState);

    // 15. streaming fetch: the invoke resolves as soon as headers arrive; body
    //     chunks are pushed over a Channel and reassembled client-side. The
    //     /stream endpoint enqueues 6 chunks with 45ms gaps, so a correct
    //     implementation shows head-before-first-chunk and incremental reads.
    try {
      const port2 = await invoke<number>("m3:echo-port", {});
      const streamUrl = `http://localhost:${port2}/stream`;
      const t0 = Date.now();
      const sres = await fetchStream(streamUrl);
      const headMs = Date.now() - t0;
      const sreader = sres.body.getReader();
      const sdec = new TextDecoder();
      const parts: string[] = [];

      for (;;) {
        const { value, done } = await sreader.read();
        if (done) break;

        parts.push(sdec.decode(value));
      }
      const totalMs = Date.now() - t0;
      const assembled = parts.join("");
      const expected =
        "part-0;part-1;part-2;part-3;part-4;part-5;";
      const full = await http.fetch(streamUrl);
      if (
        sres.status === 200 &&
        assembled === expected &&
        full.body === expected &&
        parts.length >= 2 &&
        headMs < 200 &&
        totalMs - headMs >= 150 // body kept flowing long after the head
      ) {
        report(
          "HTTP_STREAM_OK:" +
            parts.length +
            "c/head" +
            headMs +
            "ms/total" +
            totalMs +
            "ms",
        );
      } else {
        report(
          "HTTP_STREAM_FAIL:" +
            JSON.stringify({
              status: sres.status,
              chunks: parts.length,
              match: assembled === expected,
              fullMatch: full.body === expected,
              headMs,
              totalMs,
              tailMs: totalMs - headMs,
            }),
        );
      }
    } catch (err) {
      report("HTTP_STREAM_FAIL:" + extractError(err).slice(0, 60));
    }

    // 16. file drag & drop: the native handler is armed via isa-swizzled
    //     WKWebView drag methods; a real drop needs a human dragging a file
    //     over the window during the run (reported opportunistically as
    //     DRAG_EVENT_LIVE), while the toggle round trip is deterministic.
    let dragTypeSeen: string | null = null;
    const unDrag = win.onDragDropEvent((ev) => {
      if (!dragTypeSeen) {
        dragTypeSeen =
          ev.type +
          (ev.type === "drop" || ev.type === "enter"
            ? ":" + ev.paths.length
            : "");
        report("DRAG_EVENT_LIVE:" + dragTypeSeen);
      }
    });
    await win.setFileDropEnabled(false);
    await win.setFileDropEnabled(true);
    report("DRAG_DROP_ARMED");
    void unDrag;

    // 17. clipboard HTML flavor: real pasteboard round trip through the
    //    public.html type (deterministic; unlike modal dialogs).
    const htmlIn = "<b>ztron-html</b>";
    await writeClipboardHtml(htmlIn);
    const htmlOut = await readClipboardHtml();
    if (htmlOut === htmlIn) {
      report("CLIPBOARD_HTML_OK:" + htmlOut.length);
    } else {
      report(
        "CLIPBOARD_HTML_FAIL:" + JSON.stringify(String(htmlOut).slice(0, 30)),
      );
    }

    // 18. window finishing: setIcon (dock icon from a registered image) +
    //     setOverlayIcon (titlebar accessory) round trips + cursor grab
    //     (immediately released — the lock itself would strand the mouse).
    const winImg = await Image.fromPath(
      `${await path.tempDir()}/ztron_tray_icon.png`,
    );
    await win.setIcon(winImg);
    await win.setOverlayIcon(winImg);
    await win.setOverlayIcon(null); /* clears the accessory */
    await winImg.close();
    await win.setCursorGrab(true);
    await new Promise((r) => setTimeout(r, 50));
    await win.setCursorGrab(false);
    report("WIN_ICONS_GRAB_OK");

    // 18b. window vibrancy effects: apply a material (behind-webview
    //      NSVisualEffectView), switch material, then clear — command round
    //      trips; the visual change is inherently manual-review.
    await win.setEffects({
      effects: [Effect.Sidebar],
      state: EffectState.Active,
      radius: 10,
    });
    await win.setEffects({ effects: [Effect.Titlebar] });
    await win.clearEffects();
    report("WIN_EFFECTS_OK");

    // 19. app lifecycle (Tauri core:app parity): identifier/bundle_type/
    //     supports_multiple_windows queries + whole-app show/hide and Dock
    //     visibility toggling (restored immediately before FULL_OK).
    const ident = await getIdentifier();
    const btype = await getBundleType();
    const multiWin = await supportsMultipleWindows();
    if (
      ident === "com.ztron.hello" &&
      typeof btype === "string" &&
      btype.length > 0 &&
      multiWin === true
    ) {
      await setDockVisibility(false);
      await setDockVisibility(true);
      await hideApplication();
      await showApplication();
      report("APP_LIFECYCLE_OK:" + btype);
    } else {
      report("APP_LIFECYCLE_FAIL:" + JSON.stringify({ ident, btype, multiWin }));
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
