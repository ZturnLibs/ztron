---
title: Filesystem (fs)
---

# Overview

The `fs` module provides **scope-checked filesystem access**: every read
and write is validated against the app's configured PathScope in the
backend and rejected when out of scope. The API has three layers — v1
convenience functions (text/directory/metadata), binary IO
(`readFile`/`writeFile`, base64 on the wire + raw IPC response),
handle-style IO (`open` → a `FileHandle` with
`read`/`write`/`seek`/`flush`/`close`), plus an extended stat family
(`lstat`/`readLink`/`truncate`/`chmod`) and a `watch` powered by real
FSEvents. Everything is backed by the `plugin:fs|*` commands (aligned
with `@tauri-apps/plugin-fs`).

```ts
import { fs } from "@zturnlibs/ztron-api/fs";
// or from the main entry: import { fs, readText, writeText, openFile } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Three permission sets:

| Permission set | Grants |
| --- | --- |
| `fs:default` | Read-only: `read-text-file`, `read-dir`, `exists` |
| `fs:write-default` | Read + write text, **no remove** (safer app default) |
| `fs:full` | Every operation incl. remove/copy/rename/stat |

Fine-grained permissions: `fs:allow-open`, `fs:allow-truncate`,
`fs:allow-lstat`, `fs:allow-read-link`, `fs:allow-chmod`,
`fs:allow-read-file`, `fs:allow-write-file`, `fs:allow-read-text-file`,
`fs:allow-write-text-file`, `fs:allow-watch`, `fs:allow-read-dir`,
`fs:allow-exists`, `fs:allow-remove`, `fs:allow-make-dir`,
`fs:allow-copy`, `fs:allow-rename`, `fs:allow-stat` (plus
`fs:deny-write-text-file`, which overrides allow).

From `examples/hello/capabilities/main.json` (the fs entries):

```json
"fs:write-default",
"fs:allow-copy",
"fs:allow-rename",
"fs:allow-stat",
"fs:allow-make-dir",
"fs:allow-watch",
"fs:allow-read-file",
"fs:allow-write-file"
```

The scope comes from plugin construction: `fsPlugin({ scope })` accepts a
PathScope config **or instance** (an instance can be grown dynamically by
persisted-scope). From `examples/hello/src/main.ts` — the fs scope *is*
the persisted-scope instance, baseline `$TMP/**`, grown with
`$HOME/ztron-persisted-spike/**` in the spike:

```ts
const persisted = persistedScopePlugin({
  file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
  scope: { allow: ["$TMP/**"] },
});
const psScope = persisted.scope;
// ...
.plugin(fsPlugin({ scope: psScope }))
```

# Example

Example (adapted from the matching sections of
`examples/hello/frontend/src/main.ts`; the anchors `FS_OK`, `FS_WATCH_OK`,
`FS_BINARY_OK`, `FS_COPY_RENAME_OK` are its real run outputs):

```ts
// 4. fs (scoped to $TMP/**)
await fs.writeText("$TMP/ztron_m3.txt", "m3-hello");
const data = await fs.readText("$TMP/ztron_m3.txt");
if (data === "m3-hello") report("FS_OK");

// 3b. fs.watch: real FSEvents round trip (write -> modify event -> unwatch)
const firstEvent = new Promise<fs.WatchEvent>((resolve) => {
  void fs.watch("$TMP/ztron_watch.txt", (ev) => resolve(ev))
    .then((unwatch) => {
      /* give the watcher a beat to arm, then touch the file */
      setTimeout(async () => {
        await fs.writeText("$TMP/ztron_watch.txt", "v2");
        setTimeout(() => void unwatch(), 1500);
      }, 400);
    });
});

// 3c. fs binary IO: write bytes -> read back byte-identical
const magic = new Uint8Array([0x89, 0x50, /* PNG magic… */ 7]);
await fs.writeFile("$TMP/ztron_bin.bin", magic);
const back = await fs.readFile("$TMP/ztron_bin.bin");

// 4a. fs copy/rename/stat
await fs.copyFile("$TMP/ztron_m3.txt", "$TMP/ztron_m3_copy.txt");
await fs.renameFile("$TMP/ztron_m3_copy.txt", "$TMP/ztron_m3_renamed.txt");
const meta = await fs.stat("$TMP/ztron_m3_renamed.txt");
```

ACL behavior: the frontend's section 4b asserts the denial path — the
capability grants `fs:write-default` but not `fs:allow-remove`, so
`fs.remove(...)` is rejected by the backend with "access denied"; the
"out-of-scope `exists()` reports false instead of throwing" is core's
own behavior (see the exists command in
`packages/core/src/plugins/fs.ts`: it returns false when
`scope.tryCheck` yields null), not a frontend assertion.

# Commands

`plugin:fs|*` totals **23 commands**, mapped to the API:

| Command | API |
| --- | --- |
| `read_text` / `write_text` | `readText` / `writeText` |
| `read_file` / `write_file` | `readFile` / `writeFile` (binary) |
| `read_dir` / `exists` | `readDir` / `exists` |
| `remove` / `make_dir` | `remove` / `makeDir` |
| `copy` / `rename` / `stat` | `copyFile` / `renameFile` / `stat` |
| `watch` / `unwatch` | `watch()` and its returned unwatch fn |
| `open` / `read` / `write` / `seek` / `flush` / `close` | `open` and the `FileHandle` methods |
| `truncate` / `lstat` / `read_link` / `chmod` | `truncate` / `lstat` / `readLink` / `chmod` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/fs).

Applicable version: `ztron 0.3.1`
