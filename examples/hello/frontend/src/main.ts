/**
 * M3 frontend — uses the real `@ztron/api` package in a Vite-bundled page.
 * Exercises invoke, events, Channel, fs and path through the public API.
 */
import { invoke, listen, Channel, fs, path, Window } from "@ztron/api";

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
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

    // 5. path
    const joined = await path.join("/a", "b", "c");
    el("path").textContent = joined;
    if (joined === "/a/b/c") report("PATH_OK");

    // 6. window commands through the api
    const win = Window.getCurrent();
    await win.setTitle("Ztron M3 Frontend");
    el("status").textContent = "all done";
  } catch (err) {
    el("status").textContent = "error: " + String(err);
    await invoke("m3:report", { received: "ERROR:" + String(err) });
  }
}

main();
