# Task 2 Report: check-locales 结构一致性检查（TDD）

## Implemented
- `docs/scripts/check-locales.test.ts` — 5 unit tests transcribed from brief (diffTrees parity, missing-in-en/zh, reference/api exemption, findPlaceholders marker detection).
- `docs/scripts/check-locales.ts` — exports `walk`, `diffTrees`, `findPlaceholders`; CLI with exit 0/1 and `--deploy` placeholder gate (`<!-- i18n:untranslated -->`); `reference/api/` subtree exempt. Transcribed verbatim from brief.

## TDD Evidence
RED (`pnpm --dir docs run test`, before implementation):
- FAIL: module not found — `Cannot find module '.../docs/scripts/check-locales.ts'`; 1 fail.

GREEN (`pnpm --dir docs run test`):
- `ℹ tests 5 / pass 5 / fail 0`.

## CLI verification
- `pnpm --dir docs run check:locales` → `[check-locales] OK — zh/en trees match`, exit 0.
- `pnpm --dir docs run check:locales:deploy` → `[check-locales] OK — zh/en trees match, no placeholders`, exit 0.
- (Node 24 emits an ExperimentalWarning about --experimental-strip-types; harmless, pre-existing script flag from Task 1.)

## Files changed
- Created: docs/scripts/check-locales.ts, docs/scripts/check-locales.test.ts
- Commit: 0673e0e "docs(site): zh/en parity checker - tree diff + deploy placeholder gate (TDD)" (scoped add only; no other files touched)

## Self-review
- Code matches brief exactly; no deviations.
- Exemption, placeholder regex, tracked extensions (.md/.mdx/_meta.json/_nav.json) all covered by tests or directly exercised by CLI.
- No native deps involved; rspress never invoked.
- No concerns.
