/**
 * App builder & runtime bootstrap — translated from Tauri's
 * `crates/tauri/src/app.rs` (Builder + App).
 */
import { CommandRegistry, type CommandHandlers } from "./commands/index.js";
import type { CommandContext } from "./commands/index.js";
import { EventTarget } from "./events.js";
import { ChannelHandle } from "./ipc/channel.js";
import { RawResponse } from "./ipc/raw.js";
import {
  EventManager,
  type EventTarget as EventTargetRef,
} from "./ipc/eventManager.js";
import { IpcHub, type InvokeHandler } from "./ipc/mod.js";
import { PluginManager, type Plugin } from "./plugin.js";
import type {
  MenuConfig,
  OpenDialogOptions,
  RuntimeAdapter,
  SaveDialogOptions,
  MessageDialogOptions,
  WebviewHandle,
  WindowConfig,
} from "./runtime.js";
import { StateManager } from "./state.js";
import { buildInitScript } from "@ztron/inject";
import {
  PermissionRegistry,
  ResolvedAcl,
  resolveAcl,
  permissiveAcl,
  type CapabilityFile,
} from "./acl/index.js";

export interface AppConfig {
  /** Reverse-domain identifier, e.g. `com.example.app`. */
  identifier: string;
  appName?: string;
  version?: string;
  /** The `__TAURI_INVOKE_KEY__` used to authenticate IPC messages. */
  invokeKey: string;
  windows: WindowConfig[];
  /** Inject the full internals on `window` (like `withGlobalTauri`). */
  withGlobalTauri?: boolean;
  /** Override the default `__TAURI_INTERNALS__` init script. */
  initScript?: string;
  /**
   * Capability files restricting which commands each window may invoke.
   * When empty, the app runs in permissive mode (all commands allowed),
   * matching v1 default. Authors opt into ACL by adding capabilities here.
   */
  capabilities?: CapabilityFile[];
}

export interface AppOptions {
  adapter: RuntimeAdapter;
  plugins?: Plugin[];
  setup?: (app: App) => void | Promise<void>;
}

/**
 * The application runtime. Owns the command registry, event bus, state and
 * plugin manager, and bridges them to the runtime adapter.
 */
export class App {
  readonly commands: CommandRegistry;
  readonly events: EventTarget;
  readonly state: StateManager;
  readonly plugins: PluginManager;
  readonly config: AppConfig;

  #adapter: RuntimeAdapter;
  #hub = new IpcHub();
  #windows = new Map<string, { handle: WebviewHandle; events: EventTarget }>();
  #eventManager: EventManager;
  #setup?: (app: App) => void | Promise<void>;
  #invokeKey: string;

