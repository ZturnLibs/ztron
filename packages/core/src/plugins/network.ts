/**
 * `plugin:network|*` — network information (IPv4/IPv6 + public IP).
 * Translated from Tauri's `tauri-plugin-network` (successor of local-ip).
 * Implemented in the plugin layer via shell commands / fetch.
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

function isMac(): boolean {
  return (
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    ""
  )
    .toLowerCase()
    .includes("mac");
}

function isLinux(): boolean {
  return (
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    ""
  )
    .toLowerCase()
    .includes("linux");
}

export function networkPlugin(): Plugin {
  return {
    name: "network",
    commands: {
      async get_local_ipv4() {
        let ip = "";
        if (isMac()) {
          ip = await run(["ipconfig", "getifaddr", "en0"]);
          if (!ip) {
            const iface = await run([
              "sh",
              "-c",
              "route get default 2>/dev/null | awk '/interface:/{print $2}'",
            ]);
            if (iface) ip = await run(["ipconfig", "getifaddr", iface]);
          }
        } else if (isLinux()) {
          ip = await run([
            "sh",
            "-c",
            "hostname -I 2>/dev/null | awk '{print $1}'",
          ]);
        }
        return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
      },
      async get_local_ipv6() {
        let ip = "";
        if (isMac()) {
          ip = await run([
            "sh",
            "-c",
            "ifconfig en0 inet6 2>/dev/null | awk '/inet6/{print $2; exit}'",
          ]);
        } else if (isLinux()) {
          ip = await run([
            "sh",
            "-c",
            "ip -6 addr show scope global 2>/dev/null | grep inet6 | head -1 | awk '{print $2}' | cut -d/ -f1",
          ]);
        }
        return ip.includes(":") ? ip : null;
      },
      async get_public_ip() {
        try {
          const resp = await fetch("https://icanhazip.com");
          const text = (await resp.text()).trim();
          return /^\d{1,3}(\.\d{1,3}){3}$/.test(text) ? text : null;
        } catch {
          return null;
        }
      },
    },
    permissions: [
      {
        identifier: "network:allow-get-local-ipv4",
        commands: ["plugin:network|get_local_ipv4"],
      },
      {
        identifier: "network:allow-get-local-ipv6",
        commands: ["plugin:network|get_local_ipv6"],
      },
      {
        identifier: "network:allow-get-public-ip",
        commands: ["plugin:network|get_public_ip"],
      },
    ],
    permissionSets: [
      {
        name: "network:default",
        description: "Allows querying local/public network addresses.",
        permissions: [
          "network:allow-get-local-ipv4",
          "network:allow-get-local-ipv6",
          "network:allow-get-public-ip",
        ],
      },
    ],
  };
}
