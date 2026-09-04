/**
 * gen-config — full configuration reference generator.
 *
 * Consumes `interface ProjectConfigFile` from `packages/core/src/app.ts`
 * (parsed with the TypeScript compiler API — field name / type text /
 * optionality / top-of-member jsdoc) and renders one markdown page per
 * locale: `docs/<locale>/reference/config.md`. Nested object-literal
 * types are flattened into dotted paths (`build.devUrl`,
 * `app.security.csp`, `app.security.assetProtocol.scope`, …) and grouped
 * into their own tables (build / app / app.security / bundle), while the
 * top-level table keeps every interface member verbatim (container
 * members render as `object` with a pointer to their section).
 *
 * Descriptions:
 * - zh: `docs/translations/config-zh.json`, keys = dotted field paths.
 *   Coverage is STRICT — a field without a zh key fails generation with
 *   the list of missing paths (the zh site must never show gaps).
 * - en: the member's jsdoc text verbatim (leading `*`/whitespace
 *   stripped); empty jsdoc renders "—". The `windows` row additionally
 *   links to the window guide (WindowConfig fields live outside this
 *   interface and are deliberately not enumerated here).
 *
 * Usage:
 *   pnpm --dir docs run gen:config          # regenerate zh + en pages
 *   pnpm --dir docs run gen:config:check    # regenerate in memory and
 *                                           # byte-compare with the
 *                                           # committed files; exit 1
 *                                           # + drift summary on drift
 *
 * Constraints honored here:
 * - Paths are resolved from `import.meta.url`, never from `process.cwd()`.
 * - `typescript` is a devDependency of the docs package (parsed source
 *   text only; no type-checker program is spun up).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

/** docs/ directory (this package's root). */
export const docsDir: string = path.resolve(scriptDir, "..");
/** Worktree/repository root (docs/ lives directly under it). */
export const projectRoot: string = path.resolve(docsDir, "..");
/** Source of truth for the config surface. */
export const appTsPath: string = path.join(
  projectRoot,
  "packages",
  "core",
  "src",
  "app.ts",
);
/** zh descriptions, keys = dotted field paths. */
export const zhTranslationsPath: string = path.join(
  docsDir,
  "translations",
  "config-zh.json",
);
/** The one interface this generator documents. */
export const INTERFACE_NAME = "ProjectConfigFile";

/** Table groups in render order; anything else fails generation. */
export const GROUP_ORDER = ["top", "build", "app", "app.security", "bundle"] as const;

export interface FieldRow {
  /** Dotted path from `ProjectConfigFile`, e.g. `build.devUrl`. */
  readonly path: string;
  /** Whitespace-collapsed TS type text (`object` for container rows). */
  readonly type: string;
  /** Declared with `?` in the source. */
  readonly optional: boolean;
  /** Top-of-member jsdoc, cleaned to one line; "" when absent. */
  readonly jsdoc: string;
}

export interface FieldGroup {
  /** "top" or the dotted container path ("build", "app", …). */
  readonly key: string;
  readonly rows: readonly FieldRow[];
}

/** Collapse any multi-line source text to a single table-safe line. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Top-of-member jsdoc: the parser keeps the comment text without the
 * leading `*` gutter, but multi-line indentation may remain — strip it
 * and join to one line.
 */
