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
  statSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import {
  bundleAll,
  macSignAndNotarize,
  packUpdaterArtifacts,
  type PackageType,
} from "./bundler.js";
import { dirname, join, resolve } from "node:path";
import { build as viteBuild, createServer } from "vite";
import { ztronVitePlugin } from "./vite-plugin.js";
import { codegen } from "./codegen.js";
import {
  findTjs,
  findNativeFile,
  findHostBin,
  findWebviewLib,
} from "./native-locate.js";

const USAGE = `ztron — Tauri-style desktop framework on txiki.js + system WebView

Usage:
  ztron init [dir]                 Scaffold a new project in [dir] (default .)
  ztron doctor                     Check node/tjs/host/webview chain (exit 1 on fail)
  ztron dev [--entry <file>]       Bundle + run under the native host + tjs backend
  ztron build [--entry <file>]     Produce a standalone executable (M4)
  ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                   Regression run: parse the app's reported
                                   checks; exit 0 only on FULL_OK + no FAILs
                                   (--expect pins required tags, comma-sep)
  ztron version                    Print version
`;

const DEFAULT_ENTRY = "./src/main.ts";

interface ProjectConfig {
  $schema?: string;
  entry?: string;
  frontend?: string;
  appName?: string;
  productName?: string;
  mainBinaryName?: string;
  /** Legacy top-level CSP — prefer app.security.csp (both work). */
  csp?: string;
  identifier?: string;
  version?: string;
  build?: Record<string, string>;
  app?: {
    withGlobalTauri?: boolean;
    macOSPrivateApi?: boolean;
    security?: {
      csp?: string;
      devCsp?: string;
      capabilities?: string[] | string;
      assetProtocol?: { scope?: string[] | string };
      freezePrototype?: boolean;
    };
  };
  bundle?: Record<string, unknown>;
  plugins?: Record<string, unknown>;
  /** Declarative startup windows (label/title/size/position/startup states). */
  windows?: Array<Record<string, unknown>>;
}

/** Effective CSP: app.security.csp wins over the legacy top-level key. */
function effectiveCsp(conf: ProjectConfig): string | undefined {
  return conf.app?.security?.csp ?? conf.csp;
}

/** Default CSP injected into the built index.html. */
const DEFAULT_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self' http://localhost:* ws://localhost:*";

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
      const conf = JSON.parse(readFileSync(file, "utf8")) as ProjectConfig;
      validateWindows(conf);
      return conf;
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("ztron.conf.json:")) {
      throw err;
    }
    /* ignore malformed config */
  }
  return {};
}

/** Fail-fast window schema check (mirrors core's validateProjectConfig). */
function validateWindows(conf: ProjectConfig): void {
  if (conf.windows === undefined) return;
  if (!Array.isArray(conf.windows)) {
    throw new Error("ztron.conf.json: windows must be an array");
  }
  const seen = new Set<string>();
  for (const [i, w] of conf.windows.entries()) {
    if (typeof w !== "object" || w === null) {
      throw new Error(`ztron.conf.json: windows[${i}] must be an object`);
    }
    const label = String(w.label ?? "main");
    if (!/^[a-zA-Z0-9_-]+$/.test(label)) {
      throw new Error(
        `ztron.conf.json: windows[${i}].label "${label}" must be alphanumeric/-/_`,
      );
    }
    if (seen.has(label)) {
      throw new Error(`ztron.conf.json: duplicate window label "${label}"`);
    }
    seen.add(label);
    for (const k of ["width", "height", "x", "y"]) {
      const v = w[k];
      if (v !== undefined && (typeof v !== "number" || v < 0)) {
        throw new Error(
          `ztron.conf.json: windows[${i}].${k} must be a non-negative number`,
        );
      }
    }
  }
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
  await runApp(cwd, entry, "dev");
}

/**
 * `ztron check` — regression run: boots the app through the dev pipeline,
 * parses the deterministic check lines the app reports (`frontend
 * reported: "TAG…"`), and exits 0 only when every check passed (the app's
 * own FULL_OK line was seen and no FAIL/ERROR tags arrived). Extra tags
 * (best-effort bonuses) are allowed; missing ones are not inferred — the
 * contract is the app's own terminal state, so `--expect` can pin required
 * tags explicitly.
 */
