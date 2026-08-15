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
import { fileURLToPath } from "node:url";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { build as viteBuild, createServer } from "vite";
import { ztronVitePlugin } from "./vite-plugin.js";
import { codegen } from "./codegen.js";

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
  /** Content-Security-Policy header/value; defaults to a permissive-but-sane one. */
  csp?: string;
}

/** Default CSP injected into the built index.html. */
const DEFAULT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self' http://localhost:* ws://localhost:*";

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
 * Starts the Vite dev server for the frontend, returning its URL.
 *
 * P2: WKWebView blocks plain `http://` via ATS unless the host runs inside a
 * .app bundle whose Info.plist grants NSAllowsLocalNetworking. `spawnHostInBundle`
 * creates a temporary bundle for dev so the Vite dev server (and HMR) works.
 */
async function startFrontendDevServer(
  cwd: string,
  invokeKey: string,
): Promise<string | null> {
  const config = readProjectConfig(cwd);
  const frontend = config.frontend ?? "frontend";
  const root = resolve(cwd, frontend);
  if (!existsSync(join(root, "index.html"))) {
    return null;
  }
  const server = await createServer({
    root,
    logLevel: "silent",
    server: { host: "127.0.0.1", port: 0, hmr: true } as never,
    plugins: [ztronVitePlugin(invokeKey)],
  });
  await server.listen();
  const addr = server.httpServer?.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  if (!port) {
    await server.close();
    return null;
  }
  console.log(`[ztron] vite dev server: http://127.0.0.1:${port}`);
  /* Bind the URL to the literal IP: `localhost` may resolve to ::1 first and
     hit an unrelated IPv6 listener on the same port. */
  return `http://127.0.0.1:${port}`;
}

/**
 * Builds the frontend for production (base "./", IIFE, classic script).
 * Used by `ztron build`; dev uses `startFrontendDevServer` instead.
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
  if (existsSync(index)) {
    let html = readFileSync(index, "utf8");
    // The bundle is IIFE but vite emits `<script type="module">`; file:// has
    // a null origin so module scripts fail CORS. Rewrite to classic scripts.
    html = html.replace(
      /<script type="module"(?:\s+crossorigin)? src="([^"]+)"><\/script>/g,
      (_, src: string) => `<script src="${src}"></script>`,
    );
    // Inject a Content-Security-Policy meta (configurable via ztron.conf.json).
    if (!/<meta[^>]+http-equiv="?Content-Security-Policy"?/i.test(html)) {
      const csp = config.csp ?? DEFAULT_CSP;
      html = html.replace(
        /<head>/,
        `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    }
    writeFileSync(index, html);
  }
  console.log(`[ztron] frontend built: ${index}`);
  return index;
}

/**
 * Starts a Vite build watcher that rebuilds the frontend on every file change,
 * returning a callback to stop the watcher. Used for `ztron dev` (P2):
 * unlike a dev server (which WKWebView blocks via CORS on ESM modules), the
 * build watcher produces IIFE bundles loadable via `file://`.
 */
async function startFrontendWatcher(
  cwd: string,
  invokeKey: string,
  onRebuild: () => void,
): Promise<string | null> {
  const config = readProjectConfig(cwd);
  const frontend = config.frontend ?? "frontend";
  const root = resolve(cwd, frontend);
  if (!existsSync(join(root, "index.html"))) {
    return null;
  }
  const outDir = resolve(root, "dist");

  // Initial build (synchronous, awaited)
  const index = await buildFrontend(cwd, invokeKey);

  // Start the watcher in the background
  const watcher = await import("node:fs/promises");
  void watcher; // suppress unused
  setTimeout(async () => {
    try {
      const { watch } = await import("node:fs");
      console.log(`[ztron] watching ${root} (recursive)`);
      const w = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const f = String(filename);
        // Ignore the build output to avoid rebuild loops.
        if (f.includes("dist") || f.includes(".ztron")) return;
        if (f.endsWith(".ts") || f.endsWith(".html") || f.endsWith(".css")) {
          console.log(`[ztron] frontend changed: ${filename}, rebuilding...`);
          void buildFrontend(cwd, invokeKey).then(() => {
            console.log("[ztron] frontend rebuilt");
            onRebuild();
          });
        }
      });
      process.on("exit", () => w.close());
    } catch (e) {
      console.error("[ztron] watcher failed:", String(e));
    }
  }, 100);

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

const ATS_INFO_PLIST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>ztron-host</string>
  <key>CFBundleIdentifier</key>
  <string>com.ztron.dev-host</string>
  <key>CFBundleName</key>
  <string>Ztron Dev Host</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
    <key>NSAllowsLocalNetworking</key>
    <true/>
  </dict>
</dict>
</plist>
`;

/**
 * Creates a temporary .app bundle containing ztron-host + libwebview + an
 * ATS-exempt Info.plist, then spawns the host from inside the bundle.
 *
 * macOS only honors ATS exemptions from a bundle-level Info.plist (not the
 * `-sectcreate`-embedded one in a bare binary). Running the host from inside
 * a .app bundle lets WKWebView load `http://localhost` (Vite dev server).
 */
