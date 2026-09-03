---
title: Structured Logging (log)
---

# Overview

The `log` module provides **structured logging**: the five levels
trace/debug/info/warn/error, dispatched by the backend `logPlugin`
(translated from `tauri-plugin-log`, P21 v2) to multiple targets:
`stdout` / `stderr` / `file` (with rotation) / `webview`. The frontend
can emit logs directly (`logger.*`), subscribe to backend-pushed
records with `attachConsole` (the webview target), or attach a
pure-frontend sink with `attachLogger` (receives only the `log*` calls
made by this page).

```ts
import { logger, attachConsole, attachLogger } from "@zturnlibs/ztron-api/log";
import type { LogLevel, LogSink } from "@zturnlibs/ztron-api/log";
```

# Permissions & Scope

The plugin is constructed with `logPlugin(options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `level` | `"info"` | minimum level to emit (trace < debug < info < warn < error) |
| `targets` | `["stdout"]` | where records go; `file` appends to `<logDir>/<fileName>`, `webview` pushes every record to `addPluginListener('log','log',…)` subscribers |
| `logDir` | platform log dir | macOS: `~/Library/Logs/<identifier>`, matching `plugin:path|app_log_dir` |
| `fileName` | `<identifier>.log` | Tauri LogDir semantics |
| `rotationStrategy` | `"keepAll"` | `keepAll` timestamped backups / `keepOne` single `.old` |
| `maxFileSize` | `100_000` | rotation threshold in bytes; rotate before appending once reached |

There is a single permission `log:default` covering all 8 commands —
what the hello example declares. Note that the pipe-carrying command
names (`plugin:log|__listener`) ride the `addPluginListener` contract
rather than named events — named event names reject `|`.

# Example

Backend registration: three targets + keepOne rotation + a 400-byte
cap (so the spike's 12 pressure lines force several rotations). From
`examples/hello/src/main.ts` (comments kept, excerpt elided):

```ts
.plugin(
  logPlugin({
    level: "trace",
    targets: ["stdout", "file", "webview"],
    rotationStrategy: "keepOne",
    // Small cap so the spike's 12 pressure lines force several rotations.
    maxFileSize: 400,
  }),
)
```

Frontend direct logging + `attachConsole` on the webview target. From
`examples/hello/frontend/src/main.ts` (the anchors `LOG_OK` and
`LOG_WEBVIEW_OK` are its real run outputs; comments kept, excerpt
elided):

```ts
// 5e. log plugin
await logger.info("spike: log plugin test from frontend");
report("LOG_OK");

// 13. log plugin v2: webview target round trip via attachConsole, ...
let logEcho: string | null = null;
const unlistenLog = await attachConsole({
  logger: (m) => {
    if (m.includes("spike-log-webview")) logEcho = m;
  },
});
await invoke("plugin:log|info", { message: "spike-log-webview" });
```

Rotation verification: the log files sit outside the fs scope (the
log plugin itself owns that directory), so hello reads the sizes of
the current file and the `.old` backup through the trusted backend
command `m3:log-rotation`; `LOG_ROTATE_OK:420->242` is its real run
output (keepOne leaves at most `.log` + `.log.old`; hello also clears
the previous run's stale log files at startup to keep the rotation
asserts deterministic).

# Commands

`plugin:log|*` totals **8 commands**:

| Command | API |
| --- | --- |
| `log` | `log(level, message)` (`logger.log`) |
| `trace` / `debug` / `info` / `warn` / `error` | same-named convenience functions (`logger.trace` … `logger.error`) |
| `__listener` | internal: the `addPluginListener` registration (`attachConsole` depends on it) |
| `__unlistener` | internal: unregisters the above |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/log).

Applicable version: `ztron 0.3.0`
