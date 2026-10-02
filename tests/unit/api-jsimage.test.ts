/**
 * JsImage icon-parameter widening (tauri 2.12 990f77eb2 alignment):
 * window icons accept path strings / byte arrays, normalized host-side
 * via the registered-image (rid) protocol.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@zturnlibs/ztron-api/mocks";
import { Window } from "@zturnlibs/ztron-api";
import { Image } from "@zturnlibs/ztron-api/image";

/* mocks target a DOM runtime: give node:test a minimal window. */
(globalThis as { window?: unknown }).window = globalThis;

test("setIcon accepts a path string and routes the rid (JsImage)", async () => {
  const rids: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:image|from_path") return 77;
    if (cmd === "plugin:window|set_icon") {
      rids.push((args as { image_id: number }).image_id);
    }
  });
  await Window.getCurrent().setIcon("/icons/app.png");
  clearMocks();
  assert.deepEqual(rids, [77]); /* string normalized via Image.fromPath */
});

test("setIcon accepts bytes and routes the registered rid", async () => {
  const rids: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:image|from_bytes") return 88;
    if (cmd === "plugin:window|set_icon") {
      rids.push((args as { image_id: number }).image_id);
    }
  });
  await Window.getCurrent().setIcon(new Uint8Array([1, 2, 3]));
  clearMocks();
  assert.deepEqual(rids, [88]);
});

test("setIcon still passes Image instances through (rid untouched)", async () => {
  const rids: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:window|set_icon") {
      rids.push((args as { image_id: number }).image_id);
    }
  });
  const img = Object.create(Image.prototype) as Image;
  Object.defineProperty(img, "rid", { value: 42 });
  await Window.getCurrent().setIcon(img);
  clearMocks();
  assert.deepEqual(rids, [42]); /* no from_path/from_bytes round-trip */
});

test("setIcon(null) clears with image_id -1", async () => {
  const rids: number[] = [];
  mockIPC((cmd, args) => {
    if (cmd === "plugin:window|set_icon") {
      rids.push((args as { image_id: number }).image_id);
    }
  });
  await Window.getCurrent().setIcon(null);
  clearMocks();
  assert.deepEqual(rids, [-1]);
});
