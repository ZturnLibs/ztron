/**
 * `plugin:local-ip|*` — the primary interface IPv4 address.
 * Translated from Tauri's `tauri-plugin-local-ip`. Implemented in the plugin
 * layer via platform shell commands (no host changes).
 */
import type { Plugin } from "../plugin.js";

const dec = new TextDecoder();

async function run(cmd: string[]): Promise<string> {
  const proc = tjs.spawn(cmd, { stdout: "pipe", stderr: "ignore" });
  const reader = proc.stdout?.getReader();
  let buf = "";
  if (reader) {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
    }
  }
  await proc.wait();
  return buf.trim();
}

export function localIpPlugin(): Plugin {
  return {
    name: "local-ip",
    commands: {
      async get() {
        const platform = (
          (globalThis as { navigator?: { platform?: string } }).navigator
            ?.platform ?? ""
        ).toLowerCase();
        let ip = "";
        if (platform.includes("mac")) {
          ip = await run(["ipconfig", "getifaddr", "en0"]);
          if (!ip) {
            const iface = await run([
              "sh",
              "-c",
              "route get default 2>/dev/null | awk '/interface:/{print $2}'",
            ]);
            if (iface) ip = await run(["ipconfig", "getifaddr", iface]);
          }
        } else if (platform.includes("linux")) {
          ip = await run([
            "sh",
            "-c",
            "hostname -I 2>/dev/null | awk '{print $1}'",
          ]);
        }
        // Validate IPv4; return null when unknown.
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
      },
    },
    permissions: [
      {
        identifier: "local-ip:allow-get",
        commands: ["plugin:local-ip|get"],
      },
    ],
    permissionSets: [
      {
        name: "local-ip:default",
        description: "Allows querying the primary IPv4 address.",
        permissions: ["local-ip:allow-get"],
      },
    ],
  };
}
