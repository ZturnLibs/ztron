---
title: Opener (opener)
---

# Overview

The `opener` module opens URLs and paths with the **system default
application** and **reveals** items in the file manager — a port of
`@tauri-apps/plugin-opener`'s JS bindings (the successor of
`shell.open`), mirroring `plugin:opener|*`. Three functions:

- `openUrl(url, openWith?)`: opens a URL with the default (or the
  given) application;
- `openPath(path, openWith?)`: opens a file/directory with the default
  (or the given) application;
- `revealItemInDir(path)`: reveals the item in the file manager,
  selected (macOS `open -R`, Windows `explorer /select,`; Linux
  `xdg-open` cannot select, so it falls back to opening the containing
  directory).

Platform launchers: macOS `open`, Windows `cmd /c start`, Linux
`xdg-open`.

```ts
import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api/opener";
```

# Permissions & Scope

The plugin is constructed with `openerPlugin(options)`; the only
option is `urlSchemes`: the scheme whitelist for `open_url` (default
`["http", "https", "mailto"]`, case-insensitive); a URL whose scheme
is not on the list throws
`opener: URL scheme not allowed: <url>`. `open_path` requires an
**absolute path** (`/...` or `C:\...`) and rejects anything else. On
success the commands return `{ opened: true }` / `{ revealed: true }`.

Four permissions: `opener:allow-open-url` /
`opener:allow-open-path` / `opener:allow-reveal-item-in-dir`, plus a
reverse `opener:deny-open-url` (denies open_url, for explicitly
narrowing an inherited set); the first three aggregate into the
`opener:default` set. The hello example does **not** register this
plugin (its "open a URL" scenario is covered and verified by
`shell.open`) — honestly stated: no hello spike anchor.

# Example

Not covered by hello; the following are signature-level examples
(aligned verbatim with `packages/api/src/opener.ts`):

```ts
await openUrl("https://tauri.app");                 // inside the default scheme whitelist
await openUrl("mailto:hi@example.com");             // mailto is allowed too
await openPath("/Users/me/report.pdf");             // default application
await openPath("/Users/me/report.pdf", "Preview");  // explicit app (macOS: open -a)
await revealItemInDir("/Users/me/report.pdf");      // selected in Finder
await openUrl("file:///etc/hosts");                 // rejected: file is not on the default whitelist
```

`shell.open` ([Shell](/plugins/shell)) validates http(s) only and
rejects `file://`; opener makes the scheme whitelist a construction
option and adds path opening and reveal — the two complement rather
than duplicate each other.

# Commands

`plugin:opener|*` totals **3 commands**:

| Command | API |
| --- | --- |
| `open_url` | `openUrl` |
| `open_path` | `openPath` |
| `reveal_item_in_dir` | `revealItemInDir` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/opener).

Applicable version: `ztron 0.3.1`
