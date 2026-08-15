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
  writeFile(p: string, data: string | Uint8Array): Promise<void>;
  stat(p: string): Promise<{
    size: number;
    mode: number;
    mtime?: string;
  }>;
  readDir(p: string): Promise<DirEntry[]>;
  remove(p: string): Promise<void>;
  makeDir(p: string, options?: { mode?: number; recursive?: boolean }): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  rename(src: string, dest: string): Promise<void>;
  spawn(
    cmd: string[],
    opts?: {
      stdout?: "pipe" | "inherit" | "ignore";
      stderr?: "pipe" | "inherit" | "ignore";
      cwd?: string;
      env?: Record<string, string>;
    },
  ): {
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
