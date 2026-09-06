/**
 * `ztron init --template` — per-template scaffolds.
 *
 * Vanilla (default) output must stay byte-identical with the pre-template
 * behavior; `--template react-ts` codifies the pipeline-verified React 19 +
 * Tailwind v4 configuration from examples/react-demo (PR #20), minimized to
 * a runnable scaffold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// fileURLToPath (not .pathname): .pathname yields "/D:/..." on Windows.
const CLI = fileURLToPath(new URL("../../packages/cli/dist/index.js", import.meta.url));

function scaffold(name: string, ...args: string[]): string {
  const dir = join(tmpdir(), `ztron-t-${name}`);
  rmSync(dir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [CLI, "init", dir, ...args], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0, `init failed: ${r.stderr}`);
  return dir;
}

function read(dir: string, rel: string): string {
  return readFileSync(join(dir, rel), "utf8");
}

test("init default scaffolds the vanilla template (unchanged)", () => {
  const dir = scaffold("vanilla-default");
  for (const rel of [
    "package.json",
    "ztron.conf.json",
    "src/main.ts",
    "frontend/index.html",
    "frontend/src/main.ts",
  ]) {
    assert.ok(existsSync(join(dir, rel)), `missing ${rel}`);
  }
  // Vanilla-only markers: hello command, 800x600, no react/tsconfig.
  const pkg = JSON.parse(read(dir, "package.json"));
  assert.equal(pkg.dependencies["@zturnlibs/ztron-api"], "latest");
  assert.equal(pkg.dependencies.react, undefined);
  assert.equal(pkg.devDependencies.vite, undefined);
  assert.ok(existsSync(join(dir, "src/main.ts")));
  const conf = JSON.parse(read(dir, "ztron.conf.json"));
  assert.equal(conf.windows[0].width, 800);
  assert.equal(conf.windows[0].height, 600);
  assert.match(read(dir, "src/main.ts"), /app\.command\("hello"/);
  assert.match(read(dir, "frontend/index.html"), /My Ztron App/);
  assert.ok(!existsSync(join(dir, "tsconfig.json")));
  assert.ok(!existsSync(join(dir, "capabilities")));
  rmSync(dir, { recursive: true, force: true });
});

test("init --template vanilla equals the default output", () => {
  const a = scaffold("vanilla-flag");
  const b = scaffold("vanilla-default-cmp");
  for (const rel of [
    "ztron.conf.json",
    "src/main.ts",
    "frontend/index.html",
    "frontend/src/main.ts",
  ]) {
    assert.equal(read(a, rel), read(b, rel), `differs: ${rel}`);
  }
  // package.json: identical modulo `name` (derived from the target basename).
  const pa = JSON.parse(read(a, "package.json"));
  const pb = JSON.parse(read(b, "package.json"));
  assert.equal(pa.name, "ztron-t-vanilla-flag");
  assert.equal(pb.name, "ztron-t-vanilla-default-cmp");
  delete pa.name;
  delete pb.name;
  assert.deepEqual(pa, pb);
  rmSync(a, { recursive: true, force: true });
  rmSync(b, { recursive: true, force: true });
});

test("init --template react-ts writes the React 19 + Tailwind v4 scaffold", () => {
  const dir = scaffold("react", "--template", "react-ts");
  const expected = [
    "package.json",
    "tsconfig.json",
    "ztron.conf.json",
    "capabilities/default.json",
    "src/main.ts",
    "frontend/vite.config.ts",
    "frontend/index.html",
    "frontend/src/index.css",
    "frontend/src/main.tsx",
    "frontend/src/App.tsx",
  ];
  for (const rel of expected) {
    assert.ok(existsSync(join(dir, rel)), `missing ${rel}`);
  }

  // package.json: react deps + frontend toolchain + typecheck script.
  const pkg = JSON.parse(read(dir, "package.json"));
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  for (const dep of ["@zturnlibs/ztron-api", "@zturnlibs/ztron-core", "@zturnlibs/ztron-runtime-ffi", "react", "react-dom"]) {
    assert.equal(pkg.dependencies[dep], "latest", `dep ${dep}`);
  }
  for (const dep of [
    "@zturnlibs/ztron-cli",
    "vite",
    "@vitejs/plugin-react",
    "tailwindcss",
    "@tailwindcss/vite",
    "typescript",
    "@types/react",
    "@types/react-dom",
    "@types/node",
  ]) {
    assert.ok(pkg.devDependencies[dep], `devDep ${dep}`);
  }
  assert.match(pkg.devDependencies.vite, /^\^6/);
  assert.match(pkg.devDependencies.tailwindcss, /^\^4/);
  assert.match(pkg.devDependencies["@tailwindcss/vite"], /^\^4/);

  // tsconfig.json: standalone base (ES2022+DOM, react-jsx, strict, noEmit).
  const ts = JSON.parse(read(dir, "tsconfig.json"));
  assert.equal(ts.compilerOptions.jsx, "react-jsx");
  assert.equal(ts.compilerOptions.noEmit, true);
  assert.equal(ts.compilerOptions.strict, true);
  assert.deepEqual(ts.compilerOptions.lib, ["ES2022", "DOM", "DOM.Iterable"]);
  assert.deepEqual(ts.include, ["src", "frontend/src"]);

  // ztron.conf.json: frontend-driven window (url "frontend").
  const conf = JSON.parse(read(dir, "ztron.conf.json"));
  assert.equal(conf.entry, "src/main.ts");
  assert.equal(conf.frontend, "frontend");
  assert.equal(conf.identifier, "com.example.app");
  assert.equal(conf.windows[0].label, "main");
  assert.equal(conf.windows[0].title, "Ztron App");
  assert.equal(conf.windows[0].width, 1024);
  assert.equal(conf.windows[0].height, 680);
  assert.equal(conf.windows[0].url, "frontend");

  // capabilities/default.json: core:default on the main window.
  const cap = JSON.parse(read(dir, "capabilities/default.json"));
  assert.deepEqual(cap.windows, ["main"]);
  assert.ok(cap.permissions.includes("core:default"));

  // src/main.ts: HostRuntime + AppBuilder(configure/fromConfig) + typed greet.
  const main = read(dir, "src/main.ts");
  assert.match(main, /new HostRuntime/);
  assert.match(main, /await runtime\.connect\(\)/);
  assert.match(main, /backend connected/);
  assert.match(main, /configure\(/);
  assert.match(main, /loadCapabilities\(/);
  assert.match(main, /fromConfig\(conf/);
  assert.match(main, /commandDef\(greet\)/);
  assert.match(main, /defineCommand\("app:greet"/);

  // frontend: react + tailwind plugins, root div, StrictMode entry, css import.
  const vite = read(dir, "frontend/vite.config.ts");
  assert.match(vite, /react\(\)/);
  assert.match(vite, /tailwindcss\(\)/);
  const html = read(dir, "frontend/index.html");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\/src\/main.tsx"/);
  assert.match(html, /<title>Ztron App<\/title>/);
  assert.match(read(dir, "frontend/src/index.css"), /@import "tailwindcss";/);
  const tsx = read(dir, "frontend/src/main.tsx");
  assert.match(tsx, /StrictMode/);
  assert.match(tsx, /createRoot/);
  const app = read(dir, "frontend/src/App.tsx");
  assert.match(app, /invoke<string>\("app:greet", \{ name \}\)/);
  assert.match(app, /bg-neutral-950/);
  assert.match(app, /ztron codegen/); // codegen upgrade-path comment
  rmSync(dir, { recursive: true, force: true });
});

test("init --template react-ts prints template-aware next steps", () => {
  const dir = join(tmpdir(), "ztron-t-react-steps");
  rmSync(dir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [CLI, "init", dir, "--template", "react-ts"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /react-ts/);
  assert.match(r.stdout, /next steps/i);
  rmSync(dir, { recursive: true, force: true });
});

test("init --template bogus exits 1 listing valid templates", () => {
  const dir = join(tmpdir(), "ztron-t-bogus");
  rmSync(dir, { recursive: true, force: true });
  const r = spawnSync(process.execPath, [CLI, "init", dir, "--template", "bogus"], {
    encoding: "utf8",
  });
  assert.equal(r.status, 1);
  const out = r.stdout + r.stderr;
  assert.match(out, /vanilla/);
  assert.match(out, /react-ts/);
  assert.ok(!existsSync(join(dir, "package.json")), "must not scaffold on unknown template");
  rmSync(dir, { recursive: true, force: true });
});

test("init never overwrites existing files (vanilla + react-ts)", () => {
  for (const args of [[], ["--template", "react-ts"]]) {
    const dir = join(tmpdir(), `ztron-t-keep-${args.length}`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), "// sentinel\n");
    writeFileSync(join(dir, "src/main.ts"), "// sentinel main\n");
    const r = spawnSync(process.execPath, [CLI, "init", dir, ...args], {
      encoding: "utf8",
    });
    assert.equal(r.status, 0, `init failed: ${r.stderr}`);
    assert.equal(read(dir, "package.json"), "// sentinel\n");
    assert.equal(read(dir, "src/main.ts"), "// sentinel main\n");
    rmSync(dir, { recursive: true, force: true });
  }
});
