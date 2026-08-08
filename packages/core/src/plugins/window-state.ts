/**
 * `plugin:window-state|*` — persist/restore native window geometry.
 * Translated from Tauri's `tauri-plugin-window-state` (position + size +
 * maximized/fullscreen flags).
 */
import type { Plugin } from "../plugin.js";

const enc = new TextEncoder();
const dec = new TextDecoder();

export interface WindowStatePluginOptions {
  /** Path of the state JSON file (default `$TMP/ztron-window-state.json`). */
  file?: string;
  /** Restore geometry automatically shortly after startup (default true). */
  restoreOnStartup?: boolean;
}

export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  maximized: boolean;
  fullscreen: boolean;
}

export function windowStatePlugin(
  options: WindowStatePluginOptions = {},
): Plugin {
  const file = options.file ?? `${tjs.tmpDir}/ztron-window-state.json`;

  async function readState(): Promise<WindowState | null> {
    try {
      const bytes = await tjs.readFile(file);
      const parsed = JSON.parse(dec.decode(bytes)) as Record<string, unknown>;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.width === "number" &&
        typeof parsed.height === "number"
      ) {
        return {
          x: parsed.x,
          y: parsed.y,
          width: parsed.width,
          height: parsed.height,
          maximized: parsed.maximized === true,
          fullscreen: parsed.fullscreen === true,
        };
      }
    } catch {
      /* no state file yet */
    }
    return null;
  }

  async function writeState(state: WindowState): Promise<void> {
    await tjs.writeFile(file, enc.encode(JSON.stringify(state)));
  }

  return {
    name: "window-state",
    commands: {
      async get() {
        return readState();
      },
      async save(_args, ctx) {
        const frame = await ctx.webview.getFrame();
        if (!frame) {
          throw new Error("window-state: failed to read window frame");
        }
        const [maximized, fullscreen] = await Promise.all([
          ctx.webview.windowState("is_maximized"),
          ctx.webview.windowState("is_fullscreen"),
        ]);
        const state: WindowState = {
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          maximized: maximized === true,
          fullscreen: fullscreen === true,
        };
        await writeState(state);
        return state;
      },
      async restore(_args, ctx) {
        const state = await readState();
        if (!state) {
          return null;
        }
        // The webview library re-centers the window on every set_size, so
        // apply the size first and position afterwards (see DESIGN.md §30).
        ctx.webview.setSize(state.width, state.height);
        ctx.webview.setPosition(state.x, state.y);
        if (state.maximized) {
          ctx.webview.windowState("toggle_maximize");
        }
        if (state.fullscreen) {
          ctx.webview.windowState("set_fullscreen", true);
        }
        return state;
      },
    },
    permissions: [
      {
        identifier: "window-state:allow-get",
        commands: ["plugin:window-state|get"],
      },
      {
        identifier: "window-state:allow-save",
        commands: ["plugin:window-state|save"],
      },
      {
        identifier: "window-state:allow-restore",
        commands: ["plugin:window-state|restore"],
      },
    ],
    permissionSets: [
      {
        name: "window-state:default",
        description: "Restore window geometry on startup.",
        permissions: ["window-state:allow-get", "window-state:allow-restore"],
      },
      {
        name: "window-state:write",
        description: "Save + restore window geometry.",
        permissions: ["window-state:default", "window-state:allow-save"],
      },
    ],
    setup(app) {
      if (options.restoreOnStartup !== false) {
        // Windows are created right after plugin setups, so defer one tick.
        setTimeout(() => {
          const wv = app.getWebview("main");
          if (!wv) {
            return;
          }
          void readState().then((state) => {
            if (state) {
              wv.setSize(state.width, state.height);
              wv.setPosition(state.x, state.y);
              if (state.maximized) {
                wv.windowState("toggle_maximize");
              }
              if (state.fullscreen) {
                wv.windowState("set_fullscreen", true);
              }
            }
          });
        }, 100);
      }
    },
  };
}
