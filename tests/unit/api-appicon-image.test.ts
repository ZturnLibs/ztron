/**
 * Image.fromAppIconResource (tauri 2.12 d203f74a2 alignment): the api
 * surface + core routing; the Windows host loads exe resource 32512,
 * other platforms reply -1 (Windows-only API, throws).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@zturnlibs/ztron-api/mocks";
import { Image } from "@zturnlibs/ztron-api/image";
import { buildApp } from "../helpers/buildApp.ts";

/* mocks target a DOM runtime: give node:test a minimal window. */
(globalThis as { window?: unknown }).window = globalThis;

test("fromAppIconResource resolves the rid (Windows host)", async () => {
  mockIPC((cmd) => {
    if (cmd === "plugin:image|from_app_icon_resource") return 5;
  });
  const img = await Image.fromAppIconResource();
  clearMocks();
  assert.equal(img.rid, 5);
});

test("fromAppIconResource throws on -1 (non-Windows host)", async () => {
  mockIPC((cmd) => {
    if (cmd === "plugin:image|from_app_icon_resource") return -1;
  });
  await assert.rejects(
    () => Image.fromAppIconResource(),
    /Windows-only/,
  );
  clearMocks();
});

test("core routes the command to the image controller", async () => {
  const { mock } = buildApp();
  const rid = (await mock.main.invoke(
    "plugin:image|from_app_icon_resource",
    {},
  )) as number;
  assert.equal(typeof rid, "number");
  assert.ok(
    mock.imageLog.some((l) => l.kind === "app-icon"),
    "image controller not hit",
  );
});