  constructor(config: AppConfig, options: AppOptions) {
    this.config = config;
    this.#adapter = options.adapter;
    this.#setup = options.setup;
    this.commands = new CommandRegistry();
    this.events = new EventTarget();
    this.state = new StateManager();
    this.plugins = new PluginManager();
    this.#invokeKey = config.invokeKey;
    this.#eventManager = new EventManager((label) => this.getWebview(label));
    this.#adapter.tray?.onEvent(() => {
      this.emit("tauri://tray-click");
    });
    this.#adapter.menu?.onEvent((event) => {
      this.emit("tauri://menu", event);
    });
    this.#adapter.globalShortcut?.onEvent((event) => {
      this.emit("tauri://global-shortcut", event);
    });
    this.#adapter.deepLink?.onEvent((url) => {
      this.emit("tauri://deep-link", { url });
    });

    this.registerBuiltinCommands();

    for (const plugin of options.plugins ?? []) {
      this.plugins.register(plugin);
      if (plugin.commands) {
        this.registerPluginCommands(plugin);
      }
    }
    for (const [cmd, handler] of this.pluginCommandEntries()) {
      this.#hub.register(cmd, handler);
    }
    /* Tauri window-plugin semantics: `plugin:window|*` commands address a
       window by payload `label` (any window may invoke them — e.g. the main
       page controlling a second window). Wrap each handler so `ctx.webview`
       is the TARGET handle, not merely the issuing one (pre-fix, invoking
       `second.destroy()` from the main page destroyed the MAIN window). */
    for (const [cmd, handler] of this.#hub.entries()) {
      if (!cmd.startsWith("plugin:window|")) continue;
      this.#hub.register(cmd, (args, ctx) => {
        const label = (args as { label?: string } | null)?.label;
        if (!label || label === ctx.label) return handler(args, ctx);
        const target = this.getWebview(label);
        if (!target) {
          throw new Error(`window not found: ${label}`);
        }
        return handler(args, { ...ctx, webview: target, label });
      });
    }

    this.buildAcl(options.plugins ?? []);
  }

  /** Builds the permission registry + resolved ACL and arms the IPC gate. */
  private buildAcl(plugins: Plugin[]): void {
    const registry = new PermissionRegistry();

    // Register core (built-in) permissions: one allow per built-in command,
    // plus a `core:default` set that grants all of them. Apps reference this
    // in capabilities as `core:default` (or individual `core:allow-<cmd>`).
    const coreAllowed: string[] = [
      "plugin:event|listen",
      "plugin:event|unlisten",
      "plugin:event|emit",
      "plugin:event|emit_to",
      "plugin:webview|create",
      "plugin:webview|clear_all_browsing_data",
      "plugin:window|close",
      "plugin:window|prevent_close",
      "plugin:window|destroy",
      "plugin:window|set_title",
      "plugin:window|set_size",
      "plugin:window|minimize",
      "plugin:window|unminimize",
      "plugin:window|toggle_maximize",
      "plugin:window|is_maximized",
      "plugin:window|is_minimized",
      "plugin:window|set_fullscreen",
      "plugin:window|is_fullscreen",
      "plugin:window|set_always_on_top",
      "plugin:window|center",
      "plugin:window|set_focus",
      "plugin:window|set_visible",
      "plugin:window|show",
      "plugin:window|hide",
      "plugin:window|set_resizable",
      "plugin:window|set_opacity",
      "plugin:window|set_transparent",
      "plugin:window|set_decorations",
      "plugin:window|get_frame",
      "plugin:window|get_position",
      "plugin:window|get_state",
      "plugin:window|get_title",
      "plugin:window|get_theme",
      "plugin:window|get_scale_factor",
      "plugin:window|set_ignore_cursor_events",
      "plugin:window|set_cursor",
      "plugin:window|set_zoom",
      "plugin:window|set_shadow",
      "plugin:window|set_enabled",
      "plugin:window|set_position",
      "plugin:window|set_bounds",
      "plugin:window|set_size_constraints",
      "plugin:window|set_min_size",
      "plugin:window|set_max_size",
      "plugin:window|set_minimizable",
      "plugin:window|is_minimizable",
      "plugin:window|set_maximizable",
      "plugin:window|is_maximizable",
      "plugin:window|set_closable",
      "plugin:window|is_closable",
      "plugin:window|is_decorated",
      "plugin:window|is_focused",
      "plugin:window|set_skip_taskbar",
      "plugin:window|set_always_on_bottom",
      "plugin:window|set_content_protected",
      "plugin:window|set_progress_bar",
      "plugin:window|set_badge_count",
      "plugin:window|set_badge_label",
      "plugin:window|request_user_attention",
      "plugin:window|set_background_color",
      "plugin:window|set_titlebar_style",
      "plugin:window|maximize",
      "plugin:window|unmaximize",
      "plugin:window|is_enabled",
      "plugin:window|inner_size",
      "plugin:window|set_focusable",
      "plugin:window|set_cursor_visible",
      "plugin:window|cursor_position",
      "plugin:window|set_cursor_position",
      "plugin:window|set_theme",
      "plugin:window|set_visible_on_all_workspaces",
      "plugin:window|set_simple_fullscreen",
      "plugin:window|get_all_windows",
      "plugin:window|available_monitors",
      "plugin:window|primary_monitor",
      "plugin:window|current_monitor",
      "plugin:window|monitor_from_point",
      "plugin:window|set_traffic_light_position",
      "plugin:window|start_dragging",
      "plugin:window|start_resize_dragging",
      "plugin:window|set_file_drop_enabled",
      "plugin:app|name",
      "plugin:app|version",
      "plugin:app|tauri_version",
      "plugin:app|get_config",
      "plugin:image|from_bytes",
      "plugin:image|from_path",
      "plugin:image|destroy",
      "plugin:process|exit",
      "plugin:process|relaunch",
      "plugin:notification|send",
      "plugin:notification|is_permission_granted",
      "plugin:notification|request_permission",
      "plugin:global-shortcut|register",
      "plugin:global-shortcut|unregister",
      "plugin:global-shortcut|is_registered",
      "plugin:deep-link|get_last_url",
      "plugin:tray|create",
      "plugin:tray|set_title",
      "plugin:tray|set_tooltip",
      "plugin:tray|set_icon",
      "plugin:tray|set_menu",
      "plugin:tray|set_visible",
      "plugin:tray|set_icon_as_template",
      "plugin:tray|destroy",
      "plugin:menu|create",
      "plugin:menu|set_as_app_menu",
      "plugin:menu|set_item_enabled",
      "plugin:menu|set_item_title",
      "plugin:menu|set_item_checked",
      "plugin:menu|set_item_accel",
      "plugin:menu|popup",
      "plugin:menu|add_item",
      "plugin:menu|remove_item",
      "plugin:menu|item_info",
      "plugin:menu|destroy",
      "plugin:dialog|open",
      "plugin:dialog|save",
      "plugin:dialog|message",
      "plugin:clipboard|read_text",
      "plugin:clipboard|write_text",
      "plugin:clipboard|read_image",
      "plugin:clipboard|write_image",
      "plugin:clipboard|clear",
    ];
    const coreIds: string[] = [];
    for (const cmd of coreAllowed) {
      const parts = cmd.split("|");
      const pluginPart = parts[0]?.replace("plugin:", "") ?? "core";
      const cmdPart = parts[1] ?? cmd;
      const id = `core:allow-${pluginPart}_${cmdPart.replace(/-/g, "_")}`;
      registry.register({ identifier: id, commands: [cmd] });
      coreIds.push(id);
    }
    registry.registerSet({
      name: "core:default",
      permissions: coreIds,
      description: "Grants all built-in Ztron commands.",
    });

    for (const p of plugins) {
      for (const perm of p.permissions ?? []) {
        registry.register(perm);
      }
      for (const set of p.permissionSets ?? []) {
        registry.registerSet(set);
      }
    }

    const capabilities = this.config.capabilities ?? [];
    const acl: ResolvedAcl =
      capabilities.length === 0
        ? permissiveAcl()
        : resolveAcl(registry, capabilities);
    this.#hub.setAcl(acl);
  }

  /** The backend event registry backing the `plugin:event|*` commands. */
  get eventManager(): EventManager {
    return this.#eventManager;
  }

  /**
   * Registers the built-in `plugin:event|*` and `plugin:window|*` commands
   * (the Ztron equivalents of Tauri's event + window plugins).
   */
  private registerBuiltinCommands(): void {
    const commands: Record<
      string,
      (args: unknown, ctx: CommandContext) => unknown
    > = {
      "plugin:event|listen": (args, ctx) => {
        const { event, target, handler } = args as {
          event: string;
          target: EventTargetRef;
          handler: number;
        };
        return this.#eventManager.listen(ctx.label, event, target, handler);
      },
      "plugin:event|unlisten": (args) => {
        const { event, eventId } = args as { event: string; eventId: number };
        this.#eventManager.unlisten(event, eventId);
      },
      "plugin:event|emit": (args) => {
        const { event, payload } = args as { event: string; payload?: unknown };
        this.#eventManager.emit(event, payload);
      },
      "plugin:event|emit_to": (args) => {
        const { target, event, payload } = args as {
          target: EventTargetRef;
          event: string;
          payload?: unknown;
        };
        this.#eventManager.emit(event, payload, target);
      },
      "plugin:webview|create": (args, ctx) => {
        ctx.app.createWindow(args as import("./runtime.js").WindowConfig);
      },
      "plugin:webview|clear_all_browsing_data": (_args, ctx) => {
        ctx.webview.clearBrowsingData();
      },
      "plugin:window|close": (_args, ctx) => {
        ctx.webview.terminate();
      },
      "plugin:window|prevent_close": (args, ctx) => {
        ctx.webview.windowState(
          "set_prevent_close",
          Boolean((args as { prevent?: boolean }).prevent),
        );
      },
      "plugin:window|destroy": (_args, ctx) => {
        ctx.webview.destroy();
      },
      "plugin:window|start_resize_dragging": (args, ctx) => {
        ctx.webview.startResizeDragging(
          String((args as { direction?: string }).direction ?? "southeast"),
        );
      },
      "plugin:window|set_file_drop_enabled": (args, ctx) => {
        ctx.webview.windowState(
          "set_file_drop_enabled",
          Boolean((args as { value?: boolean }).value),
        );
      },
      "plugin:window|set_title": (args, ctx) => {
        const { title } = args as { title: string };
        ctx.webview.setTitle(title);
      },
      "plugin:window|set_size": (args, ctx) => {
        const { width, height } = args as { width: number; height: number };
        ctx.webview.setSize(width, height);
      },
      "plugin:window|minimize": (_args, ctx) =>
        ctx.webview.windowState("minimize"),
      "plugin:window|unminimize": (_args, ctx) =>
        ctx.webview.windowState("unminimize"),
      "plugin:window|toggle_maximize": (_args, ctx) =>
        ctx.webview.windowState("toggle_maximize"),
      "plugin:window|is_maximized": async (_args, ctx) =>
        ctx.webview.windowState("is_maximized"),
      "plugin:window|is_minimized": async (_args, ctx) =>
        ctx.webview.windowState("is_minimized"),
      "plugin:window|set_fullscreen": (args, ctx) => {
        ctx.webview.windowState(
          "set_fullscreen",
          Boolean((args as { fullscreen?: boolean }).fullscreen),
        );
      },
      "plugin:window|is_fullscreen": async (_args, ctx) =>
        ctx.webview.windowState("is_fullscreen"),
      "plugin:window|set_always_on_top": (args, ctx) => {
        ctx.webview.windowState(
          "set_always_on_top",
          Boolean((args as { alwaysOnTop?: boolean }).alwaysOnTop),
        );
      },
      "plugin:window|center": (_args, ctx) => ctx.webview.windowState("center"),
      "plugin:window|set_focus": (_args, ctx) =>
        ctx.webview.windowState("set_focus"),
      "plugin:window|set_visible": (args, ctx) => {
        ctx.webview.windowState(
          "set_visible",
          Boolean((args as { visible?: boolean }).visible),
        );
      },
      "plugin:window|show": (_args, ctx) =>
        ctx.webview.windowState("set_visible", true),
      "plugin:window|hide": (_args, ctx) =>
        ctx.webview.windowState("set_visible", false),
      "plugin:window|set_resizable": (args, ctx) => {
        ctx.webview.windowState(
          "set_resizable",
          Boolean((args as { resizable?: boolean }).resizable),
        );
      },
      "plugin:window|set_opacity": (args, ctx) => {
        const { opacity } = args as { opacity: number };
        ctx.webview.setOpacity(Number(opacity));
      },
      "plugin:window|set_transparent": (args, ctx) => {
        ctx.webview.windowState(
          "set_transparent",
          Boolean((args as { transparent?: boolean }).transparent),
        );
      },
      "plugin:window|set_decorations": (args, ctx) => {
        ctx.webview.windowState(
          "set_decorations",
          Boolean((args as { decorations?: boolean }).decorations),
        );
      },
      "plugin:window|get_frame": async (_args, ctx) => ctx.webview.getFrame(),
      "plugin:window|get_position": async (_args, ctx) => {
        const f = await ctx.webview.getFrame();
        return f ? { x: f.x, y: f.y } : null;
      },
      "plugin:window|get_state": async (_args, ctx) =>
        ctx.webview.getWindowState(),
      "plugin:window|get_title": async (_args, ctx) => {
        const t = await ctx.webview.getWindowTitle();
        return t ?? "";
      },
      "plugin:window|get_theme": async (_args, ctx) => ctx.webview.getTheme(),
      "plugin:window|get_scale_factor": async (_args, ctx) =>
        ctx.webview.getScaleFactor(),
      "plugin:window|set_ignore_cursor_events": (args, ctx) => {
        ctx.webview.setIgnoreCursorEvents(
          Boolean((args as { ignore?: boolean }).ignore),
        );
      },
      "plugin:window|set_cursor": (args, ctx) => {
        ctx.webview.setCursor(
          String((args as { cursor?: string }).cursor ?? ""),
        );
      },
      "plugin:window|set_zoom": (args, ctx) => {
        ctx.webview.setZoom(Number((args as { zoom?: number }).zoom ?? 1));
      },
      "plugin:window|set_shadow": (args, ctx) => {
        ctx.webview.windowState(
          "set_shadow",
          Boolean((args as { shadow?: boolean }).shadow),
        );
      },
      "plugin:window|set_enabled": (args, ctx) => {
        ctx.webview.windowState(
          "set_enabled",
          Boolean((args as { enabled?: boolean }).enabled),
        );
      },
      "plugin:window|set_position": (args, ctx) => {
        const { x, y } = args as { x: number; y: number };
        ctx.webview.setPosition(Number(x), Number(y));
      },
      "plugin:window|set_bounds": (args, ctx) => {
        const { x, y, width, height } = args as {
          x: number;
          y: number;
          width: number;
          height: number;
        };
        ctx.webview.setBounds(
          Number(x),
          Number(y),
          Number(width),
          Number(height),
        );
      },
      "plugin:window|set_size_constraints": (args, ctx) => {
        const { min, max } = args as {
          min?: { width: number; height: number };
          max?: { width: number; height: number };
        };
        if (min) {
          ctx.webview.setMinSize(Number(min.width), Number(min.height));
        }
        if (max) {
          ctx.webview.setMaxSize(Number(max.width), Number(max.height));
        }
      },
      "plugin:window|set_min_size": (args, ctx) => {
        const { width, height } = args as { width: number; height: number };
        ctx.webview.setMinSize(Number(width), Number(height));
      },
      "plugin:window|set_max_size": (args, ctx) => {
        const { width, height } = args as { width: number; height: number };
        ctx.webview.setMaxSize(Number(width), Number(height));
      },
      "plugin:window|set_minimizable": (args, ctx) => {
        ctx.webview.windowState(
          "set_minimizable",
          Boolean((args as { minimizable?: boolean }).minimizable),
        );
      },
      "plugin:window|is_minimizable": async (_args, ctx) =>
        ctx.webview.windowState("is_minimizable"),
      "plugin:window|set_maximizable": (args, ctx) => {
        ctx.webview.windowState(
          "set_maximizable",
          Boolean((args as { maximizable?: boolean }).maximizable),
        );
      },
      "plugin:window|is_maximizable": async (_args, ctx) =>
        ctx.webview.windowState("is_maximizable"),
      "plugin:window|set_closable": (args, ctx) => {
        ctx.webview.windowState(
          "set_closable",
          Boolean((args as { closable?: boolean }).closable),
        );
      },
      "plugin:window|is_closable": async (_args, ctx) =>
        ctx.webview.windowState("is_closable"),
      "plugin:window|is_decorated": async (_args, ctx) =>
        ctx.webview.windowState("is_decorated"),
      "plugin:window|is_focused": async (_args, ctx) =>
        ctx.webview.windowState("is_focused"),
      "plugin:window|set_skip_taskbar": (args, ctx) => {
        ctx.webview.windowState(
          "set_skip_taskbar",
          Boolean((args as { skipTaskbar?: boolean }).skipTaskbar),
        );
      },
      "plugin:window|set_always_on_bottom": (args, ctx) => {
        ctx.webview.windowState(
          "set_always_on_bottom",
          Boolean((args as { alwaysOnBottom?: boolean }).alwaysOnBottom),
        );
      },
      "plugin:window|set_content_protected": (args, ctx) => {
        ctx.webview.windowState(
          "set_content_protected",
          Boolean((args as { protected?: boolean }).protected),
        );
      },
      "plugin:window|request_user_attention": (args, ctx) => {
        /* Boiled down to Critical vs Informational (macOS NSRequestType);
         null/undefined cancels the request. */
        const t = (args as { attentionType?: string | number | null })
          .attentionType;
        ctx.webview.windowState(
          "request_user_attention",
          t === "Critical" || t === 1,
        );
      },
      "plugin:window|set_progress_bar": (args, ctx) => {
        const { progress } = args as { progress?: number | null };
        ctx.webview.setProgressBar(
          progress === null || progress === undefined ? null : Number(progress),
        );
      },
      "plugin:window|set_badge_count": (args, ctx) => {
        const { count } = args as { count?: number | null };
        ctx.webview.setBadgeCount(
          count === null || count === undefined ? null : Number(count),
        );
      },
      "plugin:window|set_badge_label": (args, ctx) => {
        /* `badgeLabel` — the payload `label` is the target-window router. */
        const { badgeLabel } = args as { badgeLabel?: string | null };
        ctx.webview.setBadgeLabel(badgeLabel ?? null);
      },
      "plugin:window|set_background_color": (args, ctx) => {
        ctx.webview.setBackgroundColor(
          String((args as { color?: string }).color ?? "transparent"),
        );
      },
      "plugin:window|set_titlebar_style": (args, ctx) => {
        const style = String(
          (args as { style?: string }).style ?? "visible",
        ) as "visible" | "transparent" | "overlay";
        ctx.webview.setTitleBarStyle(style);
      },
      "plugin:window|maximize": (_args, ctx) =>
        ctx.webview.windowState("maximize"),
      "plugin:window|unmaximize": (_args, ctx) =>
        ctx.webview.windowState("unmaximize"),
      "plugin:window|is_enabled": async (_args, ctx) =>
        ctx.webview.windowState("is_enabled"),
      "plugin:window|inner_size": async (_args, ctx) =>
        ctx.webview.getInnerSize(),
      "plugin:window|set_focusable": (args, ctx) => {
        ctx.webview.windowState(
          "set_focusable",
          Boolean((args as { focusable?: boolean }).focusable),
        );
      },
      "plugin:window|set_cursor_visible": (args, ctx) => {
        ctx.webview.windowState(
          "set_cursor_visible",
          Boolean((args as { visible?: boolean }).visible),
        );
      },
      "plugin:window|cursor_position": async (_args, ctx) =>
        ctx.webview.getCursorPosition(),
      "plugin:window|set_cursor_position": (args, ctx) => {
        const { x, y } = args as { x: number; y: number };
        ctx.webview.setCursorPosition(Number(x), Number(y));
      },
      "plugin:window|set_theme": (args, ctx) => {
        const theme = (args as { theme?: string | null }).theme;
        ctx.webview.setTheme(
          theme === "dark" || theme === "light" ? theme : null,
        );
      },
      "plugin:window|set_visible_on_all_workspaces": (args, ctx) => {
        ctx.webview.windowState(
          "set_visible_on_all_workspaces",
          Boolean((args as { visible?: boolean }).visible),
        );
      },
      "plugin:window|set_simple_fullscreen": (args, ctx) => {
        ctx.webview.windowState(
          "set_simple_fullscreen",
          Boolean((args as { fullscreen?: boolean }).fullscreen),
        );
      },
      "plugin:window|get_all_windows": (_args, ctx) =>
        ctx.app.listWindowLabels(),
      "plugin:window|available_monitors": (_args, ctx) =>
        ctx.webview.queryMonitors("all"),
      "plugin:window|primary_monitor": (_args, ctx) =>
        ctx.webview.queryMonitors("primary").then((ms) => ms?.[0] ?? null),
      "plugin:window|current_monitor": (_args, ctx) =>
        ctx.webview.queryMonitors("current").then((ms) => ms?.[0] ?? null),
      "plugin:window|monitor_from_point": (args, ctx) => {
        const { x, y } = args as { x: number; y: number };
        return ctx.webview
          .queryMonitors("point", Number(x), Number(y))
          .then((ms) => ms?.[0] ?? null);
      },
      "plugin:window|set_traffic_light_position": (args, ctx) => {
        const { x, y } = args as { x: number; y: number };
        ctx.webview.setTrafficLightPosition(Number(x), Number(y));
      },
      "plugin:window|start_dragging": (_args, ctx) =>
        ctx.webview.startDragging(),
      "plugin:app|name": (_args, ctx) =>
        ctx.app.config.appName ?? ctx.app.config.identifier,
      "plugin:app|version": (_args, ctx) => ctx.app.config.version ?? "0.1.0",
      "plugin:app|tauri_version": () => "2.0.0",
      "plugin:image|from_bytes": async (args) =>
        this.#adapter.image?.fromBytes(
          String((args as { base64?: string }).base64 ?? ""),
        ) ?? -1,
      "plugin:image|from_path": async (args) =>
        this.#adapter.image?.fromPath(
          String((args as { path?: string }).path ?? ""),
        ) ?? -1,
      "plugin:image|destroy": (args) => {
        this.#adapter.image?.destroy(Number((args as { id?: number }).id ?? -1));
      },
      "plugin:app|get_config": (_args, ctx) => {
        const { invokeKey, initScript, withGlobalTauri, ...rest } = ctx.app
          .config as AppConfig & Record<string, unknown>;
        void invokeKey;
        void initScript;
        void withGlobalTauri;
        return rest;
      },
      "plugin:process|exit": (args) => {
        this.#adapter.process?.exit(
          Number((args as { code?: number }).code ?? 0),
        );
      },
      "plugin:process|relaunch": () => {
        this.#adapter.process?.relaunch();
      },
      "plugin:notification|send": (args) => {
        const { title, body } = args as { title: string; body?: string };
        this.#adapter.notification?.send({ title, body: body ?? "" });
      },
      "plugin:notification|is_permission_granted": async () =>
        (await this.#adapter.notification?.isPermissionGranted()) ?? false,
      "plugin:notification|request_permission": async () =>
        (await this.#adapter.notification?.requestPermission()) ?? false,
      "plugin:global-shortcut|register": async (args) => {
        const { id, accelerator } = args as {
          id: string;
          accelerator: string;
        };
        return this.#adapter.globalShortcut?.register(id, accelerator) ?? false;
      },
      "plugin:global-shortcut|unregister": async (args) => {
        const { id } = args as { id: string };
        return this.#adapter.globalShortcut?.unregister(id) ?? false;
      },
      "plugin:global-shortcut|is_registered": async (args) => {
        const { id } = args as { id: string };
        return this.#adapter.globalShortcut?.isRegistered(id) ?? false;
      },
      "plugin:deep-link|get_last_url": () =>
        this.#adapter.deepLink?.getLastUrl() ?? null,
      "plugin:tray|create": (args) => {
        this.#adapter.tray?.apply("create", args as { title?: string });
      },
      "plugin:tray|set_title": (args) => {
        this.#adapter.tray?.apply("set_title", args as { title?: string });
      },
      "plugin:tray|set_tooltip": (args) => {
        this.#adapter.tray?.apply("set_tooltip", args as { tooltip?: string });
      },
      "plugin:tray|set_icon": (args) => {
        this.#adapter.tray?.apply("set_icon", args as { icon?: string });
      },
      "plugin:tray|destroy": () => {
        this.#adapter.tray?.apply("destroy");
      },
      "plugin:menu|create": (args) => {
        this.#adapter.menu?.createMenu((args as { menu: MenuConfig }).menu);
      },
      "plugin:menu|set_as_app_menu": (args) => {
        this.#adapter.menu?.setAsAppMenu((args as { menuId: string }).menuId);
      },
      "plugin:menu|set_item_enabled": (args) => {
        const { menuId, itemId, enabled } = args as {
          menuId: string;
          itemId: string;
          enabled: boolean;
        };
        this.#adapter.menu?.setItemEnabled(menuId, itemId, enabled);
      },
      "plugin:menu|set_item_title": (args) => {
        const { menuId, itemId, title } = args as {
          menuId: string;
          itemId: string;
          title: string;
        };
        this.#adapter.menu?.setItemTitle(menuId, itemId, title);
      },
      "plugin:menu|set_item_checked": (args) => {
        const { menuId, itemId, checked } = args as {
          menuId: string;
          itemId: string;
          checked: boolean;
        };
        this.#adapter.menu?.setItemChecked(menuId, itemId, checked);
      },
      "plugin:menu|set_item_accel": (args) => {
        const { menuId, itemId, accelerator } = args as {
          menuId: string;
          itemId: string;
          accelerator: string;
        };
        this.#adapter.menu?.setItemAccelerator(menuId, itemId, accelerator);
      },
      "plugin:menu|popup": (args) => {
        const { menuId, x, y } = args as {
          menuId: string;
          x?: number;
          y?: number;
        };
        this.#adapter.menu?.popup(menuId, x, y);
      },
      "plugin:menu|add_item": (args) => {
        const { menuId, item, at } = args as {
          menuId: string;
          item: import("./runtime.js").MenuItemConfig;
          at?: number;
        };
        this.#adapter.menu?.addItem(menuId, item, at);
      },
      "plugin:menu|remove_item": (args) => {
        const { menuId, itemId } = args as {
          menuId: string;
          itemId: string;
        };
        this.#adapter.menu?.removeItem(menuId, itemId);
      },
      "plugin:menu|item_info": (args) => {
        const { menuId, itemId } = args as {
          menuId: string;
          itemId: string;
        };
        return this.#adapter.menu?.getItemInfo(menuId, itemId) ?? null;
      },
      "plugin:tray|set_menu": (args) => {
        this.#adapter.tray?.apply("set_menu", {
          menuId: String((args as { menuId?: string }).menuId ?? ""),
        });
      },
      "plugin:tray|set_visible": (args, ctx) => {
        ctx.app; /* app-wide tray */
        this.#adapter.tray?.apply("set_visible", {
          visible: Boolean((args as { visible?: boolean }).visible),
        });
      },
      "plugin:tray|set_icon_as_template": (args) => {
        this.#adapter.tray?.apply("set_icon_template", {
          asTemplate: Boolean((args as { asTemplate?: boolean }).asTemplate),
        });
      },
      "plugin:menu|destroy": (args) => {
        this.#adapter.menu?.destroyMenu((args as { menuId: string }).menuId);
      },
      "plugin:dialog|open": async (args) =>
        this.#adapter.dialog?.open((args as OpenDialogOptions) ?? {}) ?? null,
      "plugin:dialog|save": async (args) =>
        this.#adapter.dialog?.save((args as SaveDialogOptions) ?? {}) ?? null,
      "plugin:dialog|message": async (args) =>
        this.#adapter.dialog?.message(args as MessageDialogOptions) ?? 0,
      "plugin:clipboard|read_text": async () =>
        this.#adapter.clipboard?.readText() ?? null,
      "plugin:clipboard|write_text": (args) => {
        this.#adapter.clipboard?.writeText(
          (args as { text?: string }).text ?? "",
        );
      },
      "plugin:clipboard|read_image": async () => {
        const r = await this.#adapter.clipboard?.readImage();
        // Raw IPC response (InvokeResponseBody::Raw): frontend invoke
        // resolves with the PNG bytes as Uint8Array.
        return r ? new RawResponse(r.base64) : null;
      },
      "plugin:clipboard|write_image": async (args) => {
        const { base64, rid } = args as { base64?: string; rid?: number };
        const image: { base64?: string; rid?: number } = {};
        if (typeof base64 === "string") image.base64 = base64;
        if (typeof rid === "number") image.rid = rid;
        await this.#adapter.clipboard?.writeImage(image);
      },
      "plugin:clipboard|clear": async () => {
        await this.#adapter.clipboard?.clear();
      },
    };

    for (const [name, handler] of Object.entries(commands)) {
      this.commands.register(name, handler);
      this.#hub.register(name, handler);
    }
  }

  /** Registers a plugin's commands under `plugin:<name>|<cmd>`. */
  registerPluginCommands(plugin: Plugin): void {
    for (const [cmd, handler] of Object.entries(plugin.commands ?? {})) {
      this.commands.register(`plugin:${plugin.name}|${cmd}`, handler);
    }
  }

  private pluginCommandEntries(): [string, InvokeHandler][] {
    const entries: [string, InvokeHandler][] = [];
    for (const plugin of this.plugins.list()) {
      for (const [cmd, handler] of Object.entries(plugin.commands ?? {})) {
        entries.push([
          `plugin:${plugin.name}|${cmd}`,
          handler as (args: unknown, ctx: CommandContext) => unknown,
        ]);
      }
    }
    return entries;
  }

  getWebview(label: string): WebviewHandle | undefined {
    return this.#windows.get(label)?.handle;
  }

  /** All live window labels (for `plugin:window|get_all_windows`). */
  listWindowLabels(): string[] {
    return [...this.#windows.keys()];
  }

  webviewEvents(label: string): EventTarget | undefined {
    return this.#windows.get(label)?.events;
  }

  /**
   * Emits an event to all frontend listeners. The backend can call this to
   * push data to the page (mirrors Tauri's `app.emit`).
   */
  emit(event: string, payload?: unknown): void {
    this.#eventManager.emit(event, payload);
  }

  /** Emits an event to listeners matching a target (Tauri `app.emitTo`). */
  emitTo(target: EventTargetRef, event: string, payload?: unknown): void {
    this.#eventManager.emit(event, payload, target);
  }

  /** Boots the configured windows and blocks on the main loop. */
  async run(): Promise<void> {
    await this.#setup?.(this);
    for (const plugin of this.plugins.list()) {
      await plugin.setup?.(this);
    }

    for (const cfg of this.config.windows) {
      const handle = this.createWindow(cfg);
      this.#applyStartupWindowState(cfg, handle);
    }
    await Promise.all(
      [...this.#windows.values()].map(({ handle }) => handle.run()),
    );
  }

  /** Creates a window but does not run the main loop (test/dev use). */
  createWindow(cfg: WindowConfig): WebviewHandle {
    const handle = this.#adapter.createWindow(cfg);
    this.#windows.set(cfg.label, { handle, events: new EventTarget() });

    // Bind the IPC entry FIRST so `window.__TAURI_IPC__` exists in the page.
    // The `__TAURI_INTERNALS__` bootstrap is embedded into the page itself
    // (webview/webview's `webview_init` is a post-handler setter, not a place
    // to inject arbitrary init code — see DESIGN.md §M0 findings).
    handle.onMessage((id, req) => {
      void this.#hub.handle(handle, id, req, this.#invokeKey, (wv, args) => ({
        app: this,
        webview: wv,
        label: cfg.label,
        args,
        getChannel: (channelId) => new ChannelHandle(channelId, wv),
      }));
    });
    handle.onWindowEvent((event, payload) => {
      const name = windowEventToTauri(event);
      if (name) this.emit(name, payload);
      /* Destroyed/closed runtime windows leave the registry so
         get_all_windows only reports live windows (host already clears
         its webview registry on windowWillClose). */
      if (event === "close" && cfg.label !== "main") {
        this.#windows.delete(cfg.label);
      }
    });

    const bootstrap =
      this.config.initScript ??
      buildInitScript({
        invokeKey: this.#invokeKey,
        metadata: { identifier: this.config.identifier },
      });

    if (cfg.html !== undefined) {
      handle.loadHtml(`<script>${bootstrap}</script>` + cfg.html);
    } else {
      handle.loadUrl(cfg.url ?? "about:blank");
    }
    return handle;
  }

  /** Applies a WindowConfig's startup booleans/styles to a fresh handle. */
  #applyStartupWindowState(cfg: WindowConfig, handle: WebviewHandle): void {
    const flag = (v: boolean | undefined, op: import("./runtime.js").WindowStateOp) => {
      if (v !== undefined) handle.windowState(op, v);
    };
    flag(cfg.resizable, "set_resizable");
    flag(cfg.maximizable, "set_maximizable");
    flag(cfg.minimizable, "set_minimizable");
    flag(cfg.closable, "set_closable");
    if (cfg.maximized === true) handle.windowState("maximize");
    flag(cfg.fullscreen, "set_fullscreen");
    flag(cfg.visible, "set_visible");
    flag(cfg.decorations, "set_decorations");
    flag(cfg.alwaysOnTop, "set_always_on_top");
    flag(cfg.alwaysOnBottom, "set_always_on_bottom");
    flag(cfg.transparent, "set_transparent");
    flag(cfg.skipTaskbar, "set_skip_taskbar");
    flag(cfg.contentProtected, "set_content_protected");
    if (cfg.center) handle.windowState("center");
    if (cfg.minWidth && cfg.minHeight)
      handle.setMinSize(cfg.minWidth, cfg.minHeight);
    if (cfg.maxWidth && cfg.maxHeight)
      handle.setMaxSize(cfg.maxWidth, cfg.maxHeight);
    if (cfg.titleBarStyle) handle.setTitleBarStyle(cfg.titleBarStyle);
    if (cfg.theme) handle.setTheme(cfg.theme);
    if (cfg.x !== undefined && cfg.y !== undefined)
      handle.setPosition(cfg.x, cfg.y);
  }

  /** Convenience: register a single command. */
  command(
    cmd: string,
    handler: (
      args: unknown,
      ctx: import("./commands/index.js").CommandContext,
    ) => unknown,
  ): this {
    this.commands.register(cmd, handler);
    this.#hub.register(cmd, handler);
    return this;
  }

  /** Registers a typed CommandDef (from `defineCommand`) into hub + registry. */
  commandDef<Name extends string, Args, Result>(
    def: import("./commands/index.js").CommandDef<Name, Args, Result>,
  ): this {
    this.commands.registerDef(def);
    this.#hub.register(def.name, def.handler as InvokeHandler);
    return this;
  }
}

