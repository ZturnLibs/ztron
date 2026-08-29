/**
 * In-memory `tjs` stub for Node unit tests.
 * Covers the tjs surface the core plugins use: fs, spawn, serve, env, paths.
 * sql/path plugins additionally need `tjs:*` modules (skipped under Node).
 */

interface TjsFile {
  data: Uint8Array;
  mode: number;
}

class TjsStub {
  env: Record<string, string | undefined> = {
    LANG: "en_US.UTF-8",
  };
  homeDir = "/home/tester";
  tmpDir = "/tmp/ztron-test";
  cwd = "/work";
  pid = 1234;
  exePath = "/usr/bin/ztron-host";
  args: string[] = ["/usr/bin/ztron-host"];
  #files = new Map<string, TjsFile>();

  constructor(seed: Record<string, string> = {}) {
    for (const [p, contents] of Object.entries(seed)) {
      this.#files.set(normalize(p), {
        data: new TextEncoder().encode(contents),
        mode: 0o100644,
      });
    }
  }

  async readFile(p: string): Promise<Uint8Array> {
    const f = this.#files.get(normalize(p));
    if (!f) throw makeEnoent(p);
    return new Uint8Array(f.data);
  }

  async writeFile(p: string, data: string | Uint8Array): Promise<void> {
    this.#files.set(normalize(p), {
      data:
        typeof data === "string"
          ? new TextEncoder().encode(data)
          : new Uint8Array(data),
      mode: 0o100644,
    });
  }

  async stat(
    p: string,
  ): Promise<{ size: number; mode: number; mtime?: string }> {
    const f = this.#files.get(normalize(p));
    if (!f) throw makeEnoent(p);
    return { size: f.data.length, mode: f.mode };
  }

  async realPath(p: string): Promise<string> {
    return normalize(p);
  }

  async remove(p: string): Promise<void> {
    const key = normalize(p);
    if (
      !this.#files.delete(key) &&
      ![...this.#files.keys()].some((k) => k.startsWith(key + "/"))
    ) {
      throw makeEnoent(p);
    }
    for (const k of [...this.#files.keys()]) {
      if (k.startsWith(key + "/")) this.#files.delete(k);
    }
  }

  async makeDir(p: string): Promise<void> {
    const key = normalize(p);
    if (
      !this.#files.has(key) &&
      ![...this.#files.keys()].some((k) => k.startsWith(key + "/"))
    ) {
      this.#files.set(key, { data: new Uint8Array(), mode: 0o040755 });
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const f = this.#files.get(normalize(src));
    if (!f) throw makeEnoent(src);
    this.#files.set(normalize(dest), {
      data: new Uint8Array(f.data),
      mode: f.mode,
    });
  }

  async rename(src: string, dest: string): Promise<void> {
    const f = this.#files.get(normalize(src));
    if (!f) throw makeEnoent(src);
    this.#files.set(normalize(dest), f);
    this.#files.delete(normalize(src));
  }

  async readDir(
    p: string,
  ): Promise<Array<{ name: string; isDirectory: boolean; isFile: boolean }>> {
    const key = normalize(p);
    const out: Array<{ name: string; isDirectory: boolean; isFile: boolean }> =
      [];
    for (const [k, f] of this.#files) {
      if (k === key) continue;
      if (k.startsWith(key + "/")) {
        const rest = k.slice(key.length + 1);
        const name = rest.split("/")[0]!;
        if (!out.some((e) => e.name === name)) {
          const isDir = rest.includes("/") || (f.mode & 0o170000) === 0o040000;
          out.push({ name, isDirectory: isDir, isFile: !isDir });
        }
      }
    }
    return out;
  }

  /* ---- G9: handle IO + stat family (libuv-flavored semantics) ---- */

  async chmod(p: string, mode: number): Promise<void> {
    const f = this.#files.get(normalize(p));
    if (!f) throw makeEnoent(p);
    f.mode = (f.mode & ~0o777) | (mode & 0o777);
  }

  async lstat(
    p: string,
  ): Promise<{ size: number; mode: number; mtime?: string; isSymlink: boolean }> {
    const st = await this.stat(p);
    return { ...st, isSymlink: false };
  }

  async readLink(p: string): Promise<string> {
    const f = this.#files.get(normalize(p));
    if (!f) throw makeEnoent(p);
    // no symlink modeling in the stub: readLink mirrors realPath
    return normalize(p);
  }

  async truncate(p: string, len: number): Promise<void> {
    const f = this.#files.get(normalize(p));
    if (!f) throw makeEnoent(p);
    const next = len < f.data.length ? f.data.slice(0, len) : f.data;
    const grown = new Uint8Array(len);
    grown.set(next);
    f.data = grown;
  }

  /** Fake command runner: `sh -c 'echo ...'` and `echo` echo their args. */
  spawn(
    cmd: string[],
    opts: { stdout?: "pipe" | "inherit" | "ignore" } = {},
  ): {
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    wait(): Promise<{ exitStatus: number | null }>;
    kill(): void;
  } {
    const [prog, ...args] = cmd;
    let text = "";
    if (prog === "echo") {
      text = args.join(" ") + "\n";
    } else if (prog === "pwd") {
      text = this.cwd + "\n";
    } else if (prog === "sh" || prog === "/bin/sh") {
      const script = args.find((a) => a.includes("echo")) ?? "";
      const m = script.match(/echo\s+([^;|]+)/);
      text = (m?.[1] ?? "").trim() + "\n";
    } else if (prog === "ipconfig") {
      text = "192.168.0.134\n";
    } else if (prog === "hostname") {
      text = "192.168.0.134\n";
    } else if (prog === "ifconfig") {
      text = "inet6 fe80::1\n";
    } else if (prog === "open" || prog === "xdg-open") {
      text = "";
    }
    const bytes = new TextEncoder().encode(text);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return {
      stdout: opts.stdout === "ignore" ? null : stream,
      stderr: null,
      wait: async () => ({ exitStatus: 0 }),
      kill: () => {},
    };
  }

  /** Fetch-style HTTP server (G11): stores the handler so tests can drive it. */
  lastServeHandler:
    | ((request: Request) => Response | Promise<Response>)
    | null = null;

  serve(options:
    | { fetch: (request: Request) => Response | Promise<Response>; port?: number }
    | ((request: Request) => Response | Promise<Response>)): {
    readonly port: number;
    close(): Promise<void>;
  } {
    this.lastServeHandler =
      typeof options === "function" ? options : options.fetch;
    return {
      port: (typeof options === "object" && options.port) || 18888,
      close: async () => {
        this.lastServeHandler = null;
      },
    };
  }
}

function normalize(p: string): string {
  return p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function makeEnoent(p: string): Error {
  const e = new Error(`ENOENT: no such file or directory '${p}'`) as Error & {
    code: string;
  };
  e.code = "ENOENT";
  return e;
}

let active: TjsStub | null = null;

/** Installs the in-memory tjs stub as the global `tjs`. */
export function installTjs(seed: Record<string, string> = {}): TjsStub {
  const stub = new TjsStub(seed);
  active = stub;
  (globalThis as Record<string, unknown>).tjs = stub;
  // Simulate a macOS-ish navigator so platform-convention code paths run.
  const nav = (globalThis as Record<string, unknown>).navigator;
  if (nav && typeof nav === "object") {
    try {
      Object.defineProperty(nav, "platform", {
        value: "MacIntel",
        configurable: true,
      });
    } catch {
      /* keep native navigator */
    }
  }
  return stub;
}

export function getTjs(): TjsStub {
  return active ?? installTjs();
}
