/**
 * Ztron addition (NOT part of the vendored @txikijs/types — see
 * scripts/sync-tjs-types.sh, which never touches this file).
 *
 * The official declarations assume the consumer's compilation provides the
 * web platform globals (via `lib: DOM` or `@types/node`). Import this entry
 * (`@zturnlibs/tjs-types/web`) only in pure-ES2022 compilations without node
 * or DOM types — e.g. `@zturnlibs/ztron-core` itself. It declares exactly the
 * surface ztron code runs on top of; txiki.js provides all of it at runtime.
 *
 * Must stay a global script file: no top-level imports/exports.
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
