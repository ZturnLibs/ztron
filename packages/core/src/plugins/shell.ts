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
  /* Live command instances (cid -> tjs Process); reaped on process exit. */
  type TjsProcess = ReturnType<typeof tjs.spawn>;
  const procs = new Map<string, TjsProcess>();
  let nextCid = 1;

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
      async open(args) {
        const { url } = args as { url: string };
        if (!/^https?:\/\//i.test(url)) {
          throw new Error(`shell open: only http(s) URLs allowed: ${url}`);
        }
        const platform = (
          (globalThis as { navigator?: { platform?: string } }).navigator
            ?.platform ?? ""
        ).toLowerCase();
        const opener = platform.includes("win")
          ? ["cmd", "/c", "start", "", url]
          : platform.includes("linux")
            ? ["xdg-open", url]
            : ["open", url];
        const proc = tjs.spawn(opener, { stdout: "ignore", stderr: "ignore" });
        void proc;
        return { opened: true };
      },
      async execute_stream(args, ctx) {
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
          stdin: "pipe",
          ...(cwd ? { cwd } : {}),
          ...(env ? { env } : {}),
        });
        const dec = new TextDecoder();
        // Stream stdout/stderr chunks as tauri://shell-output / shell-error.
        const pump = async (
          stream: ReadableStream<Uint8Array> | null,
          event: string,
        ) => {
          if (!stream) return;
          const reader = stream.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            ctx.app.emit(event, { chunk: dec.decode(value, { stream: true }) });
          }
        };
        const [, , status] = await Promise.all([
          pump(proc.stdout, "tauri://shell-output"),
          pump(proc.stderr, "tauri://shell-error"),
          proc.wait(),
        ]);
        return { code: status.exitStatus ?? 0 };
      },
      /* Long-lived command instances: spawn returns a cid; write/kill target
         it. The registry lives in the plugin closure (auto-reaped on exit). */
      async spawn_stream(args, ctx) {
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
          stdin: "pipe",
          ...(cwd ? { cwd } : {}),
          ...(env ? { env } : {}),
        });
        const cid = `cmd-${nextCid++}`;
        procs.set(cid, proc);
        const dec = new TextDecoder();
        const pump = async (
          stream: ReadableStream<Uint8Array> | null,
          event: string,
        ) => {
          if (!stream) return;
          const reader = stream.getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            ctx.app.emit(event, { chunk: dec.decode(value, { stream: true }) });
          }
        };
        void pump(proc.stdout, "tauri://shell-output");
        void pump(proc.stderr, "tauri://shell-error");
        void proc.wait().then((status) => {
          procs.delete(cid);
          ctx.app.emit("tauri://shell-terminated", {
            cid,
            code: status.exitStatus ?? 0,
          });
        });
        return { cid };
      },
      async write_stdin(args) {
        const { cid, data } = args as { cid: string; data: string };
        const proc = procs.get(cid);
        if (!proc?.stdin) throw new Error(`no such command: ${cid}`);
        const w = proc.stdin.getWriter();
        await w.write(new TextEncoder().encode(data));
        w.releaseLock();
        return { written: true };
      },
      async kill(args) {
        const { cid, signal } = args as { cid: string; signal?: number };
        const proc = procs.get(cid);
        if (!proc) throw new Error(`no such command: ${cid}`);
        proc.kill(signal ?? 15 /* SIGTERM */);
        return { killed: true };
      },
    },
    permissions: [
      {
        identifier: "shell:allow-execute",
        commands: ["plugin:shell|execute"],
      },
      {
        identifier: "shell:allow-open",
        commands: ["plugin:shell|open"],
      },
      {
        identifier: "shell:allow-execute-stream",
        commands: ["plugin:shell|execute_stream"],
      },
      {
        identifier: "shell:allow-spawn-stream",
        commands: [
          "plugin:shell|spawn_stream",
          "plugin:shell|write_stdin",
          "plugin:shell|kill",
        ],
      },
      {
        identifier: "shell:deny-execute",
        commands: ["!plugin:shell|execute"],
      },
    ],
    permissionSets: [
      {
        name: "shell:default",
        description: "Allows scoped shell execution + opening http(s) URLs.",
        permissions: [
          "shell:allow-execute",
          "shell:allow-open",
          "shell:allow-execute-stream",
          "shell:allow-spawn-stream",
        ],
      },
    ],
  };
}
