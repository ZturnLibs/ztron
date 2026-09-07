/** CLI usage contract: version/help/exit codes + shebang regression (Volta ENOEXEC). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// fileURLToPath (not .pathname): .pathname yields "/D:/..." on Windows.
const CLI = fileURLToPath(new URL("../../packages/cli/dist/index.js", import.meta.url));
const PKG = JSON.parse(
  readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
) as { version: string };

test("dist/index.js starts with the node shebang (ENOEXEC regression)", () => {
  const first = readFileSync(CLI, "utf8").split("\n")[0];
  assert.equal(first, "#!/usr/bin/env node");
});

test("version / --version / -v print the package version, exit 0", () => {
  for (const args of [["version"], ["--version"], ["-v"]]) {
    const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `exit code for: ztron ${args.join(" ")}`);
    assert.match(r.stdout, new RegExp(`^ztron ${PKG.version.replace(/\./g, "\\.")}\\s*$`));
  }
});

test("bare ztron prints usage, exit 0 (no surprise dev)", () => {
  const r = spawnSync(process.execPath, [CLI], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage/);
});

test("--help prints usage, exit 0; <cmd> --help shows that command", () => {
  const h = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(h.status, 0);
  assert.match(h.stdout, /Usage/);
  const d = spawnSync(process.execPath, [CLI, "dev", "--help"], { encoding: "utf8" });
  assert.equal(d.status, 0);
  assert.match(d.stdout, /ztron dev/);
});

test("unknown command: exit 2, did-you-mean suggestion on stderr", () => {
  const r = spawnSync(process.execPath, [CLI, "doctr"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /未知命令/);
  assert.match(r.stderr, /doctor/);
});
