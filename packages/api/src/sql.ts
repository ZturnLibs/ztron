/**
 * SQLite API — mirrors `plugin:sql|*`. Database paths must be within the app's
 * configured sql scope.
 */
import { invoke } from "./core.js";

export class Database {
  readonly id: number;

  private constructor(id: number) {
    this.id = id;
  }

  /** Opens (or creates) a database file; returns a pooled connection. */
  static async load(path: string): Promise<Database> {
    const id = await invoke<number>("plugin:sql|load", { path });
    return new Database(id);
  }

  /** Runs an INSERT/UPDATE/DELETE (or any non-SELECT) statement. */
  async execute(query: string, params: unknown[] = []): Promise<void> {
    await invoke("plugin:sql|execute", { id: this.id, query, params });
  }

  /** Runs a SELECT and returns the rows. */
  async select<T = Record<string, unknown>>(
    query: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return invoke<T[]>("plugin:sql|select", { id: this.id, query, params });
  }

  async close(): Promise<void> {
    await invoke("plugin:sql|close", { id: this.id });
  }
}

export const sql = { Database };
