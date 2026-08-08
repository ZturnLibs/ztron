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

export const shell = { execute };
