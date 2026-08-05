/**
 * `plugin:autostart|*` — launch the app at login.
 * Translated from Tauri's `tauri-plugin-autostart` (simplified):
 *   - macOS: writes a LaunchAgents plist
 *   - Linux: writes ~/.config/autostart/*.desktop
 *   - Windows: sets HKCU Run via `reg.exe` (spawn)
 *
 * The launch command defaults to the current executable (tjs.exePath); for
 * packaged apps set the `.app`/binary path explicitly via `exec`.
 */
import type { Plugin } from "../plugin.js";

export interface AutostartPluginOptions {
  /** Identifier used for the launch file/registry key (default "ztron"). */
  id?: string;
  /** Command to launch at login (default: current executable path). */
  exec?: string;
}

interface AutostartBackend {
  enable(exec: string): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

function currentPlatform(): "macos" | "windows" | "linux" {
  const p =
    (globalThis as { navigator?: { platform?: string } }).navigator?.platform ??
    "";
  const l = p.toLowerCase();
  if (l.includes("mac")) return "macos";
  if (l.includes("win")) return "windows";
  return "linux";
}

function macosBackend(id: string): AutostartBackend {
  const dir = `${tjs.homeDir}/Library/LaunchAgents`;
  const file = `${dir}/${id}.plist`;
  return {
    async enable(exec) {
      await tjs.makeDir(dir, 0o755).catch(() => {});
      const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${id}</string>
  <key>ProgramArguments</key>
  <array><string>${exec}</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>`;
      await tjs.writeFile(file, plist);
    },
    async disable() {
      await tjs.remove(file).catch(() => {});
    },
    async isEnabled() {
      try {
        await tjs.stat(file);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function linuxBackend(id: string): AutostartBackend {
  const dir = `${tjs.homeDir}/.config/autostart`;
  const file = `${dir}/${id}.desktop`;
  return {
    async enable(exec) {
      await tjs.makeDir(dir, 0o755).catch(() => {});
      const desktop = `[Desktop Entry]
Type=Application
Name=${id}
Exec=${exec}
X-GNOME-Autostart-enabled=true
`;
      await tjs.writeFile(file, desktop);
    },
    async disable() {
      await tjs.remove(file).catch(() => {});
    },
    async isEnabled() {
      try {
        await tjs.stat(file);
        return true;
      } catch {
        return false;
      }
    },
  };
}

function windowsBackend(id: string): AutostartBackend {
  const key = `HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run`;
  const value = id;
  return {
    async enable(exec) {
      await runReg(["add", key, "/v", value, "/t", "REG_SZ", "/d", exec, "/f"]);
    },
    async disable() {
      await runReg(["delete", key, "/v", value, "/f"]).catch(() => {});
    },
    async isEnabled() {
      const { code, stdout } = await runReg(["query", key, "/v", value]);
      return code === 0 && stdout.includes(value);
    },
  };
}

async function runReg(
  args: string[],
): Promise<{ code: number; stdout: string }> {
  const proc = tjs.spawn(["reg.exe", ...args], {
    stdout: "pipe",
    stderr: "ignore",
  });
  const dec = new TextDecoder();
  const reader = proc.stdout?.getReader();
  let out = "";
  if (reader) {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      out += dec.decode(value);
    }
  }
  const status = await proc.wait();
  return { code: status.exitStatus ?? -1, stdout: out };
}

export function autostartPlugin(options: AutostartPluginOptions = {}): Plugin {
  const id = options.id ?? "ztron";
  const exec = options.exec ?? tjs.exePath;
  const platform = currentPlatform();
  const backend: AutostartBackend =
    platform === "macos"
      ? macosBackend(id)
      : platform === "windows"
        ? windowsBackend(id)
        : linuxBackend(id);

  return {
    name: "autostart",
    commands: {
      enable: () => backend.enable(exec),
      disable: () => backend.disable(),
      is_enabled: () => backend.isEnabled(),
    },
    permissions: [
      {
        identifier: "autostart:allow-enable",
        commands: ["plugin:autostart|enable"],
      },
      {
        identifier: "autostart:allow-disable",
        commands: ["plugin:autostart|disable"],
      },
      {
        identifier: "autostart:allow-is-enabled",
        commands: ["plugin:autostart|is_enabled"],
      },
    ],
    permissionSets: [
      {
        name: "autostart:default",
        description: "Allows enabling/disabling launch at login.",
        permissions: [
          "autostart:allow-enable",
          "autostart:allow-disable",
          "autostart:allow-is-enabled",
        ],
      },
    ],
  };
}
