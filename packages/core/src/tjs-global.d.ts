/**
 * Ambient declarations for the `tjs` global + `tjs:path` module in txiki.js.
 * A global script (no top-level imports/exports): top-level `declare` of a
 * const/interface declares a global; `declare module` declares a module.
 */

declare module "tjs:path" {
  export interface PathLike {
    join(...parts: string[]): string;
    resolve(...parts: string[]): string;
    normalize(p: string): string;
    isAbsolute(p: string): boolean;
    basename(p: string, ext?: string): string;
    dirname(p: string): string;
    extname(p: string): string;
    relative(from: string, to: string): string;
    sep: string;
    delimiter: string;
  }
  const _default: PathLike & { posix: PathLike; win32: PathLike };
  export default _default;
}

interface DirEntry {
  name: string;
  isDirectory: boolean;
  isFile: boolean;
}

declare module "tjs:sqlite" {
  export class Database {
    constructor(path: string);
    exec(sql: string): void;
    close(): void;
    inTransaction: boolean;
    prepare(sql: string): {
      run(params?: unknown[]): void;
      all(params?: unknown[]): unknown[];
    };
  }
}

declare const tjs: {
  env: Record<string, string | undefined>;
  /** Full argv (including the executable as argv[0]). */
  args: string[];
  homeDir: string;
  tmpDir: string;
  cwd: string;
  pid: number;
  exePath: string;
  realPath(p: string): Promise<string>;
  readFile(p: string, options?: { encoding?: string }): Promise<Uint8Array>;
  /* G9/D3 stat-family + truncate: feature-detected at runtime (txiki
     exposes these on current builds; older vendored copies may not). */
  chmod?(p: string, mode: number): Promise<void>;
  lstat?(
    p: string,
  ): Promise<{ size: number; mode: number; isSymlink?: boolean }>;
  readLink?(p: string): Promise<string>;
  truncate?(p: string, len: number): Promise<void>;
  writeFile(p: string, data: string | Uint8Array): Promise<void>;
  stat(p: string): Promise<{
    size: number;
    mode: number;
    mtime?: string;
  }>;
  readDir(p: string): Promise<DirEntry[]>;
  remove(p: string): Promise<void>;
  makeDir(p: string, options?: { mode?: number; recursive?: boolean }): Promise<void>;
  watch(
    p: string,
    handler: (filename: string, event: "change" | "rename") => void,
  ): { close(): void; path: string };
  copyFile(src: string, dest: string): Promise<void>;
  rename(src: string, dest: string): Promise<void>;
  spawn(
    cmd: string[],
    opts?: {
      stdin?: "pipe" | "inherit" | "ignore";
      stdout?: "pipe" | "inherit" | "ignore";
      stderr?: "pipe" | "inherit" | "ignore";
      cwd?: string;
      env?: Record<string, string>;
    },
  ): {
    pid: number;
    stdin: WritableStream<Uint8Array> | null;
    stdout: ReadableStream<Uint8Array> | null;
    stderr: ReadableStream<Uint8Array> | null;
    wait(): Promise<{ exitStatus: number | null }>; 
    kill(sig?: number): void;
  };
  serve(options: {
    port: number;
    listenIp?: string;
    fetch(req: { url: string; method: string }): Promise<Response> | Response;
  }): Promise<{ port: number; close(): void }>;
};

/*
 * Runtime globals (txiki.js provides these; the lib config is ES2022-only
 * so tsc does not know them without DOM/node types — declare the surface
 * the core plugins actually use).
 */

declare class TextDecoder {
  constructor(label?: string);
  decode(bytes: Uint8Array, options?: { stream?: boolean }): string;
}
declare class TextEncoder {
  encode(s: string): Uint8Array;
}
declare function atob(s: string): string;
declare function btoa(s: string): string;

declare class URL {
  constructor(url: string, base?: string);
  readonly href: string;
  readonly protocol: string;
  readonly host: string;
  readonly hostname: string;
  readonly port: string;
  readonly pathname: string;
  readonly search: string;
  readonly searchParams: URLSearchParams;
  static canParse(url: string, base?: string): boolean;
  toString(): string;
}
declare class URLSearchParams {
  constructor(init?: string | string[][] | Record<string, string>);
  get(name: string): string | null;
  has(name: string): boolean;
  toString(): string;
}

/* Fetch/console surface (txiki provides WHATWG fetch + console). */
declare function fetch(url: string, init?: RequestInit): Promise<Response>;
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
interface RequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Uint8Array | undefined;
  signal?: AbortSignal | undefined;
}
declare class AbortSignal {
  static timeout(ms: number): AbortSignal;
}
declare class ReadableStream<T = any> {
  getReader(): {
    read(): Promise<{ done: boolean; value: T }>;
    releaseLock(): void;
  };
  locked: boolean;
}
declare class Response {
  constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> });
  readonly status: number;
  readonly ok: boolean;
  readonly headers: {
    forEach(cb: (value: string, key: string) => void): void;
    get(name: string): string | null;
  };
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}
declare const crypto: {
  subtle: {
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  };
};

/* Timers (txiki provides the standard ones). */
declare function setTimeout(
  cb: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
): number;
declare function clearTimeout(id: number): void;
declare function setInterval(
  cb: (...args: unknown[]) => void,
  ms?: number,
  ...args: unknown[]
): number;
declare function clearInterval(id: number): void;
declare function queueMicrotask(cb: () => void): void;
