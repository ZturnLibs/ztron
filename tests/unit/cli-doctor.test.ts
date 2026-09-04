/** `ztron doctor` — environment check for newcomers (all-pass / missing chains). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runDoctor } from "../../packages/cli/dist/doctor.js";

function nativeRepo(): string {
  const root = mkdtempSync(join(tmpdir(), "ztron-doc-"));
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  for (const f of ["tjs", "ztron-host", "libwebview.dylib", "webview.dll", "libwebview.so"]) {
    writeFileSync(join(root, "native", "libs", f), "x");
  }
  return root;
}

const CLEAN_ENV = { PATH: "/nonexistent-ztron-path" } as NodeJS.ProcessEnv;

test("doctor: all pass when chain is discoverable", () => {
  const repo = nativeRepo();
  const r = runDoctor({ cwd: repo, env: { ...CLEAN_ENV, ZTRON_TJS: join(repo, "native/libs/tjs") }, platform: "darwin" });
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 5);
  for (const c of r.checks) assert.equal(c.pass, true, `${c.name}: ${c.detail}`);
  rmSync(repo, { recursive: true, force: true });
});

test("doctor: missing host+tjs fails with hints, ok=false", () => {
  const empty = mkdtempSync(join(tmpdir(), "ztron-doc0-"));
  const r = runDoctor({ cwd: empty, env: CLEAN_ENV, platform: "darwin" });
  assert.equal(r.ok, false);
  const byName = Object.fromEntries(r.checks.map((c) => [c.name, c]));
  assert.equal(byName["tjs runtime"].pass, false);
  assert.match(byName["tjs runtime"].hint, /build-native\.sh/);
  assert.equal(byName["ztron-host"].pass, false);
  assert.equal(byName["webview library"].pass, false);
  assert.equal(byName["node >= 20"].pass, true);
  rmSync(empty, { recursive: true, force: true });
});

test("doctor: non-macOS platform yields a warning check", () => {
  const repo = nativeRepo();
  const r = runDoctor({ cwd: repo, env: { ...CLEAN_ENV, ZTRON_TJS: join(repo, "native/libs/tjs") }, platform: "linux" });
  const platform = r.checks.find((c) => c.name === "platform");
  assert.ok(platform);
  assert.equal(platform.pass, true); // warning, not failure
  assert.match(platform.detail, /skeleton|骨架/);
  rmSync(repo, { recursive: true, force: true });
});
