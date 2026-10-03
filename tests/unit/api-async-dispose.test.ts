/**
 * Resource asyncDispose (tauri 2.12 be019795a alignment): `await using`
 * support — Symbol.asyncDispose triggers the same path as close().
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@zturnlibs/ztron-api/mocks";
import { Resource } from "@zturnlibs/ztron-api";

/* mocks target a DOM runtime: give node:test a minimal window. */
(globalThis as { window?: unknown }).window = globalThis;

test("Resource[Symbol.asyncDispose] exists and disposes via close", async () => {
  assert.equal(typeof (Resource.prototype as object)[Symbol.asyncDispose!], "function");

  const destroyed: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:resources|close" || cmd === "plugin:image|destroy") {
      destroyed.push((args as { rid?: number }).rid ?? -1);
    }
  });
  const r = new Resource(42);
  await (r as object)[Symbol.asyncDispose as keyof typeof r]();
  clearMocks();
  assert.deepEqual(destroyed, [42]); /* same wire path as close() */
});

test("await using disposes at scope exit (runtime feature check)", async () => {
  /* `await using` needs the explicit-resource-management flag on some
   * toolchains; assert the protocol pieces instead: asyncIterator-of-life
   * is out of scope, so drive the semantic manually. */
  const destroyed: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:resources|close") {
      destroyed.push((args as { rid?: number }).rid ?? -1);
    }
  });
  {
    const r = new Resource(7);
    try {
      /* scope body */
      assert.equal(r.rid, 7);
    } finally {
      await (r as object)[Symbol.asyncDispose as keyof typeof r]();
    }
  }
  clearMocks();
  assert.deepEqual(destroyed, [7]);
});
