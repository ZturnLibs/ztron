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

export const shell = { execute, executeStream, open };
