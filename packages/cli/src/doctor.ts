/**
 * `ztron doctor` — one-shot environment check for newcomers.
 * Pure logic here (returns a report); index.ts renders and sets exit code.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findTjs, findHostBin, findWebviewLib, findBundledNative } from "./native-locate.js";
import { bold, green, red, yellow } from "./ui.js";

const require = createRequire(import.meta.url);

export type DoctorGroup = "Environment" | "Native chain" | "CLI" | "Platform";

export interface DoctorCheck {
  name: string;
  /** Render grouping; also part of the --json payload (additive). */
  group: DoctorGroup;
  pass: boolean;
  detail: string;
  hint: string;
}
export interface DoctorReport {
  checks: DoctorCheck[];
  ok: boolean;
}

const GROUPS: DoctorGroup[] = ["Environment", "Native chain", "CLI", "Platform"];

const CHAIN_HINT =
  "reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`) for the bundled native chain; or build from source: clone https://github.com/ZturnLibs/ztron && `scripts/build-native.sh`, then export ZTRON_TJS / ZTRON_HOST_BIN / ZTRON_WEBVIEW_LIB";

export function runDoctor(opts: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  platform: string;
  /** Injectable for tests; defaults to this dist's own entry file. */
  entryPath?: string;
  /** Injectable for tests; defaults to this package's version. */
  cliVersion?: string;
  /** Injectable for tests; defaults to the bundled platform package's version.
   * `null` forces "not installed" (hermetic tests — a dev workspace may have
   * the platform package linked, which would otherwise leak into the check). */
  bundledVersion?: string | null;
}): DoctorReport {
  const { cwd, env, platform } = opts;
  const checks: DoctorCheck[] = [];

  const cliVersion = opts.cliVersion ?? (require("../package.json") as { version: string }).version;
  const entryPath = opts.entryPath ?? fileURLToPath(new URL("./index.js", import.meta.url));
  let bundledVersion: string | null | undefined = opts.bundledVersion;
  if (bundledVersion === undefined) {
    try {
      bundledVersion = (
        require("@zturnlibs/ztron-darwin-arm64/package.json") as { version: string }
      ).version;
    } catch {
      bundledVersion = null;
    }
  }
  const bundledAbsent = bundledVersion === null;

  const nodeOk = Number.parseInt(process.versions.node, 10) >= 20;
  checks.push({
    name: "node >= 20",
    group: "Environment",
    pass: nodeOk,
    detail: process.versions.node,
    hint: "install Node.js 20+ from https://nodejs.org",
  });

  try {
    const p = env.ZTRON_TJS ?? findTjs();
    const pass = existsSync(resolve(p)) || p === "tjs";
    /* ZTRON_TJS pointing at a missing file is a distinct failure from "no
       chain found" — the fix is correcting the env var, not cloning. */
    const hint =
      env.ZTRON_TJS && !pass
        ? `ZTRON_TJS is set but points to a missing file: ${resolve(p)}. ${CHAIN_HINT}`
        : CHAIN_HINT;
    checks.push({ name: "tjs runtime", group: "Native chain", pass, detail: p, hint });
  } catch (e) {
    checks.push({ name: "tjs runtime", group: "Native chain", pass: false, detail: "not found", hint: CHAIN_HINT });
  }

  const host = env.ZTRON_HOST_BIN
    ? resolve(env.ZTRON_HOST_BIN)
    : findHostBin(cwd);
  const hostBundled = findBundledNative("ztron-host");
  checks.push({
    name: "ztron-host",
    group: "Native chain",
    pass: existsSync(host),
    detail: hostBundled ? `${host} (bundled: ${hostBundled})` : host,
    hint: CHAIN_HINT,
  });

  const lib = findWebviewLib(cwd);
  const libBundled = findBundledNative(
    platform === "win32" ? "webview.dll" : platform === "linux" ? "libwebview.so" : "libwebview.dylib",
  );
  checks.push({
    name: "webview library",
    group: "Native chain",
    pass: Boolean(lib && existsSync(lib)),
    detail: libBundled ? `${lib ?? "not found"} (bundled: ${libBundled})` : (lib ?? "not found"),
    hint: CHAIN_HINT,
  });

  /* CLI bin integrity: the installed entry must carry a node shebang. npm's
     bin-links auto-prepends it, but Volta/pnpm-style linkers install a bare
     symlink — without the shebang the kernel ENOEXECs and the user's shell
     interprets the JS as a script (2026-09-07 fork-chain incident). */
  let shebangOk = false;
  let shebangDetail = `${entryPath} (missing)`;
  try {
    const firstLine = readFileSync(entryPath, "utf8").split("\n")[0] ?? "";
    shebangOk = firstLine.startsWith("#!");
    shebangDetail = shebangOk ? `${entryPath} shebang ok` : `${entryPath} missing "#!" first line`;
  } catch {
    shebangOk = false;
  }
  checks.push({
    name: "cli bin integrity",
    group: "CLI",
    pass: shebangOk,
    detail: shebangDetail,
    hint: shebangOk ? "" : "reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`)",
  });

  /* Bundled chain / CLI version alignment: an out-of-sync platform package
     means the native chain predates the CLI — reinstall realigns them (the
     optionalDependencies pin is exact). No bundled package (source/dev mode)
     passes vacuously. */
  const chainSynced = bundledAbsent || bundledVersion === cliVersion;
  checks.push({
    name: "chain version",
    group: "CLI",
    pass: chainSynced,
    detail: bundledAbsent
      ? "bundled chain not installed (source/dev mode)"
      : `bundled ${bundledVersion} vs cli ${cliVersion}`,
    hint: chainSynced
      ? ""
      : "reinstall the CLI (`npm i -g @zturnlibs/ztron-cli`) to refresh the bundled native chain",
  });

  /* Platform: informational only — it never fails the doctor. Always emitted
     so the report has a stable shape (7 checks); on the supported dev
     platform it just confirms that, elsewhere it warns the host is a
     skeleton (see ROADMAP.md). */
  checks.push({
    name: "platform",
    group: "Platform",
    pass: true,
    detail:
      platform === "darwin"
        ? "darwin — supported dev platform"
        : `${platform} — host is a skeleton; macOS is the supported dev platform`,
    hint: platform === "darwin" ? "" : "see ROADMAP.md for Windows/Linux status",
  });

  return { checks, ok: checks.every((c) => c.pass) };
}

