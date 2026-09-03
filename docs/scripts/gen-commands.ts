/**
 * gen-commands — command-surface reference generator.
 *
 * Consumes `COMMANDS` from `tests/helpers/manifest.ts` (the same source
 * of truth the runtime surface tests assert against, so "no missing, no
 * extra" holds by construction) and renders one markdown page per
 * locale: `docs/<locale>/reference/commands.md`. Commands are grouped by
 * their `plugin:<group>` namespace, in manifest order; the zh/en page
 * chrome is translated while command identifiers stay verbatim.
 *
 * The "API module" column links to the generated TypeDoc page
 * (`reference/api/<module>`, produced by gen:api) for the module that
 * owns the group. Links only point at modules that actually exist under
 * `packages/api/src/<module>.ts`; groups without a module (e.g.
 * `resources`) render "—".
 *
 * Usage:
 *   pnpm --dir docs run gen:commands          # regenerate zh + en pages
 *   pnpm --dir docs run gen:commands:check    # regenerate in memory and
 *                                             # byte-compare with the
 *                                             # committed files; exit 1
 *                                             # + diff summary on drift
 *
 * Constraints honored here:
 * - Paths are resolved from `import.meta.url`, never from `process.cwd()`.
 * - The manifest is imported via `--experimental-strip-types` (it is a
 *   plain typed-const module, no runtime TS features needed).
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
// Plain typed consts only — `--experimental-strip-types` imports it as-is.
import { COMMANDS } from "../../tests/helpers/manifest.ts";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** docs/ directory (this package's root). */
export const docsDir: string = path.resolve(scriptDir, "..");
/** Worktree/repository root (docs/ lives directly under it). */
export const projectRoot: string = path.resolve(docsDir, "..");
/** Source of truth for the registered command surface. */
export const manifestPath: string = path.join(
  projectRoot,
  "tests",
  "helpers",
  "manifest.ts",
);
/** API package sources (flat: one module per file). */
export const apiSourceDir: string = path.join(
  projectRoot,
  "packages",
  "api",
  "src",
);

/**
 * plugin group → API module name under `packages/api/src/`. Kept
 * explicit (instead of derived) so renames on either side break loudly
 * at review time; `linkTargetFor` additionally re-checks that the
 * module file exists before rendering a link.
 */
export const PLUGIN_TO_MODULE: Readonly<Record<string, string>> = {
  app: "app",
  autostart: "autostart",
  "barcode-scanner": "barcode-scanner",
  biometric: "biometric",
  cli: "cli",
  clipboard: "clipboard",
  "deep-link": "deep-link",
  dialog: "dialog",
  event: "event",
  fs: "fs",
  geolocation: "geolocation",
  "global-shortcut": "global-shortcut",
  haptics: "haptics",
  http: "http",
  image: "image",
  "local-ip": "local-ip",
  localhost: "localhost",
  log: "log",
  menu: "menu",
  network: "network",
  nfc: "nfc",
  notification: "notification",
  opener: "opener",
  os: "os",
  path: "path",
  "persisted-scope": "persisted-scope",
  process: "process",
  shell: "shell",
  "single-instance": "single-instance",
  sql: "sql",
  store: "store",
  stronghold: "stronghold",
  tray: "tray",
  updater: "updater",
  upload: "upload",
  websocket: "websocket",
  webview: "webview-window",
  window: "window",
  "window-state": "window-state",
};

/** `plugin:<group>|<cmd>` — group is the permission namespace. */
const COMMAND_RE = /^plugin:(?<group>[a-z-]*)\|(?<cmd>.*)$/;

export interface CommandEntry {
  /** Full manifest string, e.g. `plugin:window|show`. */
  readonly full: string;
  /** Permission namespace, e.g. `window`. */
  readonly group: string;
  /** Command name within the group, e.g. `show`. */
  readonly cmd: string;
}

export interface CommandGroup {
  /** Permission namespace, e.g. `window`. */
  readonly group: string;
  /** Entries in manifest order (duplicates collapsed). */
  readonly commands: readonly CommandEntry[];
}

/**
 * Parse the raw manifest strings into per-group entries, preserving
 * manifest order for both groups and commands and collapsing exact
 * duplicates (the surface test tolerates none today, but a duplicate
 * must not inflate the rendered table either).
 */
export function groupCommands(raw: readonly string[]): CommandGroup[] {
  const groups: CommandGroup[] = [];
  const byGroup = new Map<string, CommandEntry[]>();
  const seen = new Set<string>();
  for (const full of raw) {
    const match = COMMAND_RE.exec(full);
    if (!match?.groups) {
      throw new Error(
        `[gen-commands] manifest entry does not match plugin:<group>|<cmd>: ${JSON.stringify(full)}`,
      );
    }
    if (seen.has(full)) continue;
    seen.add(full);
    const entry: CommandEntry = {
      full,
      group: match.groups.group,
      cmd: match.groups.cmd,
    };
    let bucket = byGroup.get(entry.group);
    if (bucket) bucket.push(entry);
    else {
      bucket = [entry];
      byGroup.set(entry.group, bucket);
      groups.push({ group: entry.group, commands: bucket });
    }
  }
  return groups;
}

/**
 * Link target for a group's API module page (relative to
 * `reference/commands.md`), or `undefined` when the group has no module
 * mapping or the mapped module file does not exist — such cells render
 * "—" per the plan (e.g. `resources` has no API module).
 */
