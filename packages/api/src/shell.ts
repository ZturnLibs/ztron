/** Shell API — scoped command execution, mirrors `plugin:shell|*`. */
import { invoke } from "./core.js";

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

/** Opens an http(s) URL in the default browser (fire-and-forget). */
export function open(url: string): Promise<{ opened: boolean }> {
  return invoke<{ opened: boolean }>("plugin:shell|open", { url });
}

export const shell = { execute, open };
