---
title: SQLite Database (sql)
---

# Overview

The `sql` module provides **SQLite access** (via `tjs:sqlite`),
translated from a simplified `tauri-plugin-sql` (no migrations).
`Database.load` opens (or creates) a database file and returns a
connection pooled by `id`; `execute` runs INSERT/UPDATE/DELETE (or any
non-SELECT) statement, `select` runs a query and returns rows; params
use positional `?` placeholders (arrays). Database paths are gated by
the plugin's `PathScope`.

```ts
import { Database, sql } from "@zturnlibs/ztron-api/sql";
```

# Permissions & Scope

The plugin is constructed with `sqlPlugin(options)`; the only option
is `scope` (a `PathScopeConfig`, default `{ allow: [] }` — unconfigured
means everything is denied, fail-closed). `load` runs the path through
`scope.check`; out-of-scope paths throw. Four permissions
`sql:allow-load` / `sql:allow-execute` / `sql:allow-select` /
`sql:allow-close`, aggregated into the `sql:default` set ("Allows
SQLite access (paths gated by scope)"); the hello example declares
`sql:default`.

# Example

Backend registration (scope limited to `$TMP/**`). From
`examples/hello/src/main.ts`:

```ts
.plugin(sqlPlugin({ scope: { allow: ["$TMP/**"] } }))
```

The frontend's full round trip: create a table, insert, select,
close. From `examples/hello/frontend/src/main.ts` (the anchor
`SQL_OK` is its real run output; comments kept, excerpt elided):

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

# Commands

`plugin:sql|*` totals **4 commands**, mapped one-to-one to the
`Database` class:

| Command | API |
| --- | --- |
| `load` | `Database.load(path)` → connection id (`Database#id`) |
| `execute` | `Database#execute(query, params?)` (non-SELECT) |
| `select` | `Database#select<T>(query, params?)` → rows |
| `close` | `Database#close()` (releases the pooled connection) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/sql).

Applicable version: `ztron 0.3.1`
