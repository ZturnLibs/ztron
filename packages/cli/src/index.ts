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
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { build as viteBuild } from "vite";
import { ztronVitePlugin } from "./vite-plugin.js";

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
  frontend?: string;
  appName?: string;
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

/** Walks up from `start` looking for `native/libs/<file>`. */
function findNativeFile(start: string, file: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    const candidate = resolve(dir, "native", "libs", file);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return undefined;
}

function findHostBin(appRoot: string): string {
  const env = process.env.ZTRON_HOST_BIN;
  if (env) {
    return resolve(env);
  }
  return (
    findNativeFile(appRoot, "ztron-host") ??
    resolve(appRoot, "native/libs/ztron-host")
  );
}

/** Locates the platform webview shared library (next to the host). */
function findWebviewLib(appRoot: string): string | undefined {
  const env = process.env.ZTRON_WEBVIEW_LIB;
  if (env) {
    return resolve(env);
  }
  const name =
    process.platform === "darwin"
      ? "libwebview.dylib"
      : process.platform === "win32"
        ? "webview.dll"
        : "libwebview.so";
  return findNativeFile(appRoot, name);
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

/**
 * Builds the frontend with Vite (base "./") and returns its file:// URL.
 *
 * M3 note: WKWebView blocks plain `http://` via ATS (and a per-process
 * Info.plist exemption is not honored by the WebKit network process), so the
 * dev frontend is served from a `file://` URL, which WebKit allows and which
 * has no ATS restrictions. HMR comes later (custom scheme host, see DESIGN.md).
 */
async function buildFrontend(
  cwd: string,
  invokeKey: string,
): Promise<string | null> {
  const config = readProjectConfig(cwd);
  const frontend = config.frontend ?? "frontend";
  const root = resolve(cwd, frontend);
  if (!existsSync(join(root, "index.html"))) {
    return null;
  }
  const outDir = resolve(root, "dist");
  await viteBuild({
    root,
    base: "./",
    logLevel: "silent",
    build: {
      outDir,
      emptyOutDir: true,
      // file:// has a null origin: emit a plain (non-module) IIFE bundle so
      // WKWebView loads it without module-CORS/crossorigin issues.
      modulePreload: false,
      rollupOptions: {
        output: {
          format: "iife",
          name: "ZtronApp",
          entryFileNames: "assets/[name].js",
          chunkFileNames: "assets/[name].js",
        },
      },
    },
    plugins: [ztronVitePlugin(invokeKey)],
  });
  const index = resolve(outDir, "index.html");
  // file:// has a null origin; a `type="module" crossorigin` tag fails the
  // CORS check in WKWebView. Rewrite to a classic script (the bundle is IIFE).
  if (existsSync(index)) {
    let html = readFileSync(index, "utf8");
    html = html.replace(
      /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
      (_, src: string) => `<script src="${src}"></script>`,
    );
    writeFileSync(index, html);
  }
  console.log(`[ztron] frontend built: ${index}`);
  return index;
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

  // Per-session invoke key shared by the backend and the injected bootstrap.
  const invokeKey = process.env.ZTRON_INVOKE_KEY ?? randomKey();

  const frontendIndex = await buildFrontend(cwd, invokeKey);
  const frontendUrl = frontendIndex ? "file://" + frontendIndex : null;

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
      ZTRON_INVOKE_KEY: invokeKey,
      ...(frontendUrl ? { ZTRON_DEV_URL: frontendUrl } : {}),
    },
  });
  process.exit(result.status ?? 1);
}

