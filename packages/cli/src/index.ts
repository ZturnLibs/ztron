/**
 * CLI entry — orchestration for `ztron dev` / `ztron build`.
 *
 * `dev` bundles the app entry with esbuild (externalizing `tjs:ffi`), then
 * runs it under the txiki `tjs` binary.
 */
import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `ztron — Tauri-style desktop framework on txiki.js + system WebView

Usage:
  ztron dev [--entry <file>]   Bundle and run the app under the txiki runtime
  ztron build [--entry <file>] Produce a standalone executable (M4)
  ztron version                Print version
`;

const DEFAULT_ENTRY = "./src/main.ts";

/** Locate the txiki `tjs` binary (env ZTRON_TJS or on PATH). */
function findTjs(): string {
  const configured = process.env.ZTRON_TJS;
  if (configured) {
    return configured;
  }
  const probe = spawnSync("tjs", ["-v"], { encoding: "utf8" });
  if (probe.status === 0) {
    return "tjs";
  }
  throw new Error(
    "txiki.js runtime (`tjs`) not found on PATH. Install it or set ZTRON_TJS=/path/to/tjs",
  );
}

/** Locate the webview shared library next to the app, or via env. */
function findWebviewLib(appRoot: string): string | undefined {
  if (process.env.ZTRON_WEBVIEW_LIB) {
    return resolve(process.env.ZTRON_WEBVIEW_LIB);
  }
  const name =
    process.platform === "darwin"
      ? "libwebview.dylib"
      : process.platform === "win32"
        ? "webview.dll"
        : "libwebview.so";
  for (const dir of ["native/libs", "native/lib", "."]) {
    const candidate = resolve(appRoot, dir, name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function parseArgs(argv: string[]): { command: string; entry: string } {
  const command = argv[0] ?? "dev";
  let entry = DEFAULT_ENTRY;
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === "--entry") {
      entry = argv[i + 1] ?? entry;
    }
  }
  return { command, entry };
}

async function bundle(entry: string, outfile: string): Promise<void> {
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: "neutral",
    format: "esm",
    external: ["tjs:ffi"],
    outfile,
    sourcemap: "inline",
    logLevel: "warning",
  });
}

async function dev(cwd: string, entry: string): Promise<void> {
  const tjs = findTjs();
  const entryPath = resolve(cwd, entry);
  const appRoot = dirname(entryPath);

  const buildDir = join(appRoot, ".ztron");
  mkdirSync(buildDir, { recursive: true });
  const bundlePath = join(buildDir, "app.mjs");

  console.log(`[ztron] bundling ${entryPath}`);
  await bundle(entryPath, bundlePath);

  const lib = findWebviewLib(appRoot);
  const env = { ...process.env };
  if (lib) {
    env.ZTRON_WEBVIEW_LIB = lib;
    console.log(`[ztron] webview lib: ${lib}`);
  }

  console.log(`[ztron] running ${bundlePath} via ${tjs}`);
  const result = spawnSync(tjs, ["run", bundlePath], {
    stdio: "inherit",
    cwd,
    env,
  });
  process.exit(result.status ?? 1);
}

async function main(): Promise<void> {
  const { command, entry } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  switch (command) {
    case "version": {
      console.log("ztron 0.1.0");
      break;
    }
    case "dev": {
      await dev(cwd, entry);
      break;
    }
    case "build": {
      console.error("[ztron] build is not implemented yet (M4)");
      process.exit(1);
      break;
    }
    default: {
      console.error(USAGE);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