async function check(cwd: string, entry: string, args: string[]): Promise<void> {
  const timeoutMs = numberFlag(args, "--timeout", 120_000);
  const expect = flagValue(args, "--expect");
  const required = expect ? expect.split(",").map((t) => t.trim()).filter(Boolean) : [];
  await runApp(cwd, entry, "check", {
    timeoutMs,
    required,
  });
}

interface CheckOptions {
  timeoutMs: number;
  required: string[];
}

async function runApp(
  cwd: string,
  entry: string,
  mode: "dev" | "check",
  checkOpts: CheckOptions = { timeoutMs: 120_000, required: [] },
): Promise<void> {
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
    /* Declarative config (windows/identifier/version) for AppBuilder.fromConfig */
    ZTRON_CONF: JSON.stringify(readProjectConfig(cwd)),
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
      stdio: mode === "check" ? ["ignore", "pipe", "pipe"] : "inherit",
      cwd,
      env,
    });
    const verdictBox = { value: -1 }; // -1 = not decided
    if (mode === "check") {
      runCheckHarness(child, checkOpts, verdictBox);
    }
    child.on("exit", (code) => {
      resolve();
      /* In check mode the harness verdict wins (it may be stricter than the
         child's own exit code — e.g. a FAIL tag with exit 0, or a timeout). */
      process.exit(verdictBox.value >= 0 ? verdictBox.value : (code ?? 1));
    });
  });
}

/** Parses check-mode backend output into a pass/fail report.
 *  Returns the final exit code (decided when the child exits or times out). */
function runCheckHarness(
  child: ReturnType<typeof spawn>,
  opts: CheckOptions,
  verdictBox: { value: number },
): void {
  const seen = new Map<string, string>(); // tag -> raw detail
  const failures: string[] = [];
  let fullOk = false;
  let done = false;

  const finish = (code: number, summary: string) => {
    if (done) return;
    done = true;
    verdictBox.value = code;
    console.log("\n[ztron check] " + summary);
    const missing = opts.required.filter((t) => !seen.has(t));
    for (const t of missing) {
      console.error(`✗ missing required check: ${t}`);
    }
    process.exitCode = code;
    /* Kill the whole tree if the harness decided before the app exited
       (timeout path); the child's own exit resolves the outer promise. */
    if (code !== 0) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  };

  const onLine = (line: string) => {
    console.log("[app] " + line);
    /* Two report shapes:
     *  1. hello-style:  [m3] frontend reported: "TAG:detail"
     *  2. bare:         SECOND_WINDOW_OK / STRESS_OK / X_FAIL …
     *     (a line that is exactly a tag with optional :detail)
     */
    let m = /frontend reported: "(.*)"$/.exec(line.trim());
    if (!m) {
      const bare =
        /^([A-Z][A-Z0-9_]*(?:_[A-Z0-9]+)*)(?::(.*))?(?:\s.*)?$/.exec(line.trim());
      if (bare && /_(OK|FAIL|BONUS)$/.test(bare[1]!)) {
        m = [line, bare[1]! + (bare[2] !== undefined ? ":" + bare[2] : "")] as unknown as RegExpExecArray;
      }
    }
    if (m) {
      const raw = m[1]!;
      const tag = raw.split(":")[0]!;
      if (!seen.has(tag)) {
        seen.set(tag, raw);
        if (/_FAIL$/.test(tag) || tag === "ERROR") {
          failures.push(raw);
          console.error(`✗ ${raw}`);
        } else {
          console.log(`✓ ${raw}`);
        }
      }
      return;
    }
    m = /^SPIKE_RESULT: FULL_OK/.exec(line.trim());
    if (m) {
      fullOk = true;
      return;
    }
    if (/^libc\+\+abi|Terminating app|Segmentation fault/.test(line)) {
      failures.push("native crash: " + line.trim());
    }
  };

  child.stdout?.on("data", (c: Buffer) => c.toString().split("\n").forEach(onLine));
  child.stderr?.on("data", (c: Buffer) => c.toString().split("\n").forEach(onLine));

  const timer = setTimeout(() => {
    finish(
      1,
      `TIMEOUT after ${opts.timeoutMs}ms (${seen.size} checks seen, FULL_OK=${fullOk})`,
    );
  }, opts.timeoutMs);
  child.on("exit", (code) => {
    clearTimeout(timer);
    const crash = failures.some((f) => f.startsWith("native crash"));
    if (crash || failures.length > 0) {
      finish(1, `${failures.length} failure(s)`);
    } else if (!fullOk && opts.required.length === 0) {
      finish(1, `app exited (code ${code}) without FULL_OK`);
    } else if (opts.required.some((t) => !seen.has(t))) {
      finish(1, `required checks missing (${opts.required.filter((t) => !seen.has(t)).join(", ")})`);
    } else {
      finish(0, `${seen.size} checks passed${fullOk ? " (FULL_OK)" : ""}`);
    }
  });
}

