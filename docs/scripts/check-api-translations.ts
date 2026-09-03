/**
 * check-api-translations — pure key-diff core of the strict zh-coverage
 * gate for the generated API reference.
 *
 * `typedoc.zh-plugin.ts` records every symbol it encounters during the
 * zh build (qualified names like `fs.readFile`); `docs/translations/
 * api-zh.json` defines the translations that exist. This module turns
 * those two sets into the missing/orphans report consumed by
 * `gen-api-docs.ts --check` (see `gen:api:check`).
 *
 * Kept free of typedoc imports so it stays cheap to unit-test.
 */

export interface TranslationKeyDiff {
  /** Encountered during the zh build but has no JSON entry. */
  missing: string[];
  /** JSON entry never encountered during the zh build. */
  orphans: string[];
}

/**
 * Diff the keys the zh build actually encountered against the keys
 * defined in `api-zh.json`. Both output lists are sorted so reports
 * (and test expectations) are deterministic.
 */
export function diffTranslationKeys(
  used: ReadonlySet<string>,
  defined: Record<string, unknown>,
): TranslationKeyDiff {
  const definedKeys = new Set(Object.keys(defined));
  const missing = [...used].filter((key) => !definedKeys.has(key)).sort();
  const orphans = [...definedKeys]
    .filter((key) => !used.has(key))
    .sort();
  return { missing, orphans };
}
