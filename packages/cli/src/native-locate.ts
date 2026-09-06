/**
 * Native-chain locators shared by dev/build/check and doctor.
 * Resolution order per artifact:
 *   tjs:            env ZTRON_TJS -> bundled npm package -> PATH probe
 *   host / webview: env -> walk-up `native/libs/<file>` (8 levels) -> bundled
 * The bundled layer is the prebuilt chain shipped as
 * `@zturnlibs/ztron-darwin-arm64` (installed automatically next to the CLI);
 * walk-up stays ahead of it so in-repo freshly built artifacts win.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** npm platform package carrying the prebuilt native chain. */
const BUNDLED_PKG = "@zturnlibs/ztron-darwin-arm64";

/**
 * Resolve `BUNDLED_PKG/native/libs/<file>` starting Node's resolution at
 * `fromDir`. Returns undefined when the package is absent (--no-optional,
 * trimmed mirror, other platform) or the artifact is missing (the in-repo
 * workspace link ships without native/).
 */
export function findBundledNativeFrom(
  fromDir: string,
  file: string,
): string | undefined {
  try {
    const req = createRequire(join(fromDir, "package.json"));
    const p = req.resolve(`${BUNDLED_PKG}/native/libs/${file}`);
    return existsSync(p) ? p : undefined;
  } catch {
    return undefined;
  }
}

/** findBundledNativeFrom starting at this CLI package's own directory. */
export function findBundledNative(file: string): string | undefined {
  return findBundledNativeFrom(
    fileURLToPath(new URL(".", import.meta.url)),
    file,
  );
}

/** Locate the txiki `tjs` binary (env ZTRON_TJS, bundled package, or PATH). */
export function findTjs(): string {
  const configured = process.env.ZTRON_TJS;
  if (configured) {
    return configured;
  }
  const bundled = findBundledNative("tjs");
  if (bundled) {
    return bundled;
  }
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

export function findHostBin(appRoot: string): string {
  const env = process.env.ZTRON_HOST_BIN;
  if (env) {
    return resolve(env);
  }
  return (
    findNativeFile(appRoot, "ztron-host") ??
    findBundledNative("ztron-host") ??
    resolve(appRoot, "native/libs/ztron-host")
  );
}

/** Locates the platform webview shared library (next to the host). */
export function findWebviewLib(appRoot: string): string | undefined {
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
  return findNativeFile(appRoot, name) ?? findBundledNative(name);
}
