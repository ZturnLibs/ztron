/**
 * Ambient declarations for the `tjs` global provided by txiki.js
 * (env, sockets, filesystem — the parts used by @ztronlib/runtime-ffi).
 *
 * No top-level imports/exports: this file is a global script so the
 * `declare global` registers the ambient `tjs` object.
 */

declare global {
  const tjs: {
    env: Record<string, string | undefined>;
    exePath: string;
    args: string[];
    readFile(
      path: string,
      options?: { encoding?: string },
    ): string | Uint8Array;
    writeFile(path: string, data: string | Uint8Array): void;
    connect(
      transport: "tcp" | "pipe",
      host: string,
      port: number,
    ): Promise<TjsSocket>;
    listen(
      transport: "tcp" | "pipe",
      host: string,
      port: number,
    ): Promise<TjsSocket>;
  };
}

/** Direct Sockets-style stream socket. */
export interface TjsSocket {
  readonly readable: ReadableStream<Uint8Array>;
  readonly writable: WritableStream<Uint8Array>;
  readonly opened?: Promise<{
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  }>;
  close(): void;
}

export {};

/*
 * Runtime globals (txiki provides them; lib is ES2022-only so tsc does not
 * know them — same treatment as @ztronlib/core's tjs-global.d.ts).
 */
declare class TextDecoder {
  constructor(label?: string);
  decode(bytes: Uint8Array, options?: { stream?: boolean }): string;
}
declare class TextEncoder {
  encode(s: string): Uint8Array;
}
declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
declare class WritableStreamDefaultWriter<T = Uint8Array> {
  write(chunk: T): Promise<void>;
  close(): Promise<void>;
  releaseLock(): void;
}
declare class ReadableStreamDefaultReader<T = Uint8Array> {
  read(): Promise<{ done: boolean; value: T }>;
  releaseLock(): void;
}
declare function setTimeout(
  cb: (...args: unknown[]) => void,
  ms?: number,
): number;
declare function clearTimeout(id: number): void;
