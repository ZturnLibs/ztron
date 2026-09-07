/** normalizeRelativeMarkdown: rspress resolves bare `x.md` links at site root. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRelativeMarkdown } from "./gen-api-docs.ts";

test("prefixes bare relative .md links with ./", () => {
  assert.equal(
    normalizeRelativeMarkdown("- [fs](fs.md)"),
    "- [fs](./fs.md)",
  );
  assert.equal(
    normalizeRelativeMarkdown("[window](window.md#readfile)"),
    "[window](./window.md#readfile)",
  );
});

test("leaves ./ / and external links untouched", () => {
  const md = "[a](./fs.md) [b](/fs.md) [c](https://example.com/x.md) [d](#anchor)";
  assert.equal(normalizeRelativeMarkdown(md), md);
});

test("idempotent and covers the real modules list shape", () => {
  const md = "- [app](app.md)\n- [webview-window](webview-window.md)\n";
  const once = normalizeRelativeMarkdown(md);
  assert.equal(normalizeRelativeMarkdown(once), once);
  assert.match(once, /\(\.\/app\.md\)/);
  assert.match(once, /\(\.\/webview-window\.md\)/);
});
