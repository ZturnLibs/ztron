/**
 * gen-api-docs — TypeDoc → Rspress markdown API reference pipeline.
 *
 * Reads `docs/typedoc.json` (entry points, markdown plugin, zh-plugin
 * shell) and renders the `@zturnlibs/ztron-api` package to
 * `docs/<locale>/reference/api/*.md` plus an Rspress `_meta.json`
 * sidebar.
 *
 * Usage:
 *   pnpm --dir docs run gen:api          # en build (zh skipped until T2)
 *   pnpm --dir docs run gen:api -- --check
 *
 * Exports `buildApiDocs({ locale })` for reuse by the P2 Task 2 overlay.
 *
 * Constraints honored here:
 * - Paths are resolved from `import.meta.url`, never from `process.cwd()`.
 * - Only `en` is generated in Task 1; `zh` logs a skip line.
 * - `--check` is a placeholder (Task 2 wires up freshness validation).
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
  await writeFile(
    landingPath,
    landing.replace(/^[ \t]*-[ \t]*\[index\]\(index-1\.md\)[^\n]*\n?/m, ""),
  );
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
 * - `en`: runs TypeDoc with `docs/typedoc.json`, overrides `entryPoints`
 *   and `out` with absolute paths (cwd-independent), renders markdown via
 *   typedoc-plugin-markdown, then writes `_meta.json`.
 * - `zh`: skipped in Task 1 — the bilingual overlay is Task 2.
 */
export async function buildApiDocs({
  locale,
}: {
  locale: ApiDocsLocale;
}): Promise<void> {
  if (locale === "zh") {
    console.log(
      "[gen-api-docs] zh: skipped — bilingual overlay lands in P2 Task 2",
    );
    return;
  }

  const { Application } = await import("typedoc");
  const outDir = outputDirFor(locale);

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
    throw new Error("[gen-api-docs] typedoc convert() failed (see log above)");
  }
  await app.generateOutputs(reflections);
  await removeEntryModulePage(outDir);

  const moduleNames = (reflections.children ?? [])
    .map((child) => child.name)
    .filter((name) => name !== "index")
    .sort((a, b) => a.localeCompare(b));
  await writeSidebarMeta(outDir, moduleNames);

  console.log(
    `[gen-api-docs] ${locale}: ${moduleNames.length + 1} module pages + _meta.json -> ${path.relative(projectRoot, outDir)}`,
  );
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  if (process.argv.slice(2).includes("--check")) {
    // Placeholder: Task 2 adds zh-overlay freshness validation here.
    console.log(
      "[gen-api-docs] --check: placeholder (implemented in P2 Task 2)",
    );
  } else {
    await buildApiDocs({ locale: "en" });
    await buildApiDocs({ locale: "zh" });
  }
}
