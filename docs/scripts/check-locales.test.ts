/** Unit tests for the zh/en parity checker. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffTrees, findPlaceholders } from "./check-locales.ts";

test("identical trees produce no diffs", () => {
  const d = diffTrees(["index.md", "start/_meta.json"], ["index.md", "start/_meta.json"]);
  assert.deepEqual(d.missingInEn, []);
  assert.deepEqual(d.missingInZh, []);
});

test("file in zh missing from en is reported", () => {
  const d = diffTrees(["index.md", "guide/ipc.md"], ["index.md"]);
  assert.deepEqual(d.missingInEn, ["guide/ipc.md"]);
  assert.deepEqual(d.missingInZh, []);
});

test("file in en missing from zh is reported", () => {
  const d = diffTrees(["index.md"], ["index.md", "orphan.md"]);
  assert.deepEqual(d.missingInZh, ["orphan.md"]);
});

test("generated reference/api subtree is exempt", () => {
  const d = diffTrees(["index.md", "reference/api/fs.md"], ["index.md"]);
  assert.deepEqual(d.missingInEn, []);
  assert.deepEqual(d.missingInZh, []);
});

test("findPlaceholders flags en pages carrying the marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "cl-test-"));
  try {
    mkdirSync(join(dir, "guide"), { recursive: true });
    writeFileSync(join(dir, "index.md"), "# Home\n");
    writeFileSync(join(dir, "guide", "ipc.md"), "<!-- i18n:untranslated -->\n# IPC\n");
    assert.deepEqual(findPlaceholders(dir, ["index.md", "guide/ipc.md"]), ["guide/ipc.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
