---
title: 文件系统（fs）
---

# 概述

`fs` 模块提供**作用域约束的文件系统访问**：每一次读写都会在后端按应用配置
的 PathScope 校验路径，越界即拒绝。API 分三层——v1 便捷函数（文本/目录/
元信息）、二进制 IO（`readFile`/`writeFile`，base64 线格式 + 原始 IPC 响应）、
句柄式 IO（`open` → `FileHandle` 的 `read`/`write`/`seek`/`flush`/`close`），
外加扩展 stat 家族（`lstat`/`readLink`/`truncate`/`chmod`）与真实 FSEvents
驱动的 `watch`。全部由 `plugin:fs|*` 命令支撑（对齐 `@tauri-apps/plugin-fs`）。

```ts
import { fs } from "@zturnlibs/ztron-api/fs";
// 或从主入口：import { fs, readText, writeText, openFile } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限集三级：

| 权限集 | 授予内容 |
| --- | --- |
| `fs:default` | 只读：`read-text-file`、`read-dir`、`exists` |
| `fs:write-default` | 读 + 写文本，**不含 remove**（更安全的应用默认值） |
| `fs:full` | 全部操作，含 remove/copy/rename/stat |

细粒度权限：`fs:allow-open`、`fs:allow-truncate`、`fs:allow-lstat`、
`fs:allow-read-link`、`fs:allow-chmod`、`fs:allow-read-file`、
`fs:allow-write-file`、`fs:allow-read-text-file`、
`fs:allow-write-text-file`、`fs:allow-watch`、`fs:allow-read-dir`、
`fs:allow-exists`、`fs:allow-remove`、`fs:allow-make-dir`、
`fs:allow-copy`、`fs:allow-rename`、`fs:allow-stat`（以及覆盖 allow 的
`fs:deny-write-text-file`）。

摘自 `examples/hello/capabilities/main.json`（fs 相关条目）：

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

Scope 来自插件构造：`fsPlugin({ scope })` 接受 PathScope 配置**或实例**
（实例可被 persisted-scope 动态扩充）。摘自
`examples/hello/src/main.ts`——fs 的作用域就是持久化作用域实例，
基线允许 `$TMP/**`，spike 中再长出 `$HOME/ztron-persisted-spike/**`：

```ts
const persisted = persistedScopePlugin({
  file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
  scope: { allow: ["$TMP/**"] },
});
const psScope = persisted.scope;
// ...
.plugin(fsPlugin({ scope: psScope }))
```

# 示例

示例（基于 `examples/hello/frontend/src/main.ts` 的对应段落拼接改写；
锚点 `FS_OK`、`FS_WATCH_OK`、`FS_BINARY_OK`、`FS_COPY_RENAME_OK`
为其真实运行输出）：

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

ACL 行为：前端 4b 段断言了拒绝路径——capability 只授了 `fs:write-default`
未授 `fs:allow-remove`，`fs.remove(...)` 会被后端以 "access denied" 拒绝；
而"越界路径 `exists()` 报 false 而非报错"是 core 的既定行为（见
`packages/core/src/plugins/fs.ts` 的 exists 命令：`scope.tryCheck` 为
null 时直接返回 false），并非前端断言。

# 命令一览

`plugin:fs|*` 共 **23 条**，与 API 的对应关系：

| 命令 | API |
| --- | --- |
| `read_text` / `write_text` | `readText` / `writeText` |
| `read_file` / `write_file` | `readFile` / `writeFile`（二进制） |
| `read_dir` / `exists` | `readDir` / `exists` |
| `remove` / `make_dir` | `remove` / `makeDir` |
| `copy` / `rename` / `stat` | `copyFile` / `renameFile` / `stat` |
| `watch` / `unwatch` | `watch()` 及其返回的取消函数 |
| `open` / `read` / `write` / `seek` / `flush` / `close` | `open` 与 `FileHandle` 方法 |
| `truncate` / `lstat` / `read_link` / `chmod` | `truncate` / `lstat` / `readLink` / `chmod` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/fs)。

适用版本：`ztron 0.3.1`
