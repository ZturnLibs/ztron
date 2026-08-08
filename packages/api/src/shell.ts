/** Shell API — scoped command execution, mirrors `plugin:shell|*`. */
import { invoke } from "./core.js";
import { listen } from "./event.js";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function execute(
  program: string,
  args: string[] = [],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  return invoke<ExecResult>("plugin:shell|execute", {
    program,
    args,
    ...options,
  });
}

/**
 * Executes a command and streams stdout chunks to `onChunk` as they arrive
 * (long-running commands). Resolves with the exit code.
 */
export async function executeStream(
  program: string,
  args: string[] = [],
  options: { cwd?: string; env?: Record<string, string> } & {
    onChunk?: (chunk: string) => void;
    onError?: (chunk: string) => void;
  } = {},
): Promise<{ code: number }> {
  const unsubOut = await listen<{ chunk: string }>(
    "tauri://shell-output",
    (e) => options.onChunk?.(e.payload.chunk),
  );
  const unsubErr = await listen<{ chunk: string }>("tauri://shell-error", (e) =>
    options.onError?.(e.payload.chunk),
  );
  try {
    return await invoke<{ code: number }>("plugin:shell|execute_stream", {
      program,
      args,
      ...options,
    });
  } finally {
    await unsubOut();
    await unsubErr();
  }
}

/** Opens an http(s) URL in the default browser (fire-and-forget). */
export function open(url: string): Promise<{ opened: boolean }> {
  return invoke<{ opened: boolean }>("plugin:shell|open", { url });
}

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string>;
}

type CommandEvent = "stdout" | "stderr" | "status";

/**
 * A command builder mirroring Tauri's `Command` class. Streams stdout/stderr
 * via the `tauri://shell-output` / `tauri://shell-error` events.
 */
export class Command {
  readonly program: string;
  readonly args: string[];
  readonly options: CommandOptions;
  #listeners = new Map<CommandEvent, Array<(data: unknown) => void>>();

  constructor(
    program: string,
    args: string[] = [],
    options: CommandOptions = {},
  ) {
    this.program = program;
    this.args = args;
    this.options = options;
  }

  /** Registers an event listener; returns this for chaining. */
  on(event: CommandEvent, handler: (data: unknown) => void): this {
    const list = this.#listeners.get(event) ?? [];
    list.push(handler);
    this.#listeners.set(event, list);
    return this;
  }

  #emit(event: CommandEvent, data: unknown): void {
    for (const h of this.#listeners.get(event) ?? []) h(data);
  }

  /** Spawns the command, streaming output events; resolves on exit. */
  async spawn(): Promise<void> {
    const unsubOut = await listen<{ chunk: string }>(
      "tauri://shell-output",
      (e) => this.#emit("stdout", e.payload.chunk),
    );
    const unsubErr = await listen<{ chunk: string }>(
      "tauri://shell-error",
      (e) => this.#emit("stderr", e.payload.chunk),
    );
    try {
      const { code } = await invoke<{ code: number }>(
        "plugin:shell|execute_stream",
        { program: this.program, args: this.args, ...this.options },
      );
      this.#emit("status", code);
    } finally {
      await unsubOut();
      await unsubErr();
    }
  }

  /** Runs the command, collecting full output, and resolves with it. */
  async execute(): Promise<ExecResult> {
    let stdout = "";
    let stderr = "";
    let code = 0;
    const unsubOut = await listen<{ chunk: string }>(
      "tauri://shell-output",
      (e) => {
        stdout += e.payload.chunk;
        this.#emit("stdout", e.payload.chunk);
      },
    );
    const unsubErr = await listen<{ chunk: string }>(
      "tauri://shell-error",
      (e) => {
        stderr += e.payload.chunk;
        this.#emit("stderr", e.payload.chunk);
      },
    );
    try {
      const r = await invoke<{ code: number }>("plugin:shell|execute_stream", {
        program: this.program,
        args: this.args,
        ...this.options,
      });
      code = r.code;
    } finally {
      await unsubOut();
      await unsubErr();
    }
    this.#emit("status", code);
    return { code, stdout, stderr };
  }

  /** Runs the command and resolves with its exit code. */
  async status(): Promise<number> {
    return (await this.execute()).code;
  }

  /** Not supported (Ztron has no sidecar bundling). */
  static sidecar(): never {
    throw new Error("sidecar commands are not supported by Ztron");
  }
}

export const shell = { execute, executeStream, open, Command };