function numberFlag(args: string[], name: string, dflt: number): number {
  const v = flagValue(args, name);
  return v ? Number(v) : dflt;
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
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
          "@zturnlibs/ztron-api": "latest",
          "@zturnlibs/ztron-core": "latest",
          "@zturnlibs/ztron-runtime-ffi": "latest",
        },
        devDependencies: {
          "@zturnlibs/ztron-cli": "latest",
        },
      },
      null,
      2,
    ),
    "ztron.conf.json": JSON.stringify(
      {
        entry: "src/main.ts",
        identifier: "com.example.app",
        version: "0.1.0",
        windows: [{ label: "main", title: "Ztron App", width: 800, height: 600 }],
      },
      null,
      2,
    ),
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
  const hasChain = findNativeFile(target, "ztron-host") !== undefined;
  console.log(`[ztron] next steps:`);
  console.log(`  1. native chain (once): clone https://github.com/ZturnLibs/ztron && cd ztron && scripts/build-native.sh`);
  console.log(`  2. export ZTRON_TJS=<repo>/native/libs/tjs ZTRON_HOST_BIN=<repo>/native/libs/ztron-host ZTRON_WEBVIEW_LIB=<repo>/native/libs/libwebview.dylib`);
  console.log(`  3. pnpm install && npx ztron doctor && npx ztron dev`);
  if (!hasChain) {
    console.log(`[ztron] note: no native/libs found above ${target} — run \`ztron doctor\` after step 2.`);
  }
}

function basenameOf(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "ztron-app";
}

const MAIN_TEMPLATE = `import { AppBuilder, fsPlugin } from "@zturnlibs/ztron-core";
import { HostRuntime } from "@zturnlibs/ztron-runtime-ffi";

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

const FRONTEND_MAIN = `import { invoke } from "@zturnlibs/ztron-api";

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
    /* G13: conf-driven extra targets (nsis/msi/appimage/deb/rpm skeletons),
       Developer-ID sign+notarize chain, and updater artifacts. */
    await bundleExtraTargets(cwd, { outDir, appName }, readProjectConfig(cwd));
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



/**
 * G13 wiring: ztron.conf.json bundle.targets drives the portable packers
 * (each emits its control files/manifests and reports built:false with the
 * exact toolchain reason where the host cannot run it). When
 * ZTRON_SIGN_IDENTITY is a real Developer-ID identity, runs the
 * sign+notarize chain; when ZTRON_UPDATER_KEYS=<pub>,<sk> paths are set,
 * emits latest.json + .minisig next to the artifacts.
 */
