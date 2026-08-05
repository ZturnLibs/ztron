/**
 * App builder & runtime bootstrap — translated from Tauri's
 * `crates/tauri/src/app.rs` (Builder + App).
 */
import { CommandRegistry, type CommandHandlers } from "./commands/index.js";
import type { CommandContext } from "./commands/index.js";
import { EventTarget } from "./events.js";
import { IpcHub, type InvokeHandler } from "./ipc/mod.js";
import { PluginManager, type Plugin } from "./plugin.js";
import type { RuntimeAdapter, WebviewHandle, WindowConfig } from "./runtime.js";
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
        args,
        getChannel: (channelId) => undefined,
      }));
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
