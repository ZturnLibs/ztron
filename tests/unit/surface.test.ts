/**
 * Surface coverage — asserts the framework registers EXACTLY the commands in
 * the manifest (no missing, no extra) and that @zturnlibs/ztron-api exports every value
 * the manifest lists.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../helpers/buildApp.ts";
import { COMMAND_SET, API_EXPORT_SET } from "../helpers/manifest.ts";
import * as api from "../../packages/api/dist/index.js";

test("surface: the app registers every manifest command (and nothing else)", () => {
  const { app } = buildApp();
  const registered = new Set(app.commands.list());

  const missing = [...COMMAND_SET].filter((c) => !registered.has(c));
  assert.deepEqual(missing, [], `missing commands: ${missing.join(", ")}`);

  const extra = [...registered].filter((c) => !COMMAND_SET.has(c));
  assert.deepEqual(extra, [], `unexpected commands: ${extra.join(", ")}`);
});

test("surface: @zturnlibs/ztron-api exports every manifest value", () => {
  const missing = [...API_EXPORT_SET].filter((name) => !(name in api));
  assert.deepEqual(missing, [], `missing api exports: ${missing.join(", ")}`);

  // Every export must be a function or a namespace object (not undefined).
  for (const name of API_EXPORT_SET) {
    const v = (api as unknown as Record<string, unknown>)[name];
    assert.ok(v !== undefined, `api export ${name} is undefined`);
  }
});

test("surface: command manifest has no duplicates", () => {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of COMMAND_SET) {
    if (seen.has(c)) dups.push(c);
    seen.add(c);
  }
  assert.deepEqual(dups, []);
});

test("surface: api manifest has no duplicates", () => {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const c of API_EXPORT_SET) {
    if (seen.has(c)) dups.push(c);
    seen.add(c);
  }
  assert.deepEqual(dups, []);
});
