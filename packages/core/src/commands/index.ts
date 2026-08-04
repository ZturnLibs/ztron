/**
 * Command system — replaces Tauri's `#[tauri::command]` macros with a plain
 * TypeScript registry. A future codegen step will scan command modules and
 * generate the registry + frontend type bindings.
 */
import type { App } from "../app.js";
import type { ChannelHandle } from "../ipc/channel.js";
import type { WebviewHandle } from "../runtime.js";

/** Runtime context handed to every command handler. */
export interface CommandContext {
  app: App;
  webview: WebviewHandle;
  /** The resolved command payload (Channel markers replaced). */
  args: unknown;
  /** Resolves a `__CHANNEL__:<id>` marker to a streaming handle. */
  getChannel(id: number): ChannelHandle | undefined;
}

/** A command handler: args + context → serializable result. */
export type CommandHandler = (
  args: unknown,
  ctx: CommandContext,
) => unknown | Promise<unknown>;

/** A group of commands registered together (used by plugins). */
export type CommandHandlers = Record<string, CommandHandler>;

export class CommandRegistry {
  #handlers = new Map<string, CommandHandler>();

  register(cmd: string, handler: CommandHandler): void {
    if (this.#handlers.has(cmd)) {
      throw new Error(`command "${cmd}" is already registered`);
    }
    this.#handlers.set(cmd, handler);
  }

  registerAll(handlers: CommandHandlers): void {
    for (const [cmd, handler] of Object.entries(handlers)) {
      this.register(cmd, handler);
    }
  }

  get(cmd: string): CommandHandler | undefined {
    return this.#handlers.get(cmd);
  }

  has(cmd: string): boolean {
    return this.#handlers.has(cmd);
  }

  list(): string[] {
    return [...this.#handlers.keys()];
  }
}
