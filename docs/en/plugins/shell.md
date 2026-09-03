---
title: Shell (shell)
---

# Overview

The `shell` module provides **scope-checked command execution**:
`execute` (runs to completion, full output), `executeStream` (stdout
chunks delivered as they arrive), `open` (opens an http(s) URL in the
default browser), and a command builder aligned with Tauri's `Command`
class — chainable `on("stdout"/"stderr"/"status"/"terminated")` listeners,
`spawn()`, and `spawnInteractive()` (long-lived process: resolves with a
cid that drives `write()` for stdin and `kill()` for termination). Output
flows through the `ztron://shell-output` / `ztron://shell-error` /
`ztron://shell-terminated` events. Everything is backed by the
`plugin:shell|*` commands (aligned with `tauri-plugin-shell`;
`Command.sidecar()` throws — Ztron has no sidecar bundling).

```ts
import { shell, Command } from "@zturnlibs/ztron-api/shell";
// or from the main entry: import { shell, Command } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permissions: `shell:allow-execute`, `shell:allow-execute-stream`,
`shell:allow-spawn-stream`, `shell:allow-open` (plus
`shell:deny-execute`), collected in the **`shell:default`** set. The hello
app grants just `shell:default`.

The scope comes from plugin construction: `shellPlugin({ scope })` takes
a `ShellScopeEntry[]` — each entry `{ program, args? }` where `program`
matches a binary name or absolute path (basename-compatible) and `args`
holds glob patterns (`*` matches one argument, `**` consumes any number).
**No scope configured means everything is denied**. From
`examples/hello/src/main.ts`:

```ts
.plugin(
  shellPlugin({
    scope: [
      { program: "echo", args: ["*"] },
      { program: "pwd" },
      { program: "cat" },
      { program: "sh", args: ["**"] },
    ],
  }),
)
```

# Example

From `examples/hello/frontend/src/main.ts` (the anchors `SHELL_CWD_OK`,
`SHELL_OPEN_OK`, `SHELL_STREAM_OK`, `SHELL_CMD_CLASS_OK`,
`SHELL_INTERACTIVE_OK:echo-me-back` are its real run outputs; comments
kept, excerpts elided):

```ts
// 5f2. shell cwd/env
const pwd = await shell.execute("pwd", [], { cwd: shellTmpDir });

// 5f3. shell.open validates http(s) (rejects file:// without opening)
try { await shell.open("file:///etc/hosts"); } catch { openRejected = true; }

// 5f4. shell executeStream (progressive stdout chunks)
const code = await shell.executeStream(
  "sh", ["-c", "echo one; sleep 1; echo two; sleep 1; echo three"],
  { onChunk: (c) => chunks.push(c) },
);

// 5f5. shell Command class
const cmdResult = await new shell.Command("sh", ["-c", "echo cmd-class"]).execute();

// 5f6. shell interactive: spawn cat, write stdin, stream stdout, kill
const interactive = new shell.Command("cat", []);
interactive.on("stdout", (chunk) => lines.push(String(chunk)));
const cid = await interactive.spawnInteractive();
await interactive.write(cid, "echo-me-back\n");
// ... await interactive.kill(cid, 9);
```

# Commands

`plugin:shell|*` totals **6 commands**, mapped to the API:

| Command | API |
| --- | --- |
| `execute` | `execute()` (full `ExecResult` in one shot) |
| `execute_stream` | `executeStream()` / `Command.execute()` / `Command.spawn()` |
| `spawn_stream` | `Command.spawnInteractive()` (cid registry; listeners armed before spawn) |
| `write_stdin` | `Command.write(cid, data)` |
| `kill` | `Command.kill(cid, signal = 15)` |
| `open` | `open(url)` (http(s) only) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/shell).

Applicable version: `ztron 0.3.0`
