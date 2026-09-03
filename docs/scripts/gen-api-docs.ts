/**
 * gen-api-docs — TypeDoc → Rspress markdown API reference pipeline.
 *
 * Reads `docs/typedoc.json` (entry points, markdown plugin, zh-plugin)
 * and renders the `@zturnlibs/ztron-api` package to
 * `docs/<locale>/reference/api/*.md` plus an Rspress `_meta.json`
 * sidebar. The zh build overlays Chinese doc text from
 * `docs/translations/api-zh.json` via `typedoc.zh-plugin.ts`.
 *
 * Usage:
 *   pnpm --dir docs run gen:api          # en + zh builds
 *   pnpm --dir docs run gen:api:check    # builds + strict coverage gate
 *
 * Exports `buildApiDocs({ locale })` for reuse and testing.
 *
 * Constraints honored here:
 * - Paths are resolved from `import.meta.url`, never from `process.cwd()`.
 * - `--check` (strict): any symbol missed by `api-zh.json` or any
 *   orphaned JSON key exits 1. Seeding stage runs red by design — CI
 *   marks the step `continue-on-error` until translations are complete.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** docs/ directory (this package's root). */
export const docsDir: string = path.resolve(scriptDir, "..");
/** Worktree/repository root (docs/ lives directly under it). */
export const projectRoot: string = path.resolve(docsDir, "..");
/** typedoc.json, resolved against this script's own location. */
export const typedocConfigPath: string = path.join(docsDir, "typedoc.json");
/** API package source directory (flat: one module per file). */
export const apiSourceDir: string = path.join(
  projectRoot,
  "packages",
  "api",
  "src",
);
/** zh overlay dictionary consumed by typedoc.zh-plugin.ts. */
export const translationsPath: string = path.join(
  docsDir,
  "translations",
  "api-zh.json",
);
/** typedoc.zh-plugin.ts, resolved the same way typedoc loads it. */
const zhPluginUrl: string = pathToFileURL(
  path.join(docsDir, "typedoc.zh-plugin.ts"),
).href;

export type ApiDocsLocale = "en" | "zh";

function outputDirFor(locale: ApiDocsLocale): string {
  return path.join(docsDir, locale, "reference", "api");
}

/**
 * typedoc renders the project landing page (index.md, a "## Modules"
 * list) plus a separate page for the entry module itself. With
 * `flattenOutputFiles` the entry module page would collide with
 * index.md, so the markdown router slugger-renames it to `index-1.md`.
 * Its content (a re-export map mirroring the module pages) duplicates
 * the landing navigation, so we drop the page and its list entry.
 */
async function removeEntryModulePage(outDir: string): Promise<void> {
  const { readFile, rm, writeFile } = await import("node:fs/promises");
  await rm(path.join(outDir, "index-1.md"), { force: true });
  const landingPath = path.join(outDir, "index.md");
  const landing = await readFile(landingPath, "utf8");
  const stripped = landing.replace(
    /^[ \t]*-[ \t]*\[index\]\(index-1\.md\)[^\n]*\n?/m,
    "",
  );
  if (stripped === landing) {
    console.warn(
      `[gen-api-docs] warn: expected "- [index](index-1.md)" list entry not found in ${path.relative(projectRoot, landingPath)} — landing page left unmodified`,
    );
  }
  await writeFile(landingPath, stripped);
}

/**
 * Write the Rspress sidebar (`_meta.json`) for the generated API pages.
 *
 * `index.md` becomes the directory's landing route, so it is not listed
 * in the sidebar; the remaining entries are one per source module
 * (`fs`, `window`, …), sorted alphabetically for stable output.
 */
async function writeSidebarMeta(
  outDir: string,
  moduleNames: readonly string[],
): Promise<void> {
  const { writeFile } = await import("node:fs/promises");
  const metaPath = path.join(outDir, "_meta.json");
  await writeFile(metaPath, `${JSON.stringify(moduleNames, null, 2)}\n`);
}

