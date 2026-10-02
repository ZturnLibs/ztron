/**
 * Scope coverage — exhaustive PathScope + HttpScope behavior.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PathScope, HttpScope } from "../../packages/core/dist/index.js";
import { installTjs } from "../helpers/tjs-stub.ts";

test("PathScope: allow/deny + \$VAR expansion", async () => {
  const tjs = installTjs({ "/tmp/ztron-test/a.txt": "x" });
  const scope = new PathScope({ allow: ["$TMP/**"], deny: ["$TMP/secret/**"] });

  assert.equal(await scope.check("$TMP/a.txt"), "/tmp/ztron-test/a.txt");
  await assert.rejects(() => scope.check("$TMP/secret/x.txt"));
  await assert.rejects(() => scope.check("/etc/passwd"));
  assert.equal(await scope.tryCheck("$TMP/a.txt"), "/tmp/ztron-test/a.txt");
  assert.equal(await scope.tryCheck("/etc/passwd"), null);
});

test("PathScope: addAllow grows the scope at runtime", async () => {
  const tjs = installTjs();
  const scope = new PathScope({ allow: ["$TMP/**"] });
  await assert.rejects(() => scope.check("/home/tester/x.txt"));
  scope.addAllow("$HOME/**");
  assert.equal(await scope.check("/home/tester/x.txt"), "/home/tester/x.txt");
  assert.ok(scope.serializeAllow().some((p) => p.includes("/home/tester")));
});

/** Pins navigator.platform for the duration of fn (installTjs resets it). */
function withPlatform(platform: string, fn: () => void | Promise<void>) {
  Object.defineProperty(globalThis.navigator, "platform", {
    value: platform,
    configurable: true,
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      installTjs(); // resets navigator.platform to the macOS default
    });
}

test("PathScope: Windows drive letters + backslash separators", async () => {
  const tjs = installTjs();
  tjs.homeDir = "C:\\Users\\tester";
  tjs.tmpDir = "C:\\Users\\tester\\AppData\\Local\\Temp";
  // installTjs pins navigator.platform to macOS; override after it.
  await withPlatform("Win32", async () => {
    const scope = new PathScope({ allow: ["$TMP/**"] });
    // $TMP expands to a backslash path; it must resolve in-scope, not be
    // joined onto cwd (the pre-fix behavior: ENOENT on the garbage path).
    assert.equal(
      await scope.check("$TMP/a.txt"),
      "C:/Users/tester/AppData/Local/Temp/a.txt",
    );
    // Backslash input with mismatched drive-letter case is still in-scope
    // (Windows comparisons fold case; the real path keeps its own case).
    assert.equal(
      await scope.check("c:\\users\\tester\\appdata\\local\\temp\\b.txt"),
      "c:/users/tester/appdata/local/temp/b.txt",
    );
    await assert.rejects(() => scope.check("D:/other/x.txt"));
  });
});

test("HttpScope: scheme/host/port/path matching", async () => {
  const scope = new HttpScope({
    allow: [{ url: "https://api.example.com/v1/**" }],
  });
  assert.equal(scope.permits("https://api.example.com/v1/users"), true);
  assert.equal(scope.permits("https://api.example.com/v1/users/1/posts"), true);
  assert.equal(scope.permits("https://api.example.com/other"), false);
  assert.equal(scope.permits("http://api.example.com/v1/users"), false);
  assert.equal(scope.permits("https://evil.com/v1/users"), false);
});

test("HttpScope: subdomain wildcard", async () => {
  const scope = new HttpScope({ allow: [{ url: "https://*.example.com/*" }] });
  assert.equal(scope.permits("https://a.example.com/x"), true);
  assert.equal(scope.permits("https://a.b.example.com/x"), true);
  assert.equal(scope.permits("https://example.com/x"), false);
});

test("HttpScope: port wildcard", async () => {
  const scope = new HttpScope({ allow: [{ url: "http://localhost:*/*" }] });
  assert.equal(scope.permits("http://localhost:8080/x"), true);
  assert.equal(scope.permits("http://localhost:9999/echo"), true);
  assert.equal(scope.permits("https://localhost:8080/x"), false);
});

test("HttpScope: trailing `*` matches the root path (glob semantics)", async () => {
  const scope = new HttpScope({ allow: [{ url: "https://api.example.com/*" }] });
  assert.equal(scope.permits("https://api.example.com/"), true);
  assert.equal(scope.permits("https://api.example.com/users"), true);
  assert.equal(scope.permits("https://api.example.com/users/1"), false);
});

test("HttpScope: deny wins over allow", async () => {
  const scope = new HttpScope({
    allow: [{ url: "https://api.example.com/*" }],
    deny: [{ url: "https://api.example.com/admin/**" }],
  });
  assert.equal(scope.permits("https://api.example.com/users"), true);
  assert.equal(scope.permits("https://api.example.com/admin/keys"), false);
});

test("HttpScope: empty allowlist denies everything", async () => {
  const scope = new HttpScope({ allow: [] });
  assert.equal(scope.permits("https://example.com"), false);
});
