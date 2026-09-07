/** CLI maturity: completions, info report, doctor --json, update notifier. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMAND_HELP, CLI_VERSION } from "../../packages/cli/dist/usage.js";
import {
  COMPLETION_SPEC,
  SUPPORTED_SHELLS,
  renderCompletions,
} from "../../packages/cli/dist/completions.js";
import {
  fetchLatest,
  refreshCache,
  resolveNotice,
  shouldRun,
} from "../../packages/cli/dist/update-notifier.js";

const CLI = fileURLToPath(new URL("../../packages/cli/dist/index.js", import.meta.url));

test("completions spec stays in sync with COMMAND_HELP", () => {
  assert.deepEqual(
    Object.keys(COMPLETION_SPEC.commands).sort(),
    Object.keys(COMMAND_HELP).sort(),
  );
});

test("completions: every supported shell lists every command", () => {
  for (const shell of SUPPORTED_SHELLS) {
    const r = spawnSync(process.execPath, [CLI, "completions", shell], { encoding: "utf8" });
    assert.equal(r.status, 0, `exit for ${shell}`);
    for (const cmd of Object.keys(COMPLETION_SPEC.commands)) {
      assert.ok(r.stdout.includes(cmd), `${shell} completion missing "${cmd}"`);
    }
  }
});

test("completions: renderCompletions is pure and shell-gated", () => {
  assert.match(renderCompletions("zsh") ?? "", /#compdef ztron/);
  assert.equal(renderCompletions("tcsh"), undefined);
});

test("completions: unknown shell exits 2 with supported list", () => {
  const r = spawnSync(process.execPath, [CLI, "completions", "tcsh"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /bash \| zsh \| fish \| powershell/);
});

test("info: grouped report with chain resolution, exit 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztron-info-"));
  const r = spawnSync(process.execPath, [CLI, "info"], { encoding: "utf8", cwd: dir });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Environment/);
  assert.match(r.stdout, /Native chain/);
  assert.match(r.stdout, /Project/);
  assert.match(r.stdout, /ztron\.conf\.json\s+absent/);
  rmSync(dir, { recursive: true, force: true });
});

test("doctor --json: machine-readable 7-check report, exit 1 when unhealthy", () => {
  const dir = mkdtempSync(join(tmpdir(), "ztron-dj-"));
  const r = spawnSync(process.execPath, [CLI, "doctor", "--json"], { encoding: "utf8", cwd: dir });
  assert.equal(r.status, 1); // tmp dir has no native chain
  const report = JSON.parse(r.stdout) as { checks: unknown[]; ok: boolean };
  assert.equal(report.checks.length, 7);
  assert.equal(report.ok, false);
  rmSync(dir, { recursive: true, force: true });
});

test("notifier: guards disable non-interactive/CI/opted-out runs", () => {
  assert.equal(shouldRun({ CI: "1" }, true), false);
  assert.equal(shouldRun({ ZTRON_NO_UPDATE_NOTIFIER: "1" }, true), false);
  assert.equal(shouldRun({}, false), false);
  assert.equal(shouldRun({}, true), true);
});

test("notifier: notice resolves only for a fresh, newer cache", () => {
  const now = 1_000_000_000_000;
  assert.match(resolveNotice({ lastCheck: now - 1000, latest: "9.9.9" }, "1.0.0", now) ?? "", /9\.9\.9/);
  assert.equal(resolveNotice({ lastCheck: now - 1000, latest: "1.0.0" }, "1.0.0", now), null);
  assert.equal(
    resolveNotice({ lastCheck: now - 8 * 24 * 60 * 60 * 1000, latest: "9.9.9" }, "1.0.0", now),
    null,
  );
  assert.equal(resolveNotice(undefined, "1.0.0", now), null);
});

test("notifier: fetchLatest returns registry version, undefined on failure", async () => {
  const ok = (async () => new Response(JSON.stringify({ version: "2.0.0" }))) as unknown as typeof fetch;
  assert.equal(await fetchLatest("@zturnlibs/ztron-cli", ok), "2.0.0");
  const offline = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await fetchLatest("@zturnlibs/ztron-cli", offline), undefined);
});

test("notifier: refreshCache persists latest to the cache file", async () => {
  const ok = (async () => new Response(JSON.stringify({ version: "2.0.0" }))) as unknown as typeof fetch;
  const cachePath = join(mkdtempSync(join(tmpdir(), "ztron-uc-")), "uc.json");
  await refreshCache(cachePath, "@zturnlibs/ztron-cli", "1.0.0", ok, 1_000_000_000_000);
  const raw = JSON.parse(readFileSync(cachePath, "utf8")) as { lastCheck: number; latest: string };
  assert.equal(raw.latest, "2.0.0");
  assert.equal(raw.lastCheck, 1_000_000_000_000);
});

test("version source remains package.json (single source of truth)", () => {
  const pkg = JSON.parse(
    readFileSync(new URL("../../packages/cli/package.json", import.meta.url), "utf8"),
  ) as { version: string };
  assert.equal(CLI_VERSION, pkg.version);
});
