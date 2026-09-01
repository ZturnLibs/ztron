/** Stronghold API — encrypted vault, mirrors `plugin:stronghold|*` (E2). */
import { invoke } from "./core.js";

export interface StrongholdStatus {
  entries?: number;
  path?: string;
  saved?: boolean;
  closed?: boolean;
  reloaded?: boolean;
}

export function load(path: string, password: string): Promise<StrongholdStatus> {
  return invoke("plugin:stronghold|load", { path, password });
}
function get<T = unknown>(path: string, key: string): Promise<T | null> {
  return invoke("plugin:stronghold|get", { path, key });
}
function set(path: string, key: string, value: unknown): Promise<void> {
  return invoke("plugin:stronghold|set", { path, key, value });
}
function has(path: string, key: string): Promise<boolean> {
  return invoke("plugin:stronghold|has", { path, key });
}
function remove(path: string, key: string): Promise<void> {
  return invoke("plugin:stronghold|remove", { path, key });
}
function keys(path: string): Promise<string[]> {
  return invoke("plugin:stronghold|keys", { path });
}
function clear(path: string): Promise<void> {
  return invoke("plugin:stronghold|clear", { path });
}
function save(path: string): Promise<StrongholdStatus> {
  return invoke("plugin:stronghold|save", { path });
}
function saveTo(path: string, newPath: string): Promise<StrongholdStatus> {
  return invoke("plugin:stronghold|save_to", { path, newPath });
}
function close(path: string): Promise<StrongholdStatus> {
  return invoke("plugin:stronghold|close", { path });
}
function reload(path: string, password: string): Promise<StrongholdStatus> {
  return invoke("plugin:stronghold|reload", { path, password });
}

/**
 * Per-vault handle (upstream Stronghold object spirit): bound path,
 * password held for the session.
 */
export class Stronghold {
  private constructor(
    readonly path: string,
    private password: string,
  ) {}

  static async load(path: string, password: string): Promise<Stronghold> {
    await load(path, password);
    return new Stronghold(path, password);
  }

  get<T = unknown>(key: string): Promise<T | null> {
    return get<T>(this.path, key);
  }
  set(key: string, value: unknown): Promise<void> {
    return set(this.path, key, value);
  }
  has(key: string): Promise<boolean> {
    return has(this.path, key);
  }
  remove(key: string): Promise<void> {
    return remove(this.path, key);
  }
  keys(): Promise<string[]> {
    return keys(this.path);
  }
  clear(): Promise<void> {
    return clear(this.path);
  }
  save(): Promise<StrongholdStatus> {
    return save(this.path);
  }
  saveTo(newPath: string): Promise<StrongholdStatus> {
    return saveTo(this.path, newPath);
  }
  /** Flushes if dirty, forgets the password. */
  close(): Promise<StrongholdStatus> {
    return close(this.path);
  }
  /** Drops unsaved state and reopens from disk. */
  reload(): Promise<StrongholdStatus> {
    return reload(this.path, this.password);
  }
}

export const stronghold = {
  load,
  get,
  set,
  has,
  remove,
  keys,
  clear,
  save,
  saveTo,
  close,
  reload,
};
