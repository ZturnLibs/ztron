/**
 * CLI entry — orchestration for `ztron dev` / `ztron build`.
 *
 * `dev` (Plan A two-process model):
 *   1. bundle the app entry with esbuild (externalizing `tjs:*`),
 *   2. spawn `ztron-host` (webview + GUI loop), read its `PORT=`,
 *   3. spawn the txiki backend with `ZTRON_HOST_PORT` and run the bundle.
 */
import { build } from "esbuild";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const USAGE = `ztron — Tauri-style desktop framework on txiki.js + system WebView

Usage:
  ztron dev [--entry <file>]   Bundle + run under the native host + tjs backend
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

/** Locate the native host binary (env ZTRON_HOST_BIN or next to the lib). */
function findHostBin(appRoot: string): string {
  const configured = process.env.ZTRON_HOST_BIN;
  if (configured) {
    return resolve(configured);
  }
  for (const dir of ["native/libs", "native/lib", "..", "."]) {
    const candidate = resolve(appRoot, dir, "ztron-host");
    if (candidate && !dirname(candidate).includes("node_modules")) {
      return candidate;
    }
  }
  return resolve(appRoot, "native/libs/ztron-host");
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
    external: ["tjs:*"],
    outfile,
    sourcemap: "inline",
    logLevel: "warning",
  });
}

/** Spawns ztron-host and resolves with its listening port. */
function spawnHost(hostBin: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const child = spawn(hostBin, ["0"], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const m = /^PORT=(\d+)/m.exec(stdout);
      if (m) {
        resolvePort(Number(m[1]));
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code !== null && code !== 0) {
        reject(new Error(`ztron-host exited with code ${code}`));
      }
    });
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

  const hostBin = findHostBin(appRoot);
  console.log(`[ztron] starting host: ${hostBin}`);
  const port = await spawnHost(hostBin);

  console.log(`[ztron] running backend via ${tjs} on port ${port}`);
  const result = spawnSync(tjs, ["run", bundlePath], {
    stdio: "inherit",
    cwd,
    env: {
      ...process.env,
      ZTRON_HOST: "127.0.0.1",
      ZTRON_HOST_PORT: String(port),
    },
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
