/**
 * Ambient type declarations for the txiki.js `tjs:ffi` module.
 *
 * Authored against the public API docs (txikijs.org) and the txiki test suite
 * (`tests/test-ffi-dlopen-callback.js`). No top-level imports/exports here —
 * this file is a global script so `declare module 'tjs:ffi'` registers an
 * ambient module.
 */

declare module "tjs:ffi" {
  /** A pointer value returned by FFI calls. */
  export type Pointer = object & { __isPointer: true };

  /** An opaque FFI type descriptor. */
  export type FfiType = object;

  /** Built-in type descriptors used in symbol maps and callback signatures. */
  export const types: {
    void: FfiType;
    pointer: FfiType;
    string: FfiType;
    buffer: FfiType;
    sint8: FfiType;
    sint16: FfiType;
    sint32: FfiType;
    sint64: FfiType;
    uint8: FfiType;
    uint16: FfiType;
    uint32: FfiType;
    uint64: FfiType;
    float: FfiType;
    double: FfiType;
    size: FfiType;
    ssize: FfiType;
    /** Factory producing the (singleton) callback type. */
    jscallback(): FfiType;
  };

  /**
   * A JS function exposed to C as a callback.
   * Signature: `new JSCallback(returnType, [argTypes...], fn)`.
   */
  export class JSCallback {
    constructor(
      returns: FfiType,
      args: FfiType[],
      fn: (...args: never[]) => unknown,
    );
  }

  /**
   * Opens a shared library and binds the exported symbols. Types may be given
   * as type objects (e.g. `types.pointer`) or string aliases (e.g. `"void*"`).
   */
  export function dlopen(
    name: string,
    symbols: Record<string, { returns: unknown; args: unknown[] }>,
  ): { symbols: Record<string, (...args: unknown[]) => unknown> };
}