function jsdocOf(
  member: ts.InterfaceDeclaration["members"][number],
  sf: ts.SourceFile,
): string {
  const docs = (member as { jsDoc?: readonly ts.JSDoc[] }).jsDoc ?? [];
  const raw = docs
    .map((d) => {
      const c = d.comment;
      if (typeof c === "string") return c;
      return Array.isArray(c) ? c.map((n) => n.getText(sf)).join("") : "";
    })
    .join("\n");
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*\*+\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** Property name, or `[key: string]`-style text for index signatures. */
function memberName(
  member: ts.InterfaceDeclaration["members"][number],
  sf: ts.SourceFile,
): string {
  if (ts.isIndexSignatureDeclaration(member)) {
    const param = member.parameters[0];
    return `[${param.name.getText(sf)}: ${param.type?.getText(sf) ?? "unknown"}]`;
  }
  return member.name.getText(sf);
}

/** Recursively flatten object-literal types into dotted-path leaf rows. */
function walkLiteral(
  literal: ts.TypeLiteralNode,
  prefix: string,
  sf: ts.SourceFile,
): FieldRow[] {
  const rows: FieldRow[] = [];
  for (const member of literal.members) {
    if (!ts.isPropertySignature(member) || !member.type) continue;
    const name = member.name.getText(sf);
    const fullPath = prefix ? `${prefix}.${name}` : name;
    if (ts.isTypeLiteralNode(member.type)) {
      rows.push(...walkLiteral(member.type, fullPath, sf));
    } else {
      rows.push({
        path: fullPath,
        type: oneLine(member.type.getText(sf)),
        optional: Boolean(member.questionToken),
        jsdoc: jsdocOf(member, sf),
      });
    }
  }
  return rows;
}

/**
 * Group a leaf row: `app.security.*` is promoted to its own table per
 * the page layout; every other leaf groups under its top-level member.
 */
function groupFor(p: string): string {
  if (p === "app.security" || p.startsWith("app.security.")) return "app.security";
  return p.split(".")[0];
}

/**
 * Parse `ProjectConfigFile` out of the source text.
 * Returns the top-level table (every interface member; container members
 * collapse to type `object`) plus the nested leaf tables in GROUP_ORDER.
 */
export function collectRows(sourceText: string): {
  top: FieldRow[];
  groups: FieldGroup[];
} {
  const sf = ts.createSourceFile(appTsPath, sourceText, ts.ScriptTarget.Latest, true);
  let iface: ts.InterfaceDeclaration | undefined;
  sf.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === INTERFACE_NAME) {
      iface = node;
    }
  });
  if (!iface) {
    throw new Error(
      `[gen-config] interface ${INTERFACE_NAME} not found in ${appTsPath}`,
    );
  }

  const top: FieldRow[] = [];
  const leaves: FieldRow[] = [];
  for (const member of iface.members) {
    const name = memberName(member, sf);
    const optional = ts.isPropertySignature(member) && Boolean(member.questionToken);
    const jsdoc = jsdocOf(member, sf);
    const typeNode = ts.isPropertySignature(member) ? member.type : undefined;
    if (typeNode && ts.isTypeLiteralNode(typeNode)) {
      // Container member: enumerated in its own table below.
      top.push({ path: name, type: "object", optional, jsdoc });
      leaves.push(...walkLiteral(typeNode, name, sf));
    } else {
      top.push({
        path: name,
        type: oneLine(typeNode?.getText(sf) ?? "unknown"),
        optional,
        jsdoc,
      });
    }
  }

  const byGroup = new Map<string, FieldRow[]>();
  for (const row of leaves) {
    const key = groupFor(row.path);
    if (!GROUP_ORDER.includes(key as (typeof GROUP_ORDER)[number])) {
      throw new Error(
        `[gen-config] leaf ${row.path} maps to group "${key}" which is not in ` +
          `GROUP_ORDER (${GROUP_ORDER.join(", ")}) — update the generator layout`,
      );
    }
    const bucket = byGroup.get(key);
    if (bucket) bucket.push(row);
    else byGroup.set(key, [row]);
  }
  const groups = [...byGroup.entries()]
    .sort((a, b) => GROUP_ORDER.indexOf(a[0] as "top") - GROUP_ORDER.indexOf(b[0] as "top"))
    .map(([key, rows]) => ({ key, rows }));
  return { top, groups };
}

/**
 * Cross-references appended to specific rows. `windows` links to the
 * window guide: its `WindowConfig` fields are declared elsewhere in the
 * same source file and are intentionally not enumerated in this page.
 */
const CROSS_LINKS: Record<
  string,
  { href: string; zh: string; en: string; enFallback: string }
> = {
  windows: {
    href: "../guide/window",
    zh: "窗口字段（WindowConfig）全表见[窗口](../guide/window)",
    en: "per-window fields (WindowConfig) are documented in [Windows](../guide/window)",
    enFallback: "Declarative window startup state",
  },
};

/** Escape a cell for GFM tables (raw `|` would split the cell). */
function esc(s: string): string {
  return s.replaceAll("|", "\\|");
}

export type ConfigLocale = "en" | "zh";

const T = {
  en: {
    title: "# Configuration Reference · All Fields",
    intro:
      "Source: the `ProjectConfigFile` interface in `packages/core/src/app.ts`; generated by `pnpm --dir docs run gen:config` — do not edit by hand (drift is gated by `gen:config:check`). Unknown top-level keys are not rejected: validation warns and keeps them as-is — hence the `[key: string]` index signature below.",
    counts: (parts: readonly string[], total: number): string =>
      `${total} rows total: ${parts.join(" · ")}.`,
    topHeading: (n: number): string => `## Top level (${n} fields)`,
    groupHeading: (key: string, n: number): string => `## ${key} (${n} fields)`,
    columns: ["Field", "Type", "Description"],
  },
  zh: {
    title: "# 配置参考 · 全字段",
    intro:
      "来源：`packages/core/src/app.ts` 的 `ProjectConfigFile` 接口，由 `pnpm --dir docs run gen:config` 生成——请勿手改（漂移由 `gen:config:check` 把关）。未知顶层键不会被拒绝：校验时告警并原样保留，对应下表的 `[key: string]` 索引签名。",
    counts: (parts: readonly string[], total: number): string =>
      `共 ${total} 行：${parts.join(" · ")}。`,
    topHeading: (n: number): string => `## 顶层字段（${n} 项）`,
    groupHeading: (key: string, n: number): string => `## ${key}（${n} 项）`,
    columns: ["字段", "类型", "说明"],
  },
} as const;

/** Footer both locales share (config surface is version-pinned). */
const FOOTER = "适用版本：`ztron 0.3.1`";