function spawnHostInBundle(hostBin: string, libPath: string): Promise<number> {
  const bundleDir = join(
    process.env.TMPDIR ?? "/tmp",
    `ztron-dev-${process.pid}.app`,
  );
  const macosDir = join(bundleDir, "Contents", "MacOS");
  mkdirSync(macosDir, { recursive: true });
  copyFileSync(hostBin, join(macosDir, "ztron-host"));
  if (existsSync(libPath)) {
    copyFileSync(libPath, join(macosDir, "libwebview.dylib"));
  }
  writeFileSync(join(bundleDir, "Contents", "Info.plist"), ATS_INFO_PLIST);
  return spawnHost(join(macosDir, "ztron-host"));
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

  // P2 dev: prefer the Vite dev server (http://localhost) which gives full
  // module-level HMR; fall back to the build+reload watcher (near-HMR) when
  // no frontend/index.html exists (inline-html apps).
  let frontendUrl: string | null = null;
  let reloadFile: string | null = null;
  try {
    const devUrl = await startFrontendDevServer(cwd, invokeKey);
    if (devUrl) {
      frontendUrl = devUrl;
    }
  } catch {
    /* dev server unavailable -> near-HMR fallback below */
  }
  if (!frontendUrl) {
    reloadFile = join(buildDir, "reload");
    const signalReload = () => {
      try {
        writeFileSync(reloadFile as string, String(Date.now()));
      } catch {
        /* ignore */
      }
    };
    const frontendIndex = await startFrontendWatcher(
      cwd,
      invokeKey,
      signalReload,
    );
    frontendUrl = frontendIndex ? "file://" + frontendIndex : null;
  }

  console.log(`[ztron] bundling ${entryPath}`);
  await bundle(entryPath, bundlePath);

  const hostBin = findHostBin(appRoot);

  let port: number;
  console.log(`[ztron] starting host: ${hostBin}`);
  port = await spawnHost(hostBin);

  console.log(`[ztron] running backend via ${tjs} on port ${port}`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ZTRON_HOST: "127.0.0.1",
    ZTRON_HOST_PORT: String(port),
    ZTRON_INVOKE_KEY: invokeKey,
    ...(frontendUrl ? { ZTRON_DEV_URL: frontendUrl } : {}),
    ...(reloadFile ? { ZTRON_RELOAD_FILE: reloadFile } : {}),
    ...(existsSync(resolve(cwd, "capabilities"))
      ? { ZTRON_CAPABILITIES_DIR: resolve(cwd, "capabilities") }
      : {}),
  };

  // Async spawn (not spawnSync) so the watcher's setTimeout keeps running on
  // the main event loop while the backend is up.
  await new Promise<void>((resolve) => {
    const child = spawn(tjs, ["run", bundlePath], {
      stdio: "inherit",
      cwd,
      env,
    });
    child.on("exit", (code) => {
      resolve();
      process.exit(code ?? 1);
    });
  });
}

function randomKey(): string {
  return (
    Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  );
}

