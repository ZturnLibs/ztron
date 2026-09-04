---
title: Debugging & Logging
---

This page collects the debugging entry points: the DevTools toggle,
structured logging, the `ztron check` regression runner, and a few common
pitfalls.

## DevTools

The command is `plugin:webview|toggle_devtools` (included in
`core:default`). Call it from the frontend via
`@zturnlibs/ztron-api/webview`:

```ts
import { Webview } from "@zturnlibs/ztron-api/webview";

const r = await Webview.getCurrent().toggleDevtools();
// { supported: boolean; platform: string; reason?: string }
```

On macOS this returns `supported: false` — macOS WKWebView exposes no
public devtools toggle (upstream Tauri also skips open_devtools on macOS);
devtools are enabled in debug builds, and the host reports that honestly
instead of failing silently (from the handler comment in
`packages/core/src/app.ts`, elided).

## Logging

The log plugin (`plugin:log|*`, translated from `tauri-plugin-log`) has
four target types: `stdout` / `stderr` / `file` / `webview`, filtered by
`level` (default `info`). The `file` target writes to the platform log
directory (macOS `~/Library/Logs/<identifier>/<identifier>.log`, matching
`plugin:path|app_log_dir`; `logDir` / `fileName` can override it) and
rotates once `maxFileSize` (bytes, default 100_000) is exceeded: `keepAll`
keeps timestamped backups, `keepOne` keeps a single `.old`. The `webview`
target re-emits every record to the frontend through
`addPluginListener('log','log',…)`, consumed with `attachConsole()`.

Frontend API (`@zturnlibs/ztron-api/log`): `log` / `trace` / `debug` /
`info` / `warn` / `error`, `attachLogger` (local sink), `attachConsole`.

From `examples/hello/src/main.ts` (logPlugin config fragment):

```ts
logPlugin({
  level: "trace",
  targets: ["stdout", "file", "webview"],
  rotationStrategy: "keepOne",
  // Small cap so the spike's 12 pressure lines force several rotations.
  maxFileSize: 400,
}),
```

Empirical anchor for the rotation contract: README P21 records
`LOG_ROTATE_OK:420->242` (on disk, `.log.old` 420B > current `.log` 242B,
the keepOne contract) — after writing 12 pressure log lines, the hello
frontend reads both file sizes via the trusted backend command
`m3:log-rotation` (the log directory is outside the fs scope by design;
the log plugin owns it).

## ztron check

`ztron check` is a regression runner: it boots the app through the full
dev pipeline and parses the check lines the app reports — two shapes are
recognized: the hello-style
`[m3] frontend reported: "TAG:detail"` and bare `TAG_OK` / `X_FAIL`
lines; a `*_FAIL` / `ERROR` tag or a native crash line counts as a
failure. **Exit 0 requires the app's own `SPIKE_RESULT: FULL_OK` line and
zero FAILs** (when `--expect` pins required tags, satisfying them takes
precedence and replaces FULL_OK); `--expect` (comma-separated) pins tags
that must appear, and `--timeout` (ms, default 120000) bounds the run.
The harness verdict overrides the child's own exit code.

On hello (command is the real usage; output quoted from the README P30
record):

```bash
ztron check --entry src/main.ts
# …
# [ztron check] 86 checks passed (FULL_OK)    # exit 0
```

The multi-window example pins required tags with `--expect` (README P30:
multiwin `--expect` 4/4, exit 0; wrong-tag / timeout paths exit 1):

```bash
ztron check --expect SECOND_WINDOW_OK,STRESS_OK
```

## FAQ

- **Notification permission is false under dev**: a bare binary launched
  from a terminal has no bundle, so notifications take the degraded path
  (check anchor `NOTIF_PERM_OK:false`, P22); only a packaged `.app` gets
  the real UNUserNotificationCenter. See [Notifications](/plugins/notification).
- **Frontend change has no effect?** dev prefers the Vite dev server
  (full module-level HMR); without `frontend/index.html` or when the dev
  server is unavailable it falls back to build+watch (near-HMR): watching
  `.ts` / `.html` / `.css` changes → rebuilding the IIFE → writing a
  reload signal file → the backend polls it and evals
  `location.reload()` on the page.
- **Where are the log files**: macOS default
  `~/Library/Logs/<identifier>/<identifier>.log` (hello:
  `~/Library/Logs/com.ztron.hello/com.ztron.hello.log`), rotation backups
  in the same directory. See [Logging](/plugins/log).

适用版本：`ztron 0.3.1`