async function bundleExtraTargets(
  cwd: string,
  o: { outDir: string; appName: string },
  conf: ProjectConfig,
): Promise<void> {
  const bundleConf = (conf.bundle ?? {}) as {
    targets?: string | string[];
  };
  const requestedRaw = bundleConf.targets;
  const requested: PackageType[] = (
    Array.isArray(requestedRaw)
      ? requestedRaw
      : typeof requestedRaw === "string"
        ? requestedRaw === "all"
          ? ["nsis", "msi", "appimage", "deb", "rpm"]
          : requestedRaw.split(",").map((t) => t.trim())
        : []
  ).filter((t): t is PackageType =>
    ["nsis", "msi", "appimage", "deb", "rpm"].includes(t),
  );
  if (requested.length) {
    const cfg = {
      identifier: conf.identifier ?? "com.ztron.app",
      productName: conf.productName ?? o.appName,
      version: conf.version ?? "0.1.0",
      resources: (conf.bundle as { resources?: string[] } | undefined)?.resources,
      icons: (conf.bundle as { icon?: string[] } | undefined)?.icon,
    };
    const bin = join(o.outDir, `${o.appName}.app`, "Contents", "MacOS", "ztron");
    const results = bundleAll(o.outDir, cfg, { binPath: bin, targets: requested });
    for (const r of results) {
      console.log(
        `[ztron] bundle ${r.type}: ${r.built ? r.path : `skeleton -> ${r.path} (${r.reason})`}`,
      );
    }
  }

  // Developer-ID chain (only when a real identity is configured).
  const identity = process.env.ZTRON_SIGN_IDENTITY;
  if (identity && identity !== "-") {
    const appPath = join(o.outDir, `${o.appName}.app`);
    const res = macSignAndNotarize(appPath, {
      identity,
      hardenedRuntime: true,
      notarize: {
        appleId: process.env.ZTRON_NOTARY_APPLE_ID,
        teamId: process.env.ZTRON_NOTARY_TEAM_ID,
      },
    });
    console.log(`[ztron] codesign: ${res.signed ? "ok" : "FAILED"}`);
    console.log(`[ztron] notarize: ${res.notarized ? "ok" : "skipped/plan-only"}`);
    if (!res.notarized) {
      for (const cmd of res.plan) console.log(`[ztron]   plan: ${cmd}`);
    }
  }

  // Updater artifacts (F6) — sign + latest.json when key paths are given.
  const keys = process.env.ZTRON_UPDATER_KEYS;
  if (keys) {
    const [pubPath, skPath] = keys.split(",").map((x) => x.trim());
    const rf: (p: string, enc: "utf8") => string = (pp, enc) =>
      readFileSync(pp, enc);
    const artifact =
      existsSync(join(o.outDir, `${o.appName}.dmg`))
        ? join(o.outDir, `${o.appName}.dmg`)
        : join(o.outDir, `${o.appName}.app`);
    const out = await packUpdaterArtifacts(o.outDir, artifact, {
      version: conf.version ?? "0.1.0",
      platformKey: "darwin",
      pubkeyText: rf(pubPath ?? "", "utf8"),
      secretKeyText: rf(skPath ?? "", "utf8"),
      baseUrl: process.env.ZTRON_UPDATER_BASE ?? "http://localhost:8080",
    });
    console.log(`[ztron] updater manifest: ${out.manifestPath}`);
    console.log(`[ztron] updater signature: ${out.signaturePath}`);
  }
  void cwd;
}

function appBundlePath(o: PackOptions): string {
  return join(o.outDir, `${o.appName}.app`);
}