function randomKey(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
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

const MAIN_TEMPLATE = `import { AppBuilder } from "@ztron/core";import { HostRuntime } from "@ztron/runtime-ffi";
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

/**
 * Produces a distributable build:
 *   1. vite build the frontend (bootstrap + invokeKey baked in)
 *   2. bundle the backend and `tjs compile` it into a standalone binary
 *   3. assemble a platform bundle (macOS: Ztron*.app with a launcher that
 *      coordinates ztron-host + ztron-backend and passes the invokeKey)
 */
async function buildApp(cwd: string, entry: string): Promise<void> {
  const tjs = findTjs();
  const entryPath = resolve(cwd, entry);
  const appRoot = dirname(entryPath);
  const buildDir = join(appRoot, ".ztron");
  mkdirSync(buildDir, { recursive: true });
  const bundlePath = join(buildDir, "app.mjs");

  const invokeKey = process.env.ZTRON_INVOKE_KEY ?? randomKey();
  const frontendIndex = await buildFrontend(cwd, invokeKey);
  if (!frontendIndex) {
    throw new Error(
      "no frontend found (ztron.conf.json frontend or ./frontend)",
    );
  }

  console.log(`[ztron] bundling backend ${entryPath}`);
  await bundle(entryPath, bundlePath);

  const hostBin = findHostBin(appRoot);
  const lib = findWebviewLib(appRoot);
  if (!lib) {
    throw new Error(
      "webview shared library not found (run scripts/build-native.sh)",
    );
  }

  const outDir = join(cwd, "dist");
  const appName = (readProjectConfig(cwd).appName ?? "ZtronApp")
    .replace(/\s+/g, "")
    .replace(/[^\w.-]/g, "");

  if (process.platform === "darwin") {
    await packMacApp({
      outDir,
      appName,
      invokeKey,
      backendBundle: bundlePath,
      hostBin,
      lib,
      frontendDist: dirname(frontendIndex),
      tjs,
    });
  } else {
    throw new Error("packaging is only implemented for macOS (M4)");
  }
}

interface PackOptions {
  outDir: string;
  appName: string;
  invokeKey: string;
  backendBundle: string;
  hostBin: string;
  lib: string;
  frontendDist: string;
  tjs: string;
}

async function packMacApp(o: PackOptions): Promise<void> {
  const macosDir = join(o.outDir, `${o.appName}.app`, "Contents", "MacOS");
  const resDir = join(o.outDir, `${o.appName}.app`, "Contents", "Resources");
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resDir, { recursive: true });

  // compile the backend bundle into a standalone executable
  const backendBin = join(macosDir, "ztron-backend");
  const compiled = spawnSync(o.tjs, ["compile", o.backendBundle, backendBin], {
    encoding: "utf8",
  });
  if (compiled.status !== 0) {
    throw new Error(`tjs compile failed: ${compiled.stderr}`);
  }

  copyFileSync(o.hostBin, join(macosDir, "ztron-host"));
  copyFileSync(o.lib, join(macosDir, "libwebview.dylib"));
  cpSync(o.frontendDist, join(resDir, "frontend"), { recursive: true });

  writeFileSync(
    join(o.outDir, `${o.appName}.app`, "Contents", "Info.plist"),
    appInfoPlist(o.appName),
  );
  writeFileSync(
    join(macosDir, "ztron"),
    launcherScript(o.appName, o.invokeKey),
  );

  console.log(`[ztron] packaged: ${join(o.outDir, `${o.appName}.app`)}`);
}

function appInfoPlist(appName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>ztron</string>
  <key>CFBundleIdentifier</key>
  <string>com.ztron.${appName.toLowerCase()}</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
</dict>
</plist>
`;
}

/** Launcher: starts ztron-host, reads its PORT, then runs the backend. */
function launcherScript(appName: string, invokeKey: string): string {
  return `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(dirname "$DIR")"
RES="$APP_ROOT/Resources"
KEY="${invokeKey}"
HOST_LOG="$RES/.host.log"

"$DIR/ztron-host" 0 > "$HOST_LOG" 2>&1 &
HOST_PID=$!

PORT=""
i=0
while [ -z "$PORT" ] && [ $i -lt 100 ]; do
  PORT=$(sed -n 's/^PORT=//p' "$HOST_LOG" | head -1)
  [ -z "$PORT" ] && { sleep 0.1; i=$((i + 1)); }
done
if [ -z "$PORT" ]; then
  echo "ztron: host failed to start" >&2
  cat "$HOST_LOG" >&2
  exit 1
fi

ZTRON_HOST=127.0.0.1 ZTRON_HOST_PORT="$PORT" ZTRON_INVOKE_KEY="$KEY" \\
ZTRON_DEV_URL="file://$RES/frontend/index.html" \\
"$DIR/ztron-backend"

kill "$HOST_PID" 2>/dev/null
`;
}

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
      await buildApp(cwd, resolveEntry(cwd, entryArg));
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
