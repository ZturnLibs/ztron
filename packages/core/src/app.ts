/**
 * App builder & runtime bootstrap — translated from Tauri's
 * `crates/tauri/src/app.rs` (Builder + App).
 */
import { CommandRegistry, type CommandHandlers } from "./commands/index.js";
import type { CommandContext } from "./commands/index.js";
import { EventTarget } from "./events.js";
import { ChannelHandle } from "./ipc/channel.js";
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
      "plugin:window|close",
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
      "plugin:window|set_position",
      "plugin:window|start_dragging",
      "plugin:app|name",
      "plugin:app|version",
      "plugin:app|tauri_version",
      "plugin:app|get_config",
      "plugin:process|exit",
      "plugin:process|relaunch",
      "plugin:notification|send",
      "plugin:global-shortcut|register",
      "plugin:global-shortcut|unregister",
      "plugin:deep-link|get_last_url",
      "plugin:tray|create",
      "plugin:tray|set_title",
      "plugin:tray|set_tooltip",
      "plugin:tray|set_icon",
      "plugin:tray|destroy",
      "plugin:menu|create",
      "plugin:menu|set_as_app_menu",
      "plugin:menu|set_item_enabled",
      "plugin:menu|set_item_title",
      "plugin:menu|destroy",
      "plugin:dialog|open",
      "plugin:dialog|save",
      "plugin:dialog|message",
      "plugin:clipboard|read_text",
      "plugin:clipboard|write_text",
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
      "plugin:window|close": (_args, ctx) => {
        ctx.webview.terminate();
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
      "plugin:window|set_position": (args, ctx) => {
        const { x, y } = args as { x: number; y: number };
        ctx.webview.setPosition(Number(x), Number(y));
      },
      "plugin:window|start_dragging": (_args, ctx) =>
        ctx.webview.startDragging(),
      "plugin:app|name": (_args, ctx) =>
        ctx.app.config.appName ?? ctx.app.config.identifier,
      "plugin:app|version": (_args, ctx) => ctx.app.config.version ?? "0.1.0",
      "plugin:app|tauri_version": () => "2.0.0",
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
      this.createWindow(cfg);
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
    handle.onWindowEvent((event) => {
      this.emit(windowEventToTauri(event));
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
function windowEventToTauri(event: import("./runtime.js").WindowEvent): string {
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
  }
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

  build(): App {
    return new App(this.#config, this.#options);
  }
}
