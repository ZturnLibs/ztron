/**
 * Raw IPC responses (InvokeResponseBody::Raw semantics): envelope
 * serialization, injected-layer unwrap, invalid-base64 containment, and the
 * fs read_file path resolving to bytes through the mock (which mirrors the
 * injected invoke).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RawResponse,
  RAW_RESPONSE_KEY,
  serializeResult,
  unwrapRawResponse,
} from "../../packages/core/dist/index.js";
import { installTjs } from "../helpers/tjs-stub.ts";

test("raw: RawResponse serializes to the __ZTRON_RAW__ envelope", () => {
  const wire = serializeResult(new RawResponse("aGk="));
  assert.equal(wire, JSON.stringify({ [RAW_RESPONSE_KEY]: "aGk=" }));
  // plain values stay plain JSON
  assert.equal(serializeResult({ a: 1 }), '{"a":1}');
  assert.equal(serializeResult("x"), '"x"');
  assert.equal(serializeResult(null), "null");
  assert.equal(serializeResult(undefined), "null");
});

test("raw: unwrap decodes valid base64 to bytes, passes everything else", () => {
  const bytes = unwrapRawResponse({ [RAW_RESPONSE_KEY]: "aGk=" });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(String.fromCharCode(...(bytes as Uint8Array)), "hi");

  // non-envelope values pass through untouched
  assert.deepEqual(unwrapRawResponse({ a: 1 }), { a: 1 });
  assert.equal(unwrapRawResponse("x"), "x");
  assert.equal(unwrapRawResponse(null), null);
  const arr = [1, 2];
  assert.equal(unwrapRawResponse(arr), arr);
});

test("raw: invalid base64 NEVER throws (resolve-argument safety)", () => {
  const bad = { [RAW_RESPONSE_KEY]: "iVBOR" }; // 5 chars — not base64 length
  let out: unknown;
  assert.doesNotThrow(() => {
    out = unwrapRawResponse(bad);
  });
  assert.equal(out, bad); // envelope passed through, observable not hung
});

test("raw: fs read_file resolves to Uint8Array through the mock invoke", async () => {
  const tjs = installTjs({ "/tmp/ztron-test/raw.bin": "\x00\x01\x02\xff" });
  void tjs;
  const { buildApp } = await import("../helpers/buildApp.ts");
  const { mock } = buildApp({ "/tmp/ztron-test/raw.bin": "\x00\x01\x02\xff" });
  const bytes = (await mock.main.invoke("plugin:fs|read_file", {
    path: "$TMP/raw.bin",
  })) as Uint8Array;
  assert.ok(bytes instanceof Uint8Array, "read_file resolves to bytes");
  // the stub seeds files as UTF-8, so U+00FF encodes to c3 bf on disk
  assert.deepEqual(Array.from(bytes), [0, 1, 2, 0xc3, 0xbf]);
});
