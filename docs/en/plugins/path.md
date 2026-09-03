---
title: Path（path）
---

# Overview

The `path` module provides path utilities: string operations
(join/resolve/normalize/…), 30+ system and app directory getters,
bundled-resource resolution and the Tauri v2 `BaseDirectory` name table
— a port of `@tauri-apps/api/path` and the path plugin.

```ts
import { join, homeDir, BaseDirectory } from "@zturnlibs/ztron-api/path";
// or from the main entry: import { path } from "@zturnlibs/ztron-api";  → path.join(...)
```

Key points:

- Pure string operations, no scope constraints.
- The `appDataDir` / `appConfigDir` / `appCacheDir` /
  `appLocalDataDir` / `appLogDir` getters follow the appId convention
  (determined by the plugin's `appId` constructor option);
  `localDataDir` is the Tauri v2 alias of `appLocalDataDir`.
- `resolveResource(path)` resolves a bundled asset relative path
  against the resource directory (absolute paths pass through).
- `sep` (POSIX `/`) and `delimiter` (POSIX `:`) are constants.
- `BaseDirectory` carries the 23 upstream names (`Audio`…`Template`),
  usable as `options.baseDir` for fs/path functions;
  `resolveBaseDirectory(base)` resolves a name to its absolute path.

# Permissions & Scope

path is a real plugin (`pathPlugin({ appId: "com.ztron.hello" })`);
its permission strings live in the **`path:`** namespace:

| Permission | Grants |
| --- | --- |
| `path:default` | all 32 `plugin:path\|*` commands |
| `path:allow-<hyphenated-cmd>` | a single command (e.g. `path:allow-home-dir`) |

No scope: path operations never touch the filesystem and `pathPlugin`
takes no scope option.

# Example

From `examples/hello/frontend/src/main.ts` (verification anchor
`PATH_APP_DIRS_OK`):

```ts
import { path } from "@zturnlibs/ztron-api";

const joined = await path.join("/a", "b", "c");   // "/a/b/c"
const [home, temp] = await Promise.all([path.homeDir(), path.tempDir()]);
const appData = await path.appDataDir();          // contains "com.ztron.hello"
```

# Commands

`plugin:path|*` totals **32 commands**: 7 string operations (`join`,
`resolve`, `normalize`, `is_absolute`, `basename`, `dirname`,
`extname`), plus `sep`, `home_dir`, `temp_dir`, `cwd` and 21
system/app directory getters. Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