/** Scaffolds a minimal Ztron project in `target`. */
async function initProject(target: string): Promise<void> {
  mkdirSync(join(target, "src"), { recursive: true });
  mkdirSync(join(target, "frontend", "src"), { recursive: true });
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
    "frontend/index.html": FRONTEND_HTML,
    "frontend/src/main.ts": FRONTEND_MAIN,
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

const MAIN_TEMPLATE = `import { AppBuilder, fsPlugin } from "@ztron/core";
import { HostRuntime } from "@ztron/runtime-ffi";

declare const tjs: { env: Record<string, string | undefined> };

const runtime = new HostRuntime({
  host: tjs.env.ZTRON_HOST ?? "127.0.0.1",
  port: Number(tjs.env.ZTRON_HOST_PORT),
});
await runtime.connect();

// The CLI points ZTRON_DEV_URL at the built/development frontend index.html;
// inline html is only a fallback when no frontend is configured.
const devUrl = tjs.env.ZTRON_DEV_URL;

const html = \`<!doctype html>
<html>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Hello Ztron</h1>
    <p id="status">ready</p>
  </body>
</html>\`;

new AppBuilder(runtime, "com.example.app")
  .plugin(fsPlugin({ scope: { allow: ["$TMP/**"] } }))
  .setup((app) => {
    app.command("hello", (args) => {
      const { name } = (args ?? {}) as { name?: string };
      return "hello, " + (name ?? "world");
    });
  })
  .window({
    label: "main",
    title: "My Ztron App",
    width: 800,
    height: 600,
    ...(devUrl ? { url: devUrl } : { html }),
  })
  .build()
  .run();
`;

const FRONTEND_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>My Ztron App</title>
  </head>
  <body style="font-family:system-ui;padding:2rem">
    <h1>Hello Ztron</h1>
    <p>invoke: <span id="status">running...</span></p>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const FRONTEND_MAIN = `import { invoke } from "@ztron/api";

const status = document.getElementById("status")!;
status.textContent = String(await invoke("hello", { name: "scaffold" }));
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
    // Cross-platform packaging: same layout for Linux/Windows.
    // Linux: <dist>/<appName>/ ; Windows: <dist>/ZtronApp/.
    const platDir =
      process.platform === "linux"
        ? join(outDir, appName)
        : join(outDir, "ZtronApp");
    mkdirSync(platDir, { recursive: true });
    copyFileSync(hostBin, join(platDir, "ztron-host"));
    if (lib) copyFileSync(lib, join(platDir, basenameOf(lib)));
    cpSync(dirname(frontendIndex), join(platDir, "frontend"), {
      recursive: true,
    });
    console.log(`[ztron] packaged: ${platDir}`);
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

/** Builds AppIcon.icns from a PNG via sips + iconutil (macOS only). */
function buildIcns(png: string, outIcns: string): void {
  const base = mkdtempSync(join(tmpdir(), "ztron-iconset-"));
  const iconset = `${base}.iconset`;
  renameSync(base, iconset);
  try {
    const sizes = [16, 32, 128, 256, 512];
    for (const s of sizes) {
      spawnSync(
        "sips",
        [
          "-z",
          String(s),
          String(s),
          png,
          "--out",
          join(iconset, `icon_${s}x${s}.png`),
        ],
        { stdio: "ignore" },
      );
      const d = s * 2;
      spawnSync(
        "sips",
        [
          "-z",
          String(d),
          String(d),
          png,
          "--out",
          join(iconset, `icon_${s}x${s}@2x.png`),
        ],
        { stdio: "ignore" },
      );
    }
    for (const s of [16, 32, 128, 256, 512]) {
      const d = s * 2;
      spawnSync(
        "sips",
        [
          "-z",
          String(d),
          String(d),
          png,
          "--out",
          join(iconset, `icon_${s}x${s}@2x.png`),
        ],
        { stdio: "ignore" },
      );
    }
    const r = spawnSync("iconutil", ["-c", "icns", iconset, "-o", outIcns], {
      encoding: "utf8",
    });
    if (r.status !== 0) {
      throw new Error(
        `iconutil failed (${r.status}): ${r.stderr || r.error?.message || "unknown"}`,
      );
    }
  } finally {
    rmSync(iconset, { recursive: true, force: true });
  }
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
  // libwebview is a versioned dylib (libwebview.0.12.0.dylib with symlinks);
  // copy the real file and re-create the symlinks so the @rpath install name
  // resolves inside the bundle.
  const libReal = resolve(o.lib).replace(/\.dylib$/, "") + ".dylib";
  copyFileSync(libReal, join(macosDir, "libwebview.dylib"));
  copyFileSync(libReal, join(macosDir, "libwebview.0.12.0.dylib"));
  symlinkSync(
    "libwebview.0.12.0.dylib",
    join(macosDir, "libwebview.0.12.dylib"),
  );
  cpSync(o.frontendDist, join(resDir, "frontend"), { recursive: true });

  // Build AppIcon.icns from assets/app-icon.png (sips + iconutil) if present.
  const iconPng = fileURLToPath(
    new URL("../../../assets/app-icon.png", import.meta.url),
  );
  const icns = join(resDir, "AppIcon.icns");
  if (existsSync(iconPng)) {
    buildIcns(iconPng, icns);
  }

  writeFileSync(
    join(o.outDir, `${o.appName}.app`, "Contents", "Info.plist"),
    appInfoPlist(o.appName),
  );
  writeFileSync(
    join(macosDir, "ztron"),
    launcherScript(o.appName, o.invokeKey),
  );
  chmodSync(join(macosDir, "ztron"), 0o755);

  // Optional ad-hoc signing (no Apple identity): makes the bundle runnable
  // on the same machine without gatekeeper prompts. Set ZTRON_SIGN_IDENTITY
  // to a real identity (e.g. "Developer ID Application: …") for distribution.
  if (process.platform === "darwin") {
    const identity = process.env.ZTRON_SIGN_IDENTITY ?? "-";
    const codesign = spawnSync(
      "codesign",
      [
        "--force",
        "--deep",
        "--sign",
        identity,
        join(o.outDir, `${o.appName}.app`),
      ],
      { encoding: "utf8" },
    );
    if (codesign.status !== 0) {
      console.warn(
        `[ztron] codesign warning: ${(codesign.stderr ?? "").trim().slice(0, 200)}`,
      );
    } else {
      console.log(
        `[ztron] signed ${o.appName}.app (${identity === "-" ? "ad-hoc" : identity})`,
      );
    }
  }

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
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>com.ztron.${appName.toLowerCase()}.deeplink</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>ztron</string>
      </array>
    </dict>
  </array>
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
    case "codegen": {
      await codegen(cwd);
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
