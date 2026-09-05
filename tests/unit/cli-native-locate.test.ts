/** native-locate: env overrides + walk-up resolution (shared by dev/build/doctor). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
} from "../../packages/cli/dist/native-locate.js";

function tmpProject(): string {
  return mkdtempSync(join(tmpdir(), "ztron-nl-"));
}

test("findNativeFile walks up to native/libs", () => {
  const root = tmpProject();
  const deep = join(root, "a", "b", "proj");
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "native", "libs", "ztron-host"), "#!/bin/sh\n");
  assert.equal(findNativeFile(deep, "ztron-host"), join(root, "native", "libs", "ztron-host"));
  assert.equal(findNativeFile(root, "missing"), undefined);
  rmSync(root, { recursive: true, force: true });
});

test("findTjs prefers ZTRON_TJS, then PATH probe, else throws", () => {
  const fake = join(tmpProject(), "tjs-fake");
  writeFileSync(fake, "#!/bin/sh\n");
  process.env.ZTRON_TJS = fake;
  assert.equal(findTjs(), fake);
  const saved = process.env.ZTRON_TJS;
  delete process.env.ZTRON_TJS;
  // PATH probe of a non-existent name fails -> throws with install hint.
  const savedPath = process.env.PATH;
  process.env.PATH = "/nonexistent-ztron-path";
  assert.throws(() => findTjs(), /txiki\.js runtime/);
  process.env.PATH = savedPath;
  process.env.ZTRON_TJS = saved;
});

test("findHostBin: env wins over walk-up; findWebviewLib picks platform name", () => {
  const root = tmpProject();
  const deep = join(root, "proj");
  mkdirSync(join(root, "native", "libs"), { recursive: true });
  mkdirSync(deep, { recursive: true });
  writeFileSync(join(root, "native", "libs", "ztron-host"), "x");
  const libName =
    process.platform === "darwin"
      ? "libwebview.dylib"
      : process.platform === "win32"
        ? "webview.dll"
        : "libwebview.so";
  writeFileSync(join(root, "native", "libs", libName), "x");
  const envHost = join(tmpProject(), "elsewhere-host");
  writeFileSync(envHost, "x");
  process.env.ZTRON_HOST_BIN = envHost;
  assert.equal(findHostBin(deep), envHost);
  delete process.env.ZTRON_HOST_BIN;
  assert.equal(findHostBin(deep), join(root, "native", "libs", "ztron-host"));
  assert.equal(findWebviewLib(deep), join(root, "native", "libs", libName));
  rmSync(root, { recursive: true, force: true });
  rmSync(envHost, { recursive: true, force: true });
});
