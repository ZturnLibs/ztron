---
title: SQLite 数据库（sql）
---

# 概述

`sql` 模块提供 **SQLite 访问**（基于 `tjs:sqlite`），译自
`tauri-plugin-sql` 的简化版（无 migrations）。`Database.load` 打开
（或创建）一个数据库文件并返回按 `id` 池化的连接；`execute` 跑
INSERT/UPDATE/DELETE 等非查询语句，`select` 跑查询并返回行；参数用
位置 `?` 占位符（数组）。数据库路径受插件的 `PathScope` 约束。

```ts
import { Database, sql } from "@zturnlibs/ztron-api/sql";
```

# 权限与 Scope

插件由 `sqlPlugin(options)` 构造，唯一选项 `scope`（`PathScopeConfig`
，缺省 `{ allow: [] }`——不配置即全部拒绝，fail-closed）。`load`
时对路径做 `scope.check`，越界即抛错。权限串四条
`sql:allow-load` / `sql:allow-execute` / `sql:allow-select` /
`sql:allow-close`，聚合为 `sql:default` 集（"Allows SQLite access
(paths gated by scope)"）；hello 示例声明 `sql:default`。

# 示例

后端注册（scope 限定 `$TMP/**`）。摘自
`examples/hello/src/main.ts`：

```ts
.plugin(sqlPlugin({ scope: { allow: ["$TMP/**"] } }))
```

前端建表、插值、查询、关闭的完整往返。摘自
`examples/hello/frontend/src/main.ts`（锚点 `SQL_OK` 为其真实运行
输出，注释保留、有删节）：

```ts
// 5h. sql (tjs:sqlite)
const tmpDir = await os.tmpdir();
const db = await Database.load(`${tmpDir}/ztron_spike.db`);
await db.execute("DROP TABLE IF EXISTS notes");
await db.execute(
  "CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY, text TEXT)",
);
await db.execute("INSERT INTO notes(text) VALUES(?)", ["hello-sql"]);
const rows = await db.select<{ text: string }>(
  "SELECT text FROM notes WHERE text = ?",
  ["hello-sql"],
);
await db.close();
if (rows.length === 1 && rows[0]?.text === "hello-sql") {
  report("SQL_OK:" + rows[0].text);
}
```

# 命令一览

`plugin:sql|*` 共 **4 条**，与 `Database` 类方法一一对应：

| 命令 | API |
| --- | --- |
| `load` | `Database.load(path)` → 连接 id（`Database#id`） |
| `execute` | `Database#execute(query, params?)`（非 SELECT） |
| `select` | `Database#select<T>(query, params?)` → 行数组 |
| `close` | `Database#close()`（释放池内连接） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/sql)。

适用版本：`ztron 0.3.1`
