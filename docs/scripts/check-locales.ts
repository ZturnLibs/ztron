/**
 * check-locales — enforce zh/en structural parity for the docs site.
 * zh/ is the canonical tree; en/ must mirror it file-for-file.
 * Exit 1 on any mismatch. --deploy additionally fails on untranslated
 * placeholder markers in en/ pages (release gate, spec §5.1/§8.2).
 * reference/api/ is exempt: P2 gen-api-docs output, gitignored.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXEMPT = [/^reference[/\\]api[/\\]/];
const PLACEHOLDER = /<!--\s*i18n:untranslated\s*-->/;
const TRACKED = /\.(md|mdx)$|^_meta\.json$|^_nav\.json$/;

export function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, base))) {
    const rel = base ? `${base}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...walk(dir, rel));
    else if (TRACKED.test(name)) out.push(rel);
  }
  return out;
}

export interface TreeDiff {
  missingInEn: string[];
  missingInZh: string[];
}

export function diffTrees(zhFiles: string[], enFiles: string[]): TreeDiff {
  const keep = (f: string) => !EXEMPT.some((re) => re.test(f));
  const en = new Set(enFiles.filter(keep));
  const zh = new Set(zhFiles.filter(keep));
  return {
    missingInEn: zhFiles.filter((f) => keep(f) && !en.has(f)),
    missingInZh: enFiles.filter((f) => keep(f) && !zh.has(f)),
  };
}

export function findPlaceholders(enDir: string, enFiles: string[]): string[] {
  return enFiles.filter(
    (f) => f.endsWith(".md") && PLACEHOLDER.test(readFileSync(join(enDir, f), "utf8")),
  );
}

function main(): void {
  const deploy = process.argv.includes("--deploy");
  const zhDir = join(ROOT, "zh");
  const enDir = join(ROOT, "en");
  const { missingInEn, missingInZh } = diffTrees(walk(zhDir), walk(enDir));
  const placeholders = deploy ? findPlaceholders(enDir, walk(enDir)) : [];
  for (const f of missingInEn) console.error(`[check-locales] missing in en/: ${f}`);
  for (const f of missingInZh) console.error(`[check-locales] missing in zh/: ${f}`);
  for (const f of placeholders) console.error(`[check-locales] untranslated placeholder in en/: ${f}`);
  if (missingInEn.length || missingInZh.length || placeholders.length) process.exit(1);
  console.log(`[check-locales] OK — zh/en trees match${deploy ? ", no placeholders" : ""}`);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main();
