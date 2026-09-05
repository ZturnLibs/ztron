/** `ztron init` prints next-step guidance incl. native-chain reminder. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath (not .pathname): .pathname yields "/D:/..." on Windows.
const CLI = fileURLToPath(new URL("../../packages/cli/dist/index.js", import.meta.url));

test("init prints next steps with ZTRON_* hint outside a native repo", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztron-init-"));
  const r = spawnSync(process.execPath, [CLI, "init", join(dir, "my-app")], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /next steps/i);
  assert.match(r.stdout, /ZTRON_TJS/);
  assert.match(r.stdout, /ztron dev/);
  assert.match(r.stdout, /ztron doctor/);
  rmSync(dir, { recursive: true, force: true });
});
