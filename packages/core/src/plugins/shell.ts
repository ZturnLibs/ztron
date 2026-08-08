/**
 * `plugin:shell|*` — scoped command execution.
 * Translated from Tauri's `tauri-plugin-shell` (simplified: Execute + sidecar
 * scopes; no PTY / open-url yet).
 */
import type { Plugin } from "../plugin.js";

export interface ShellScopeEntry {
  /** Binary name or absolute path (e.g. `node`, `/usr/bin/git`). */
  program: string;
  /** Allowed arguments (glob patterns; `**` = any). */
  args?: string[];
}

export interface ShellPluginOptions {
  /** Allowed programs + arg patterns. */
  scope?: ShellScopeEntry[];
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

function matchArgs(patterns: string[] | undefined, args: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  if (patterns.length !== args.length) {
    // allow ** to consume multiple
    if (!patterns.includes("**")) return false;
  }
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    if (p === "**") return true;
    const a = args[i] ?? "";
    if (p === "*" || p === a) continue;
    return false;
  }
  return args.length === patterns.length;
}

function matchScope(
  scope: ShellScopeEntry[] | undefined,
  program: string,
  args: string[],
): boolean {
  if (!scope) return false;
  for (const entry of scope) {
    const basename = program.split("/").pop() ?? program;
    if (entry.program === program || entry.program === basename) {
      return matchArgs(entry.args, args);
    }
  }
  return false;
}

export function shellPlugin(options: ShellPluginOptions = {}): Plugin {
  return {
    name: "shell",
    commands: {
      async execute(args) {
        const {
          program,
          args: cmdArgs,
          cwd,
          env,
        } = args as {
          program: string;
          args?: string[];
          cwd?: string;
          env?: Record<string, string>;
        };
        const allArgs = cmdArgs ?? [];
        if (!matchScope(options.scope, program, allArgs)) {
          throw new Error(`shell scope denied: ${program}`);
        }
        const proc = tjs.spawn([program, ...allArgs], {
          stdout: "pipe",
          stderr: "pipe",
          ...(cwd ? { cwd } : {}),
          ...(env ? { env } : {}),
        });
        const dec = new TextDecoder();
        const readStream = async (
          stream: ReadableStream<Uint8Array> | null,
        ) => {
          if (!stream) return "";
          const reader = stream.getReader();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
          }
          return buf;
        };
        const [stdout, stderr, status] = await Promise.all([
          readStream(proc.stdout),
          readStream(proc.stderr),
          proc.wait(),
        ]);
        return {
          code: status.exitStatus ?? 0,
          stdout,
          stderr,
        } satisfies ExecResult;
      },
    },
    permissions: [
      {
        identifier: "shell:allow-execute",
        commands: ["plugin:shell|execute"],
      },
      {
        identifier: "shell:deny-execute",
        commands: ["!plugin:shell|execute"],
      },
    ],
    permissionSets: [
      {
        name: "shell:default",
        description:
          "Allows scoped shell execution (subject to program+args scope).",
        permissions: ["shell:allow-execute"],
      },
    ],
  };
}