/**
 * Description cell for one row. zh comes from config-zh.json (missing
 * key = hard failure); en comes from the member jsdoc ("—" when empty),
 * except rows carrying a cross-link, which get a curated fallback so the
 * link never lands on a bare "—".
 */
function descriptionCell(
  row: FieldRow,
  locale: ConfigLocale,
  zhDesc: Readonly<Record<string, string>>,
): string {
  const link = CROSS_LINKS[row.path];
  if (locale === "zh") {
    const base = zhDesc[row.path];
    if (base === undefined) {
      throw new Error(
        `[gen-config] missing zh description for "${row.path}" — add it to ` +
          `${zhTranslationsPath} (keys are dotted field paths)`,
      );
    }
    return esc(link ? `${base}；${link.zh}` : base);
  }
  const base = row.jsdoc || link?.enFallback || "";
  if (!base) return "—";
  return esc(link ? `${base}; ${link.en}` : base);
}

/** Render one locale's page. */
export function renderConfigPage({
  locale,
  top,
  groups,
  zhDesc,
}: {
  locale: ConfigLocale;
  top: readonly FieldRow[];
  groups: readonly FieldGroup[];
  zhDesc: Readonly<Record<string, string>>;
}): string {
  const t = T[locale];
  const sections: Array<{ key: string; rows: readonly FieldRow[] }> = [
    { key: "top", rows: top },
    ...groups,
  ];
  const counts = sections.map((s) => `${s.key} ${s.rows.length}`);
  const lines: string[] = [t.title, "", t.intro, "", t.counts(counts, sections.reduce((n, s) => n + s.rows.length, 0)), ""];
  for (const section of sections) {
    lines.push(
      section.key === "top"
        ? t.topHeading(section.rows.length)
        : t.groupHeading(section.key, section.rows.length),
      "",
    );
    lines.push(`| ${t.columns.join(" | ")} |`);
    lines.push("| --- | --- | --- |");
    for (const row of section.rows) {
      const name = `\`${row.path}${row.optional ? "?" : ""}\``;
      lines.push(
        `| ${name} | \`${esc(row.type)}\` | ${descriptionCell(row, locale, zhDesc)} |`,
      );
    }
    lines.push("");
  }
  lines.push(FOOTER, "");
  return lines.join("\n");
}

/** Output path for a locale's generated page. */
export function outputPathFor(locale: ConfigLocale): string {
  return path.join(docsDir, locale, "reference", "config.md");
}

/** Regenerate both locales in memory and return the page contents. */
export function buildConfigPages(): Readonly<Record<ConfigLocale, string>> {
  const sourceText = readFileSync(appTsPath, "utf8");
  const zhDesc = JSON.parse(readFileSync(zhTranslationsPath, "utf8")) as Record<
    string,
    string
  >;
  const { top, groups } = collectRows(sourceText);
  const pages = {
    en: renderConfigPage({ locale: "en", top, groups, zhDesc }),
    zh: renderConfigPage({ locale: "zh", top, groups, zhDesc }),
  } as const;
  const total = top.length + groups.reduce((n, g) => n + g.rows.length, 0);
  console.log(
    `[gen-config] ${total} rows (top ${top.length}` +
      `${groups.map((g) => `, ${g.key} ${g.rows.length}`).join("")})` +
      ` from ${path.relative(projectRoot, appTsPath)}::${INTERFACE_NAME}`,
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
  const pages = buildConfigPages();
  let drift = false;
  for (const locale of ["en", "zh"] as const) {
    const file = outputPathFor(locale);
    const committed = await readFile(file, "utf8");
    if (committed === pages[locale]) {
      console.log(`[gen-config] ok: ${path.relative(projectRoot, file)}`);
      continue;
    }
    drift = true;
    const expected = pages[locale].split("\n");
    const actual = committed.split("\n");
    const firstDiff = expected.findIndex((line, i) => line !== actual[i]);
    const at =
      firstDiff === -1 ? Math.min(expected.length, actual.length) : firstDiff;
    console.error(
      `[gen-config] drift in ${path.relative(projectRoot, file)} ` +
        `(expected ${expected.length} lines, committed ${actual.length} lines; ` +
        `first difference at line ${at + 1})`,
    );
    for (
      let i = at;
      i < Math.min(at + 5, Math.max(expected.length, actual.length));
      i++
    ) {
      if (expected[i] !== actual[i]) {
        console.error(`  + ${expected[i] ?? "<no line>"}`);
        console.error(`  - ${actual[i] ?? "<no line>"}`);
      }
    }
  }
  if (drift) {
    console.error(
      "[gen-config] check failed — run `pnpm --dir docs run gen:config` and commit the regenerated pages",
    );
    return { exitCode: 1 };
  }
  console.log("[gen-config] check: committed pages match generation");
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
    const pages = buildConfigPages();
    for (const locale of ["en", "zh"] as const) {
      const file = outputPathFor(locale);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, pages[locale]);
      console.log(`[gen-config] wrote ${path.relative(projectRoot, file)}`);
    }
  }
}