/**
 * Human rendering: grouped ✓/✗ card with aligned columns and a colored
 * summary. Pure (returns the text); ANSI colors degrade to plain text when
 * piped or NO_COLOR is set (see ui.ts).
 */
export function renderDoctor(report: DoctorReport): string {
  const groups: Array<[DoctorGroup, DoctorCheck[]]> = [];
  for (const c of report.checks) {
    const g = groups.find(([t]) => t === c.group);
    if (g) g[1].push(c);
    else groups.push([c.group, [c]]);
  }
  const width = Math.max(...report.checks.map((c) => c.name.length));
  const lines: string[] = [];
  for (const [title, checks] of groups) {
    if (lines.length) lines.push("");
    lines.push(bold(title));
    for (const c of checks) {
      const mark = c.pass ? green("✓") : red("✗");
      lines.push(`  ${mark} ${c.name.padEnd(width)}  ${c.detail}`);
      if (!c.pass && c.hint) lines.push(`    ↳ hint: ${yellow(c.hint)}`);
    }
  }
  lines.push("");
  const passed = report.checks.filter((c) => c.pass).length;
  const total = report.checks.length;
  lines.push(
    report.ok
      ? green(`✓ doctor: OK — ${passed}/${total} checks passed`)
      : red(`✗ doctor: FAILED — ${total - passed} of ${total} checks failed`),
  );
  return lines.join("\n");
}
