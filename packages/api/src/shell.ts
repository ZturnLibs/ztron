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
): Promise<ExecResult> {
  return invoke<ExecResult>("plugin:shell|execute", { program, args });
}

export const shell = { execute };
