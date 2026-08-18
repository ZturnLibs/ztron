/*
 * Ambient runtime globals (txiki.js provides them; the package compiles
 * with lib ES2022 only — a PURE AMBIENT script so these declares apply
 * globally; tjs-global.d.ts is a module and cannot carry globals).
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
