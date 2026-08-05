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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const USAGE = `ztron — Tauri-style desktop framework on txiki.js + system WebView

Usage:
  ztron init [dir]                 Scaffold a new project in [dir] (default .)
  ztron dev [--entry <file>]       Bundle + run under the native host + tjs backend
  ztron build [--entry <file>]     Produce a standalone executable (M4)
  ztron version                    Print version
`;

const DEFAULT_ENTRY = "./src/main.ts";

interface ProjectConfig {
  entry?: string;
}

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

function parseArgs(argv: string[]): {
  command: string;
  entry: string;
  positional: string;
} {
  const command = argv[0] ?? "dev";
  let entry = "";
  let positional = "";
  for (let i = 1; i < argv.length; i += 1) {
    const a = argv[i] ?? "";
    if (a === "--entry") {
      entry = argv[i + 1] ?? "";
    } else if (!a.startsWith("-") && !positional) {
      positional = a;
    }
  }
  return { command, entry, positional };
}

/** Reads `ztron.conf.json` if present. */
function readProjectConfig(cwd: string): ProjectConfig {
  const file = join(cwd, "ztron.conf.json");
  try {
    if (existsSync(file)) {
      return JSON.parse(readFileSync(file, "utf8")) as ProjectConfig;
    }
  } catch {
    /* ignore malformed config */
  }
  return {};
}

/** Resolves the entry file: --entry > ztron.conf.json.entry > src/main.ts. */
function resolveEntry(cwd: string, entryArg: string): string {
  if (entryArg) {
    return entryArg;
  }
  const config = readProjectConfig(cwd);
  return config.entry ?? DEFAULT_ENTRY;
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

/** Scaffolds a minimal Ztron project in `target`. */
async function initProject(target: string): Promise<void> {
  mkdirSync(join(target, "src"), { recursive: true });
  const name = basenameOf(target);

  const files: Record<string, string> = {
    "package.json": JSON.stringify(
      {
        name,
        version: "0.1.0",
        private: true,
        type: "module",
        scripts: {
          dev: "ztron dev",
          build: "ztron build",
        },
        dependencies: {
          "@ztron/api": "latest",
          "@ztron/core": "latest",
          "@ztron/runtime-ffi": "latest",
        },
        devDependencies: {
          "@ztron/cli": "latest",
        },
      },
      null,
      2,
    ),
    "ztron.conf.json": JSON.stringify({ entry: "src/main.ts" }, null, 2),
    "src/main.ts": MAIN_TEMPLATE,
  };

  for (const [rel, content] of Object.entries(files)) {
    const file = join(target, rel);
    if (!existsSync(file)) {
      writeFileSync(file, content);
    }
  }
  console.log(`[ztron] scaffolded a project in ${target}`);
  console.log(`[ztron] next: pnpm install && pnpm dev`);
}

function basenameOf(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "ztron-app";
}

const MAIN_TEMPLATE = `import { AppBuilder } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";
import { fsPlugin } from "@ztron/core";

declare const tjs: { env: Record<string, string | undefined> };

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

const html = \`<!doctype html>
<html>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Hello Ztron</h1>
    <p id="status">ready</p>
  </body>
</html>\`;

new AppBuilder(runtime, "com.example.app")
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .window({ label: "main", title: "My Ztron App", width: 800, height: 600, html })
  .build()
  .run();
`;

async function main(): Promise<void> {
  const {
    command,
    entry: entryArg,
    positional,
  } = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  switch (command) {
    case "version": {
      console.log("ztron 0.1.0");
      break;
    }
    case "init": {
      const target = positional ? resolve(cwd, positional) : cwd;
      await initProject(target);
      break;
    }
    case "dev": {
      await dev(cwd, resolveEntry(cwd, entryArg));
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
