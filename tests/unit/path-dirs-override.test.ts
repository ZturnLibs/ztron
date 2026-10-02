/**
 * appDirectoriesOverride (tauri 2.12 7dbfc1fe5 alignment): portable-app
 * directory overrides for the app_* path APIs. Root semantics, per-dir
 * overrides, $VARIABLE prefixes (allowlist), and defaults.
 */
import test from "node:test";
import { installTjs } from "../helpers/tjs-stub.ts";

installTjs(); /* $HOME resolution reads tjs.homeDir */
import assert from "node:assert/strict";
import {
  resolveAppDirs,
  type PlatformDirs,
  type AppDirectoriesOverride,
} from "../../packages/core/dist/index.js";

const base: PlatformDirs = {
  appDataDir: "/home/u/Library/Application Support/com.example.app",
  appConfigDir: "/home/u/Library/Application Support/com.example.app",
  appCacheDir: "/home/u/Library/Caches/com.example.app",
  appLocalDataDir: "/home/u/Library/Application Support/com.example.app",
  appLogDir: "/home/u/Library/Logs/com.example.app",
  baselineDir: "/home/u/Library/Application Support/com.example.app/baseline",
  dataDir: "/home/u/Library/Application Support",
  configDir: "/home/u/Library/Preferences",
  cacheDir: "/home/u/Library/Caches",
  fontDir: "/home/u/Library/Fonts",
  desktopDir: "/home/u/Desktop",
  documentDir: "/home/u/Documents",
  downloadDir: "/home/u/Downloads",
  pictureDir: "/home/u/Pictures",
  audioDir: "/home/u/Music",
  videoDir: "/home/u/Movies",
  publicDir: "/home/u/Public",
  templateDir: "/home/u/Templates",
  runtimeDir: "/tmp",
  executableDir: "/home/u/bin",
  resourceDir: "/home/u/bin",
};

test("root override: config/data/localData -> root, cache -> caches, log -> logs", () => {
  const out = resolveAppDirs(base, "/portable/app");
  assert.equal(out.appDataDir, "/portable/app");
  assert.equal(out.appConfigDir, "/portable/app");
  assert.equal(out.appLocalDataDir, "/portable/app");
  assert.equal(out.appCacheDir, "/portable/app/caches");
  assert.equal(out.appLogDir, "/portable/app/logs");
  /* non-app dirs untouched */
  assert.equal(out.desktopDir, "/home/u/Desktop");
});

test("per-dir override: only listed dirs change", () => {
  const out = resolveAppDirs(base, {
    data: "/custom/data",
    cache: "/custom/cache",
  });
  assert.equal(out.appDataDir, "/custom/data");
  assert.equal(out.appCacheDir, "/custom/cache");
  assert.equal(out.appConfigDir, base.appConfigDir);
  assert.equal(out.appLogDir, base.appLogDir);
  assert.equal(out.appLocalDataDir, base.appLocalDataDir);
});

test("$VARIABLE prefix resolves against the platform base dirs", () => {
  const out = resolveAppDirs(base, "$DESKTOP/myapp");
  assert.equal(out.appDataDir, "/home/u/Desktop/myapp");
  assert.equal(out.appCacheDir, "/home/u/Desktop/myapp/caches");
  assert.equal(out.appLogDir, "/home/u/Desktop/myapp/logs");
});

test("$DATA and $HOME also allowed", () => {
  assert.equal(
    resolveAppDirs(base, "$DATA/shared").appDataDir,
    "/home/u/Library/Application Support/shared",
  );
  assert.equal(resolveAppDirs(base, "$HOME/x").appDataDir, "/home/tester/x");
});

test("unknown $VARIABLE throws (tauri allowlist)", () => {
  assert.throws(() => resolveAppDirs(base, "$RESOURCE/x"), /\$RESOURCE/);
  assert.throws(() => resolveAppDirs(base, "$APPDATA/x"), /\$APPDATA/);
});

test("undefined override keeps defaults (identity)", () => {
  const out = resolveAppDirs(base, undefined);
  assert.deepEqual(out, base);
});
