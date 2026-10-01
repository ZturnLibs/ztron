/**
 * Native-chain locators shared by dev/build/check and doctor.
 * Resolution order per artifact:
 *   tjs:            env ZTRON_TJS -> bundled npm package -> PATH probe
 *   host / webview: env -> walk-up `native/libs/<file>` (8 levels) -> bundled
 * The bundled layer is the prebuilt chain shipped as a per-platform package
 * (`@zturnlibs/ztron-darwin-arm64`, `@zturnlibs/ztron-win32-x64`; installed
 * automatically next to the CLI);
 * walk-up stays ahead of it so in-repo freshly built artifacts win.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * npm platform package carrying the prebuilt native chain. Windows hosts ship
 * as `@zturnlibs/ztron-win32-x64`; every other platform keeps the original
 * darwin package name (single published platform so far).
 */
export function bundledPkgName(
  platform: string = process.platform,
  _arch: string = process.arch,
): string {
  return platform === "win32"
    ? "@zturnlibs/ztron-win32-x64"
    : "@zturnlibs/ztron-darwin-arm64";
}

/** Native host binary file name per platform (Windows executables carry .exe). */
export function hostBinName(platform: string = process.platform): string {
  return platform === "win32" ? "ztron-host.exe" : "ztron-host";
}

/** txiki.js runtime binary file name per platform. */
export function tjsBinName(platform: string = process.platform): string {
  return platform === "win32" ? "tjs.exe" : "tjs";
}

/**
 * Resolve `<platform pkg>/native/libs/<file>` starting Node's resolution at
 * `fromDir`. Resolution order: platform-mapped package first, then the
 * legacy darwin package as a compatibility fallback (keeps existing
 * consumers/tests resolving when only it is present). Returns undefined when
 * no candidate resolves or the artifact is missing (the in-repo workspace
 * link ships without native/).
 */
export function findBundledNativeFrom(
  fromDir: string,
  file: string,
  platform: string = process.platform,
  arch: string = process.arch,
): string | undefined {
  const pkgs = [
    ...new Set([bundledPkgName(platform, arch), "@zturnlibs/ztron-darwin-arm64"]),
  ];
  for (const pkg of pkgs) {
    try {
      const req = createRequire(join(fromDir, "package.json"));
      const p = req.resolve(`${pkg}/native/libs/${file}`);
      if (existsSync(p)) {
        return p;
      }
    } catch {
      // candidate absent — try the next one
    }
  }
  return undefined;
}

/** findBundledNativeFrom starting at this CLI package's own directory. */
export function findBundledNative(
  file: string,
  platform: string = process.platform,
  arch: string = process.arch,
): string | undefined {
  return findBundledNativeFrom(
    fileURLToPath(new URL(".", import.meta.url)),
    file,
    platform,
    arch,
  );
}

/** Locate the txiki `tjs` binary (env ZTRON_TJS, walk-up, bundled, or PATH). */
export function findTjs(
  start?: string,
  platform: string = process.platform,
): string {
  const configured = process.env.ZTRON_TJS;
  if (configured) {
    return configured;
  }
  const name = tjsBinName(platform);
  if (start) {
    const local = findNativeFile(start, name);
    if (local) {
      return local;
    }
  }
  const bundled = findBundledNative(name, platform);
  if (bundled) {
    return bundled;
  }
  // Node's spawn resolves PATHEXT on Windows, so the bare name probes both
  // `tjs` and `tjs.exe` on PATH.
  const probe = spawnSync("tjs", ["-v"], { encoding: "utf8" });
  if (probe.status === 0) {
    return "tjs";
  }
  throw new Error(
    "txiki.js runtime (`tjs`) not found. Reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`) or set ZTRON_TJS=/path/to/tjs",
  );
}

/** Walks up from `start` looking for `native/libs/<file>`. */
export function findNativeFile(start: string, file: string): string | undefined {
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

export function findHostBin(
  appRoot: string,
  platform: string = process.platform,
): string {
  const env = process.env.ZTRON_HOST_BIN;
  if (env) {
    return resolve(env);
  }
  const name = hostBinName(platform);
  return (
    findNativeFile(appRoot, name) ??
    findBundledNative(name, platform) ??
    resolve(appRoot, "native/libs", name)
  );
}

/** Locates the platform webview shared library (next to the host). */
export function findWebviewLib(
  appRoot: string,
  platform: string = process.platform,
): string | undefined {
  const env = process.env.ZTRON_WEBVIEW_LIB;
  if (env) {
    return resolve(env);
  }
  const name =
    platform === "darwin"
      ? "libwebview.dylib"
      : platform === "win32"
        ? "webview.dll"
        : "libwebview.so";
  return findNativeFile(appRoot, name) ?? findBundledNative(name, platform);
}