async function packMacApp(o: PackOptions): Promise<void> {
  const macosDir = join(o.outDir, `${o.appName}.app`, "Contents", "MacOS");
  const resDir = join(o.outDir, `${o.appName}.app`, "Contents", "Resources");
  mkdirSync(macosDir, { recursive: true });
  mkdirSync(resDir, { recursive: true });

  // compile the backend bundle into a standalone executable.
  // NOTE: it goes to RESOURCES, not MacOS — tjs-compiled binaries fail
  // codesign strict validation, and a nested resource binary stays outside
  // the app's main signature chain (the launcher spawns it from there).
  const backendBin = join(resDir, "ztron-backend");
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
  /* Mach-O launcher (signing-friendly: a shell-script CFBundleExecutable
     cannot pass codesign strict validation). Recompiled with the real
     invoke key baked in; falls back to the shell script when cc is missing. */
  const launcherOut = join(macosDir, "ztron");
  const launcherSrc = fileURLToPath(
    new URL("../../../native/host/launcher_macos.c", import.meta.url),
  );
  if (existsSync(launcherSrc)) {
    const cc = spawnSync(
      "cc",
      [
        "-O2",
        `-DZTRON_INVOKE_KEY="${o.invokeKey}"`,
        launcherSrc,
        "-o",
        launcherOut,
        "-framework",
        "Foundation",
      ],
      { encoding: "utf8" },
    );
    if (cc.status === 0) {
      chmodSync(launcherOut, 0o755);
    } else {
      console.warn(
        `[ztron] launcher compile failed, falling back to sh: ${(cc.stderr ?? "").slice(0, 160)}`,
      );
      writeFileSync(launcherOut, launcherScript(o.appName, o.invokeKey));
      chmodSync(launcherOut, 0o755);
    }
  } else {
    writeFileSync(launcherOut, launcherScript(o.appName, o.invokeKey));
    chmodSync(launcherOut, 0o755);
  }

  // Optional signing (no Apple identity): makes the bundle runnable
  // on the same machine without gatekeeper prompts. Set ZTRON_SIGN_IDENTITY
  // to a real identity (e.g. "Developer ID Application: …") for distribution.
  // Sign inner binaries FIRST, then the bundle — `--deep` fails on the
  // tjs-compiled backend (strict validation), leaving the app unsigned.
  if (process.platform === "darwin") {
    const identity = process.env.ZTRON_SIGN_IDENTITY ?? "-";
    const appPath = join(o.outDir, `${o.appName}.app`);
    /* inner binaries that must sign cleanly (launcher + host); ztron-backend
       keeps its linker-signed adhoc signature in Resources. */
    for (const inner of ["ztron-host"]) {
      const bin = join(macosDir, inner);
      if (!existsSync(bin)) continue;
      const r = spawnSync(
        "codesign",
        ["--force", "--sign", identity, bin],
        { encoding: "utf8" },
      );
      if (r.status !== 0) {
        console.warn(
          `[ztron] codesign warning (${inner}): ${(r.stderr ?? "").trim().slice(0, 160)}`,
        );
      }
    }
    const codesign = spawnSync(
      "codesign",
      [
        "--force",
        "--sign",
        identity,
        appPath,
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

  /* dmg disk image (default on; opt out via ZTRON_NO_DMG=1) — the standard
     drag-to-install distribution artifact. */
  if (process.env.ZTRON_NO_DMG !== "1") {
    await packDmg(o.outDir, o.appName);
  }
}

/**
 * Builds a .app -> .dmg image with a drag-to-Applications layout.
 * `hdiutil create` with a source folder containing the .app + an
 * /Applications symlink; UDZO (zlib) compression keeps it small.
 */
async function packDmg(outDir: string, appName: string): Promise<void> {
  const staging = join(outDir, "dmg-staging");
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  cpSync(join(outDir, `${appName}.app`), join(staging, `${appName}.app`), {
    recursive: true,
  });
  /* the classic drag target */
  symlinkSync("/Applications", join(staging, "Applications"));

  const dmg = join(outDir, `${appName}.dmg`);
  rmSync(dmg, { force: true });
  const volName = appName; // volume name shown when mounted
  const create = spawnSync(
    "hdiutil",
    [
      "create",
      "-volname",
      volName,
      "-srcfolder",
      staging,
      "-ov",
      "-format",
      "UDZO",
      dmg,
    ],
    { encoding: "utf8" },
  );
  rmSync(staging, { recursive: true, force: true });
  if (create.status !== 0) {
    console.warn(
      `[ztron] dmg warning: ${(create.stderr ?? "").trim().slice(0, 200)}`,
    );
    return;
  }
  const size = statSync(dmg).size;
  console.log(
    `[ztron] disk image: ${dmg} (${(size / 1024 / 1024).toFixed(1)} MB)`,
  );
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
      console.log("ztron 0.3.0");
      break;
    }
    case "init": {
      const target = positional ? resolve(cwd, positional) : cwd;
      await initProject(target);
      break;
    }
    case "doctor": {
      const { runDoctor } = await import("./doctor.js");
      const report = runDoctor({ cwd, env: process.env, platform: process.platform });
      for (const c of report.checks) {
        console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.name}: ${c.detail}`);
        if (!c.pass) console.log(`      hint: ${c.hint}`);
      }
      console.log(report.ok ? "doctor: OK" : "doctor: FAILED");
      if (!report.ok) process.exitCode = 1;
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
    case "check": {
      await check(cwd, resolveEntry(cwd, entryArg), process.argv.slice(3));
      break;
    }
    case "icon": {
      const input = resolve(cwd, positional ?? "app-icon.png");
      const outIdx = process.argv.indexOf("-o");
      const out = resolve(
        cwd,
        outIdx >= 0 ? (process.argv[outIdx + 1] ?? "icons") : "icons",
      );
      const r = (await import("./tools.js")).generateIcons(input, out);
      console.log(`[ztron] icns: ${r.icns}`);
      console.log(`[ztron] iconset: ${r.iconset}`);
      console.log(`[ztron] png sizes: ${r.pngs.length} files`);
      break;
    }
    case "info": {
      (await import("./tools.js")).printInfo(
        cwd,
        process.env.ZTRON_TJS ?? "",
      );
      break;
    }
    case "add": {
      if (!positional) {
        console.error("usage: ztron add <plugin>");
        process.exit(1);
      }
      (await import("./tools.js")).addPlugin(cwd, positional);
      break;
    }
    case "migrate": {
      (await import("./tools.js")).migrateConf(cwd, process.argv.slice(3));
      break;
    }
    case "signer": {
      const { signer } = await import("./signer.js");
      await signer(process.argv.slice(3));
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
