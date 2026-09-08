/**
 * Packaged-app chain regressions — found by running the FULL user flow
 * against a real `npm i -g @zturnlibs/ztron-cli` install (init → dev →
 * build → launch the .app). Four defects shipped in 0.3.5:
 *
 *   1. the IIFE script rewrite dropped `defer`, so classic head scripts
 *      ran before <body> existed (React error #299 → white window);
 *   2. the shell launcher fallback exec'd MacOS/ztron-backend while the
 *      backend is staged in Resources (tjs binaries fail codesign strict
 *      validation, so they must stay outside the signature chain) — the
 *      packaged app could not start at all;
 *   3. the launcher never forwarded ZTRON_CONF / capabilities, so the
 *      packaged app silently lost every declared window;
 *   4. the C launcher source (native/host/launcher_macos.c) is not part
 *      of the published tarball, so every npm user silently degraded to
 *      the shell fallback.
 *
 * These tests pin the packaging contracts that the e2e run exposed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  finalizeFrontendHtml,
  findLauncherSource,
  launcherScript,
  stageAppResources,
} from "../../packages/cli/dist/packaging.js";
import { TEMPLATES } from "../../packages/cli/dist/templates.js";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

// ---- Bug: IIFE rewrite must emit defer ---------------------------------

test("frontend html: module scripts rewrite to classic+defer (head scripts must wait for <body>)", () => {
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<script type="module" crossorigin src="./assets/index.js"></script>` +
    `</head><body><div id="root"></div></body></html>`;
  const out = finalizeFrontendHtml(html, "default-src 'self'");
  assert.match(out, /<script defer src="\.\/assets\/index\.js"><\/script>/);
  assert.doesNotMatch(out, /type="module"/);
});

test("frontend html: vite 6 emits the IIFE entry as a classic script — defer is added", () => {
  // With rollupOptions output.format=iife, vite 6 writes a classic
  // <script src> (no type="module" to rewrite). A classic head script runs
  // before <body> is parsed — React error #299, white packaged window.
  const html =
    `<!doctype html><html><head>` +
    `<script>;(function(){var k="x"})();</script>` +
    `<script src="./assets/index.js"></script>` +
    `</head><body><div id="root"></div></body></html>`;
  const out = finalizeFrontendHtml(html, "default-src 'self'");
  assert.match(out, /<script defer src="\.\/assets\/index\.js"><\/script>/);
  // the inline bootstrap must stay sync (it is self-contained)
  assert.match(out, /<script>;\(function\(\)/);
});

test("frontend html: rewrite tolerates a module script without crossorigin", () => {
  const html =
    `<html><head><script type="module" src="./a.js"></script></head></html>`;
  const out = finalizeFrontendHtml(html, "default-src 'self'");
  assert.match(out, /<script defer src="\.\/a\.js"><\/script>/);
});

test("frontend html: CSP meta injected when absent, kept when present", () => {
  const without = finalizeFrontendHtml(
    `<html><head><title>t</title></head></html>`,
    "default-src 'self'",
  );
  assert.match(
    without,
    /<head><meta http-equiv="Content-Security-Policy" content="default-src 'self'">/,
  );
  const withCsp = finalizeFrontendHtml(
    `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'"></head></html>`,
    "default-src 'self'",
  );
  assert.equal(
    withCsp.match(/Content-Security-Policy/g)?.length,
    1,
    "existing CSP meta must not be duplicated",
  );
});

// ---- Bug: shell launcher backend path + config forwarding ---------------

test("launcher fallback execs the backend from Resources, never MacOS", () => {
  const sh = launcherScript("test-key");
  assert.match(sh, /"\$RES\/ztron-backend"/);
  assert.doesNotMatch(sh, /"\$DIR\/ztron-backend"/);
});

test("launcher fallback forwards ZTRON_CONF from Resources", () => {
  const sh = launcherScript("test-key");
  // exports must reach the backend process: set -a (or explicit export)
  assert.match(sh, /set -a/);
  assert.match(sh, /ZTRON_CONF="\$\(cat "\$RES\/ztron\.conf\.json"\)"/);
});

test("launcher fallback points ZTRON_CAPABILITIES_DIR at staged capabilities", () => {
  const sh = launcherScript("test-key");
  assert.match(
    sh,
    /\[ -d "\$RES\/capabilities" \] && ZTRON_CAPABILITIES_DIR="\$RES\/capabilities"/,
  );
});

// ---- Bug: launcher source must ship in the npm tarball ------------------

test("CLI package ships native/host/launcher_macos.c (npm users must not silently lose the C launcher)", () => {
  const pkg = JSON.parse(
    readFileSync(join(REPO_ROOT, "packages/cli/package.json"), "utf8") as string,
  ) as { files: string[] };
  assert.ok(
    pkg.files.includes("native"),
    "packages/cli package.json files[] must include 'native'",
  );
  assert.ok(
    existsSync(join(REPO_ROOT, "packages/cli/native/host/launcher_macos.c")),
    "packages/cli/native/host/launcher_macos.c must exist (committed copy)",
  );
});

test("shipped launcher source stays in sync with native/host", () => {
  const vendored = readFileSync(
    join(REPO_ROOT, "native/host/launcher_macos.c"),
    "utf8",
  );
  const shipped = readFileSync(
    join(REPO_ROOT, "packages/cli/native/host/launcher_macos.c"),
    "utf8",
  );
  assert.equal(shipped, vendored, "launcher copies drifted — re-sync them");
});

test("findLauncherSource resolves inside the repo workspace", () => {
  const found = findLauncherSource();
  assert.ok(found && existsSync(found));
});

// ---- Bug: packaged app must carry conf + capabilities -------------------

test("stageAppResources writes ztron.conf.json and copies capabilities", () => {
  const res = mkdtempSync(join(tmpdir(), "ztron-stage-"));
  const caps = mkdtempSync(join(res, "caps-src-"));
  writeFileSync(join(caps, "default.json"), '{"x":1}');

  stageAppResources(res, { identifier: "com.example.app" }, caps);
  const conf = JSON.parse(
    readFileSync(join(res, "ztron.conf.json"), "utf8") as string,
  );
  assert.equal(
    (conf as { identifier: string }).identifier,
    "com.example.app",
  );
  assert.equal(
    readFileSync(join(res, "capabilities/default.json"), "utf8"),
    '{"x":1}',
  );
  rmSync(res, { recursive: true, force: true });
});

test("stageAppResources tolerates a missing capabilities dir", () => {
  const res = mkdtempSync(join(tmpdir(), "ztron-stage-nocaps-"));
  stageAppResources(res, {}, null);
  assert.ok(!existsSync(join(res, "capabilities")));
  assert.ok(existsSync(join(res, "ztron.conf.json")));
  rmSync(res, { recursive: true, force: true });
});

// ---- vanilla template: the check/smoke beacon ---------------------------

test("vanilla template emits a frontend-derived check tag and self-exits in check mode", () => {
  const main = TEMPLATES.vanilla("demo")["src/main.ts"];
  assert.ok(main, "vanilla template must define src/main.ts");
  // The frontend invokes `hello` on load; the backend logs the bare tag so
  // `ztron check --expect HELLO_OK` and the packaged-app smoke can assert
  // "webview executed the bundle" end-to-end.
  assert.match(main, /HELLO_OK/);
  assert.match(main, /ZTRON_CHECK/);
});

test("vanilla template wires the CLI's invoke key (AppBuilder default is random)", () => {
  // Without .configure({invokeKey: ZTRON_INVOKE_KEY}) the backend boots with
  // its own random key (app.ts default) while the CLI bakes a different key
  // into the frontend bootstrap — every scaffolded frontend invoke is then
  // silently rejected (found via `ztron check --expect HELLO_OK` timing out).
  const main = TEMPLATES.vanilla("demo")["src/main.ts"];
  assert.match(
    main,
    /configure\(\{\s*\n\s*invokeKey: tjs\.env\.ZTRON_INVOKE_KEY/,
  );
});

// ---- build-native.sh: upstream pins are load-bearing ---------------------

test("build-native.sh pins tjs/webview upstreams and fails loudly on patch drift", () => {
  const sh = readFileSync(join(REPO_ROOT, "scripts/build-native.sh"), "utf8");
  // Unpinned `--depth 1` clones shipped a libwebview whose scripts never
  // executed (0.3.5). The refs below are the known-good local builds.
  assert.match(sh, /TJS_REF="c3587a7[0-9a-f]*"/);
  assert.match(sh, /WEBVIEW_REF="cbbdee4[0-9a-f]*"/);
  assert.match(sh, /--no-checkout/, "sha pins require clone --no-checkout");
  // Patch application must be fatal, never a silent `|| echo` fallback.
  assert.match(sh, /FATAL/);
});
