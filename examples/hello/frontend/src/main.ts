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
  Window,
  createTray,
  setTrayTooltip,
  setAppMenu,
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

  try {
    // 1. invoke
    const echoed = await invoke<string>("m3:echo", { msg: "hello-m3" });
    el("invoke").textContent = echoed;
    if (echoed === "echo:hello-m3") report("INVOKE_OK");

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

    // 6. window states + events through the api
    const win = Window.getCurrent();
    const maximized = await win.isMaximized();
    const fullscreen = await win.isFullscreen();
    await win.setAlwaysOnTop(true);
    await win.setResizable(true);
    await win.center();
    if (maximized === false && fullscreen === false) report("WIN_STATE_OK");

    let winEventFired = false;
    const fireWinEvent = () => {
      if (!winEventFired) {
        winEventFired = true;
        report("WIN_EVENT_OK");
      }
    };
    await listen("tauri://blur", fireWinEvent);
    await listen("tauri://focus", fireWinEvent);
    // force a real focus transition: hiding the window reliably loses key
    await win.setVisible(false);
    await new Promise((r) => setTimeout(r, 300));
    await win.setVisible(true);
    await win.setFocus();

    // 7. system tray (creation/title/tooltip; click is manual)
    await createTray({ title: "Ztron", tooltip: "Ztron tray" });
    await setTrayTooltip("Ztron tray updated");
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
