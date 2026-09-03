# Task 5 Report: 英文全量镜像 (English full mirror)

Status: COMPLETE. Commit `7146b43` on `feat/docs`.

## Pre-step: zh defect fix
`docs/zh/guide/tauri-migration.md` §9 table had its header row + `---` separator duplicated as literal data rows. Removed the two duplicate rows; now ONE header (`Rust 模块 | Ztron TS 等价物`) + separator + 8 data rows. Content otherwise identical. Included in the same scoped commit.

## Files created (docs/en/)
- `index.md` (replaced placeholder landing with translation)
- `start/{_meta.json,intro.md,install.md,quick-start.md,examples.md}`
- `guide/{_meta.json,architecture.md,ipc.md,events.md,window.md,config.md,security.md,tauri-migration.md}`
- `reference/{_meta.json,cli.md}`

Sidebar texts in English per brief (Introduction / Prerequisites & Installation / Quick Start / Examples / Architecture Overview / Calling Backend Commands / Events & Channel / Windows / Configuring ztron.conf.json / Security Model / Migrating from Tauri / CLI Reference).

## Verification (all exit 0)
```
pnpm --dir docs run check:locales         → [check-locales] OK — zh/en trees match
pnpm --dir docs run check:locales:deploy  → [check-locales] OK — zh/en trees match, no placeholders
```
(pnpm build / rspress intentionally NOT run — macOS 26 native deadlock; CI covers it.)

### Heading parity per page (zh count = en count)
| Page | Headings |
|---|---|
| index.md | 1 |
| start/intro.md | 4 |
| start/install.md | 5 |
| start/quick-start.md | 3 |
| start/examples.md | 3 |
| guide/architecture.md | 4 |
| guide/ipc.md | 5 |
| guide/events.md | 4 |
| guide/window.md | 4 |
| guide/config.md | 3 |
| guide/security.md | 4 |
| guide/tauri-migration.md | 4 |
| reference/cli.md | 12 |

All 13 pairs equal. Link arrays also verified identical (order + paths) between zh and en for every page; all pages end with `适用版本：\`ztron 0.1.0\``; zero `<!-- i18n:untranslated -->` markers.

## Self-review notes
- Terminology table applied: command (invoke untranslated), capability, scope (PathScope/HttpScope untranslated), window (WebviewWindow untranslated), tray, updater, bundling/packaging, regression run.
- Code blocks copied verbatim; in-code zh comments translated in ipc.md/events.md code samples (allowed).
- Caught and fixed during self-review: typo'd GitHub repo URLs in en/start/intro.md (stron→ztron), a stray double backtick in tauri-migration.md — both corrected before commit.
- en guide/ipc.md keeps one zh comment line header style translated; consistent throughout.
- zh table fix translated into the en §9 table as a single header + 8 rows (normalized spacing).

## Commit
`7146b43 docs(en): full english mirror of start/guide/reference` — scoped `git add docs/en docs/zh/guide/tauri-migration.md` only (17 files, +814/-4).