export function linkTargetFor(group: string): string | undefined {
  const module = PLUGIN_TO_MODULE[group];
  if (!module) return undefined;
  if (!existsSync(path.join(apiSourceDir, `${module}.ts`))) return undefined;
  return `./api/${module}`;
}

export type CommandsLocale = "en" | "zh";

const T = {
  en: {
    title: "# Command Surface Reference",
    intro:
      "Source: `tests/helpers/manifest.ts` — mirrors the runtime registration surface one-to-one; the surface tests guarantee no missing and no extra commands.",
    groupHeading: (group: string, count: number): string =>
      `## plugin:${group} (${count} ${count === 1 ? "command" : "commands"})`,
    columns: ["Command", "Permission owner (group)", "API module"],
    emptyModule: "—",
  },
  zh: {
    title: "# 命令面参考",
    intro:
      "来源：`tests/helpers/manifest.ts`，与运行时注册面一一对应——surface 测试保证不多不少。",
    groupHeading: (group: string, count: number): string =>
      `## plugin:${group}（${count} 条）`,
    columns: ["命令", "权限归属（group）", "API 模块"],
    emptyModule: "—",
  },
} as const;

/** Footer both locales share (command surface is version-pinned). */
const FOOTER = "适用版本：`ztron 0.3.0`";

/**
 * Render one locale's page. Table cells escape `|` so the full
 * `plugin:<group>|<cmd>` identifier survives GFM table parsing.
 */
export function renderCommandsPage({
  locale,
  groups,
}: {
  locale: CommandsLocale;
  groups: readonly CommandGroup[];
}): string {
  const t = T[locale];
  const lines: string[] = [t.title, "", t.intro, ""];
  let total = 0;
  for (const { group, commands } of groups) {
    total += commands.length;
    lines.push(t.groupHeading(group, commands.length), "");
    lines.push(`| ${t.columns.join(" | ")} |`);
    lines.push("| --- | --- | --- |");
    const target = linkTargetFor(group);
    const apiCell = target
      ? `[\`${path.basename(target)}\`](${target})`
      : t.emptyModule;
    for (const { full } of commands) {
      const cell = full.replaceAll("|", "\\|");
      lines.push(`| \`${cell}\` | \`${group}\` | ${apiCell} |`);
    }
    lines.push("");
  }
  lines.push(FOOTER, "");
  return lines.join("\n");
}

/** Output path for a locale's generated page. */
export function outputPathFor(locale: CommandsLocale): string {
  return path.join(docsDir, locale, "reference", "commands.md");
}

/** Regenerate both locales in memory and return the page contents. */
export function buildCommandPages(): Readonly<Record<CommandsLocale, string>> {
  const groups = groupCommands(COMMANDS);
  const pages = {
    en: renderCommandsPage({ locale: "en", groups }),
    zh: renderCommandsPage({ locale: "zh", groups }),
  } as const;
  const total = groups.reduce((n, g) => n + g.commands.length, 0);
  console.log(
    `[gen-commands] ${groups.length} groups / ${total} commands from ${path.relative(projectRoot, manifestPath)}`,
  );
  return pages;
}

interface CheckOutcome {
  exitCode: number;
}

/**
 * Drift gate (`--check`): compare freshly generated content with the
 * committed files byte-for-byte; on mismatch print which files drifted
 * plus a capped line-level summary and exit 1.
 */
async function runCheck(): Promise<CheckOutcome> {
  const { readFile } = await import("node:fs/promises");
  const pages = buildCommandPages();
  let drift = false;
  for (const locale of ["en", "zh"] as const) {
    const file = outputPathFor(locale);
    const committed = await readFile(file, "utf8");
    if (committed === pages[locale]) {
      console.log(`[gen-commands] ok: ${path.relative(projectRoot, file)}`);
      continue;
    }
    drift = true;
    const expected = pages[locale].split("\n");
    const actual = committed.split("\n");
    const firstDiff = expected.findIndex(
      (line, i) => line !== actual[i],
    );
    const at = firstDiff === -1 ? Math.min(expected.length, actual.length) : firstDiff;
    console.error(
      `[gen-commands] drift in ${path.relative(projectRoot, file)} ` +
        `(expected ${expected.length} lines, committed ${actual.length} lines; ` +
        `first difference at line ${at + 1})`,
    );
    for (let i = at; i < Math.min(at + 5, Math.max(expected.length, actual.length)); i++) {
      if (expected[i] !== actual[i]) {
        console.error(`  + ${expected[i] ?? "<no line>"}`);
        console.error(`  - ${actual[i] ?? "<no line>"}`);
      }
    }
  }
  if (drift) {
    console.error(
      "[gen-commands] check failed — run `pnpm --dir docs run gen:commands` and commit the regenerated pages",
    );
    return { exitCode: 1 };
  }
  console.log("[gen-commands] check: committed pages match generation");
  return { exitCode: 0 };
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  if (process.argv.slice(2).includes("--check")) {
    const { exitCode } = await runCheck();
    process.exitCode = exitCode;
  } else {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const pages = buildCommandPages();
    for (const locale of ["en", "zh"] as const) {
      const file = outputPathFor(locale);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, pages[locale]);
      console.log(`[gen-commands] wrote ${path.relative(projectRoot, file)}`);
    }
  }
}