/** Maps native window events to Tauri's `tauri://*` event names. */
function windowEventToTauri(
  event: import("./runtime.js").WindowEvent,
): string | null {
  switch (event) {
    case "resize":
      return "tauri://resize";
    case "move":
      return "tauri://move";
    case "focus":
      return "tauri://focus";
    case "blur":
      return "tauri://blur";
    case "close":
      return "tauri://close-requested";
    case "scale-change":
      return "tauri://scale-change";
    case "theme-change":
      return "tauri://theme-changed";
    case "drag-enter":
      return "tauri://drag-enter";
    case "drag-over":
      return "tauri://drag-over";
    case "drag-drop":
      return "tauri://drag-drop";
    case "drag-leave":
      return "tauri://drag-leave";
  }
  return null;
}

/** Fluent builder mirroring `tauri::Builder`. */
export class AppBuilder {
  #config: AppConfig;
  #options: AppOptions;

  constructor(adapter: RuntimeAdapter, identifier: string) {
    this.#config = {
      identifier,
      invokeKey: Math.random().toString(36).slice(2),
      windows: [],
    };
    this.#options = { adapter };
  }

  configure(partial: Partial<AppConfig>): this {
    this.#config = { ...this.#config, ...partial };
    return this;
  }

  plugin(plugin: Plugin): this {
    if (this.#options.plugins === undefined) {
      this.#options.plugins = [];
    }
    this.#options.plugins.push(plugin);
    return this;
  }

  setup(fn: (app: App) => void | Promise<void>): this {
    this.#options.setup = fn;
    return this;
  }

  window(cfg: WindowConfig): this {
    this.#config.windows.push(cfg);
    return this;
  }

  /**
   * Applies a `ztron.conf.json` payload: identifier/appName/version/windows.
   * Windows declared here are created at startup with their startup states
   * (validated; throws on schema violations). `url` may reference the
   * frontend root via `"frontend://<path>"` (the CLI resolves it to the dev
   * server / built index) or any absolute URL.
   */
  fromConfig(conf: ProjectConfigFile, opts?: { frontendUrl?: string }): this {
    validateProjectConfig(conf);
    if (conf.identifier) this.#config.identifier = conf.identifier;
    if (conf.appName) this.#config.appName = conf.appName;
    if (conf.version) this.#config.version = conf.version;
    for (const w of conf.windows ?? []) {
      const { url, ...rest } = w;
      /* "frontend" resolves to the dev server / built index (dev flow),
         any other string loads as an absolute URL, absent falls back to
         the app's existing devUrl/inline-html handling. */
      const resolvedUrl =
        url === "frontend"
          ? opts?.frontendUrl
          : typeof url === "string"
            ? url
            : undefined;
      this.window({
        ...rest,
        ...(resolvedUrl ? { url: resolvedUrl } : {}),
        label: w.label ?? "main",
        title: w.title ?? w.label ?? "main",
        width: w.width ?? 800,
        height: w.height ?? 600,
      });
    }
    return this;
  }

  build(): App {
    return new App(this.#config, this.#options);
  }
}

