/**
 * `plugin:sql|*` — SQLite access via `tjs:sqlite`.
 * Translated from Tauri's `tauri-plugin-sql` (simplified: no migrations).
 *
 * Database paths are gated by a {@link PathScope}. Connections are pooled by
 * id; params use positional `?` placeholders (arrays).
 */
import { PathScope, type PathScopeConfig } from "../scope.js";
import type { Plugin } from "../plugin.js";

interface SqlDatabase {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): {
    run(params?: unknown[]): void;
    all(params?: unknown[]): unknown[];
  };
}

export interface SqlPluginOptions {
  scope?: PathScopeConfig;
}

export function sqlPlugin(options: SqlPluginOptions = {}): Plugin {
  const scope = new PathScope(options.scope ?? { allow: [] });
  const connections = new Map<number, SqlDatabase>();
  let nextId = 1;

  async function open(path: string): Promise<SqlDatabase> {
    const canon = await scope.check(path);
    const mod = (await import("tjs:sqlite")) as {
      Database: new (path: string) => SqlDatabase;
    };
    return new mod.Database(canon);
  }

  return {
    name: "sql",
    commands: {
      async load(args) {
        const { path } = args as { path: string };
        const db = await open(path);
        const id = nextId++;
        connections.set(id, db);
        return id;
      },
      execute(args) {
        const { id, query, params } = args as {
          id: number;
          query: string;
          params?: unknown[];
        };
        const db = connections.get(id);
        if (!db) throw new Error(`sql: connection ${id} not found`);
        const stmt = db.prepare(query);
        stmt.run(Array.isArray(params) ? params : []);
      },
      select(args) {
        const { id, query, params } = args as {
          id: number;
          query: string;
          params?: unknown[];
        };
        const db = connections.get(id);
        if (!db) throw new Error(`sql: connection ${id} not found`);
        const stmt = db.prepare(query);
        return stmt.all(Array.isArray(params) ? params : []);
      },
      close(args) {
        const { id } = args as { id: number };
        const db = connections.get(id);
        if (db) {
          db.close();
          connections.delete(id);
        }
      },
    },
    permissions: [
      { identifier: "sql:allow-load", commands: ["plugin:sql|load"] },
      { identifier: "sql:allow-execute", commands: ["plugin:sql|execute"] },
      { identifier: "sql:allow-select", commands: ["plugin:sql|select"] },
      { identifier: "sql:allow-close", commands: ["plugin:sql|close"] },
    ],
    permissionSets: [
      {
        name: "sql:default",
        description: "Allows SQLite access (paths gated by scope).",
        permissions: [
          "sql:allow-load",
          "sql:allow-execute",
          "sql:allow-select",
          "sql:allow-close",
        ],
      },
    ],
  };
}