/**
 * Build the API reference for one locale.
 *
 * Runs TypeDoc with `docs/typedoc.json`, overrides `entryPoints` and
 * `out` with absolute paths (cwd-independent), renders markdown via
 * typedoc-plugin-markdown, then writes `_meta.json`.
 *
 * The locale is passed to `typedoc.zh-plugin.ts` through
 * `ZTRON_API_LOCALE`: the `zh` build replaces doc text from
 * `docs/translations/api-zh.json`, `en` keeps the source comments.
 *
 * Returns the zh-plugin coverage state (only populated for `zh`).
 */
export async function buildApiDocs({
  locale,
}: {
  locale: ApiDocsLocale;
}): Promise<void> {
  const { Application } = await import("typedoc");
  const outDir = outputDirFor(locale);
  const zhPlugin = (await import(zhPluginUrl)) as typeof import("../typedoc.zh-plugin.ts");

  const prevLocale = process.env.ZTRON_API_LOCALE;
  process.env.ZTRON_API_LOCALE = locale;
  try {
    // `options` loads docs/typedoc.json (its relative paths — entryPoints,
    // plugin — are resolved against the config file's directory, so this is
    // cwd-independent). The absolute entryPoints/out overrides remove any
    // residual ambiguity about where the process was launched from.
    const app = await Application.bootstrapWithPlugins({
      options: typedocConfigPath,
      entryPoints: [apiSourceDir],
      out: outDir,
    });

    const reflections = await app.convert();
    if (!reflections) {
      throw new Error(
        "[gen-api-docs] typedoc convert() failed (see log above)",
      );
    }
    await app.generateOutputs(reflections);
    await removeEntryModulePage(outDir);

    const moduleNames = (reflections.children ?? [])
      .map((child) => child.name)
      .filter((name) => name !== "index")
      .sort((a, b) => a.localeCompare(b));
    await writeSidebarMeta(outDir, moduleNames);

    console.log(
      `[gen-api-docs] ${locale}: ${moduleNames.length} module pages + 1 landing page + _meta.json -> ${path.relative(projectRoot, outDir)}`,
    );
  } finally {
    if (prevLocale === undefined) {
      delete process.env.ZTRON_API_LOCALE;
    } else {
      process.env.ZTRON_API_LOCALE = prevLocale;
    }
  }

  if (locale === "zh") {
    const encounteredList = zhPlugin.encountered();
    const translatedList = zhPlugin.translated();
    console.log(
      `[gen-api-docs] zh coverage: covered ${translatedList.length}/${encounteredList.length} symbols translated, ${zhPlugin.missed().length} missed (dictionary: ${path.relative(projectRoot, translationsPath)})`,
    );
  }
}

interface CheckOutcome {
  exitCode: number;
}

/**
 * Strict coverage gate (`--check`): regenerate both locales, then fail
 * when any documented symbol lacks a `api-zh.json` key (missing) or any
 * JSON key never matched a symbol (orphan). Prints the debt lists so
 * they can drive translation work directly.
 */
async function runCheck(): Promise<CheckOutcome> {
  const { readFile } = await import("node:fs/promises");
  const zhPlugin = (await import(zhPluginUrl)) as typeof import("../typedoc.zh-plugin.ts");
  const { diffTranslationKeys } = await import(
    "./check-api-translations.ts"
  );

  await buildApiDocs({ locale: "en" });
  await buildApiDocs({ locale: "zh" });

  const used = new Set(zhPlugin.encountered());
  const defined = JSON.parse(await readFile(translationsPath, "utf8")) as Record<
    string,
    unknown
  >;
  const { missing, orphans } = diffTranslationKeys(used, defined);

  console.log(
    `[gen-api-docs] strict coverage: covered ${used.size - missing.length}/${used.size} encountered symbols; ${Object.keys(defined).length} keys defined`,
  );
  if (missing.length > 0) {
    console.error(
      `[gen-api-docs] strict: ${missing.length} documented symbols missing from api-zh.json:\n  ${missing.join("\n  ")}`,
    );
  }
  if (orphans.length > 0) {
    console.error(
      `[gen-api-docs] strict: ${orphans.length} orphaned keys never matched a documented symbol:\n  ${orphans.join("\n  ")}`,
    );
  }
  if (missing.length > 0 || orphans.length > 0) {
    return { exitCode: 1 };
  }
  console.log("[gen-api-docs] strict: api translations fully covered");
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
    await buildApiDocs({ locale: "en" });
    await buildApiDocs({ locale: "zh" });
  }
}