/** The `ztron.conf.json` shape (CLI-validated, consumed via fromConfig). */
export interface ProjectConfigFile {
  entry?: string;
  frontend?: string;
  identifier?: string;
  appName?: string;
  version?: string;
  csp?: string;
  windows?: Array<Partial<WindowConfig> & { label?: string }>;
  [key: string]: unknown;
}

/** Throws on invalid ztron.conf.json content (schema check). */
export function validateProjectConfig(conf: ProjectConfigFile): void {
  if (conf.windows !== undefined) {
    if (!Array.isArray(conf.windows)) {
      throw new Error("ztron.conf.json: windows must be an array");
    }
    const seen = new Set<string>();
    for (const [i, w] of conf.windows.entries()) {
      if (typeof w !== "object" || w === null) {
        throw new Error(`ztron.conf.json: windows[${i}] must be an object`);
      }
      const label = (w as { label?: string }).label ?? "main";
      if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
        throw new Error(
          `ztron.conf.json: windows[${i}].label "${label}" must be alphanumeric/-/_`,
        );
      }
      if (seen.has(label)) {
        throw new Error(
          `ztron.conf.json: duplicate window label "${label}"`,
        );
      }
      seen.add(label);
      for (const k of ["width", "height", "x", "y"] as const) {
        const v = (w as Record<string, unknown>)[k];
        if (v !== undefined && (typeof v !== "number" || v < 0)) {
          throw new Error(
            `ztron.conf.json: windows[${i}].${k} must be a non-negative number`,
          );
        }
      }
    }
  }
}
