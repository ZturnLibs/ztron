/**
 * Window effects API tests (tauri 2.12 Liquid Glass alignment):
 * new Effect enum values + Effects.interactive/color passthrough.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mockIPC, clearMocks } from "@zturnlibs/ztron-api/mocks";
import { Window, Effect } from "@zturnlibs/ztron-api";
import type { Effects } from "@zturnlibs/ztron-api";

/* mocks target a DOM runtime: give node:test a minimal window. */
(globalThis as { window?: unknown }).window = globalThis;

test("Effect enum exposes LiquidGlassRegular/Clear (tauri 2.12)", () => {
  assert.equal(Effect.LiquidGlassRegular, "liquidGlassRegular");
  assert.equal(Effect.LiquidGlassClear, "liquidGlassClear");
});

test("setEffects passes liquid glass + interactive + color through", async () => {
  const calls: { cmd: string; args: Record<string, unknown> }[] = [];
  mockIPC((cmd, args) => {
    calls.push({ cmd, args: args as Record<string, unknown> });
  });
  const effects: Effects = {
    effects: [Effect.LiquidGlassRegular, Effect.Sidebar],
    interactive: true,
    color: "#334455",
    radius: 12,
  };
  await Window.getCurrent().setEffects(effects);
  clearMocks();
  assert.equal(calls.length, 1);
  const { cmd, args } = calls[0]!;
  assert.equal(cmd, "plugin:window|set_effects");
  const value = args.value as Record<string, unknown>;
  assert.deepEqual(value.effects, ["liquidGlassRegular", "sidebar"]);
  assert.equal(value.interactive, true);
  assert.equal(value.color, "#334455");
  assert.equal(value.radius, 12);
});

test("setFullscreenOnMonitor invokes with monitor position (tauri 2.12)", async () => {
  const calls: { cmd: string; args: { label: string; position: { x: number; y: number } } }[] = [];
  mockIPC((cmd, args) => {
    calls.push({
      cmd,
      args: args as { label: string; position: { x: number; y: number } },
    });
  });
  await Window.getCurrent().setFullscreenOnMonitor({ x: -1920, y: 0 });
  clearMocks();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.cmd, "plugin:window|set_fullscreen_on_monitor");
  assert.deepEqual(calls[0]!.args.position, { x: -1920, y: 0 });
});
