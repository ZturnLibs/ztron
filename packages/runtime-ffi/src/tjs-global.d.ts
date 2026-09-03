/**
 * Ambient declarations for the `tjs` global provided by txiki.js
 * (env, sockets, filesystem — the parts used by @zturnlibs/ztron-runtime-ffi).
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
