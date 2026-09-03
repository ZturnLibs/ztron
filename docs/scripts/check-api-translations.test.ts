/** Unit tests for the zh api-translation coverage gate (pure key diff). */
import test from "node:test";
import assert from "node:assert/strict";
import { diffTranslationKeys } from "./check-api-translations.ts";

test("empty used and empty defined produce no missing/orphans", () => {
  const d = diffTranslationKeys(new Set(), {});
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.orphans, []);
});

test("used key without a JSON entry is missing", () => {
  const d = diffTranslationKeys(new Set(["fs.readFile"]), {
    "fs.writeFile": {},
  });
  assert.deepEqual(d.missing, ["fs.readFile"]);
  // fs.writeFile is defined but never encountered — an orphan as well.
  assert.deepEqual(d.orphans, ["fs.writeFile"]);
});

test("JSON key never encountered is an orphan", () => {
  const d = diffTranslationKeys(new Set(["fs.readFile"]), {
    "fs.readFile": {},
    "path.resolve": {},
  });
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.orphans, ["path.resolve"]);
});

test("both sides report in sorted order for stable output", () => {
  const used = new Set(["event.emit", "core.invoke", "fs.readFile"]);
  const defined = {
    "fs.readFile": {},
    "a.old": {},
    "core.invoke": {},
    "z.last": {},
  };
  const d = diffTranslationKeys(used, defined);
  assert.deepEqual(d.missing, ["event.emit"]);
  assert.deepEqual(d.orphans, ["a.old", "z.last"]);
});

test("entry value shape is irrelevant (only key presence matters)", () => {
  const d = diffTranslationKeys(new Set(["core.invoke"]), {
    "core.invoke": { summary: "向底层发送消息。", params: { cmd: "命令名。" } },
  });
  assert.deepEqual(d.missing, []);
  assert.deepEqual(d.orphans, []);
});

test("coverage accounting: covered = used ∩ defined", () => {
  const used = new Set(["a", "b", "c"]);
  const defined = { b: {}, d: {} };
  const d = diffTranslationKeys(used, defined);
  // covered (1) = used(3) - missing(2)
  assert.equal(3 - d.missing.length, 1);
});
