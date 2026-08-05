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
      "plugin:tray|create": (args) => {
        this.#adapter.tray?.apply("create", args as { title?: string });
      },
      "plugin:tray|set_title": (args) => {
        this.#adapter.tray?.apply("set_title", args as { title?: string });
      },
      "plugin:tray|set_tooltip": (args) => {
        this.#adapter.tray?.apply("set_tooltip", args as { tooltip?: string });
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
