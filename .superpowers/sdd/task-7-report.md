# Task 7 Report: 根仓库接线（转发脚本 + README 入口）

## Status: COMPLETE

Commit: `7ee455d` on `feat/docs` — "docs: root wiring - docs:* forwarding scripts + README section"
(2 files changed: README.md +10, package.json +6/-1)

## What was done

1. **Root `package.json`** — appended 4 scripts verbatim from the brief, after `dev`, with comma placement corrected (`dev` gained a trailing comma; `docs:check` is last, no trailing comma):
   - `docs:dev` → `pnpm --dir docs run dev`
   - `docs:build` → `pnpm --dir docs run build`
   - `docs:preview` → `pnpm --dir docs run preview`
   - `docs:check` → `pnpm --dir docs run check:locales`
   - Existing scripts (build/typecheck/test/test:unit/dev) untouched.
2. **Root `README.md`** — inserted the `## Documentation` section verbatim from the brief between `## Tests` (after "See `tests/README.md` for the design.") and `## Quick start`.

## ⚠️ Major environment finding: branch drift (handled)

- The task context said "branch feat/docs", but the main checkout `/Users/zyj/Zturn/Ztron` was **on `main`** (b38105d) — docs/ content (Tasks 1–6) does not exist on main; it lives only on `feat/docs` (3e1b6eb). Stale `docs/node_modules` in the main checkout suggests it *was* on feat/docs during Tasks 1–6 and was switched to main afterwards (possibly by the home-page session setup or the user).
- My first edits landed on main's file states. I **reverted them** (`git restore README.md package.json` in the main checkout) and redid the work on the correct branch.
- Direct `git checkout feat/docs` was blocked: README.md/package.json differ between branches (main is at 0.3.0 with `@zturnlibs/ztron-*`-era README; feat/docs root at 0.1.0 with `@zturnlibs/ztron-*` rename) and `.superpowers/sdd/progress.md` (controller's task-6 tracking line — preserved untouched) also differs and is locally modified.
- **Solution**: created a dedicated worktree `/Users/zyj/Zturn/Ztron/.worktrees/docs` on `feat/docs`, applied edits there, verified, committed there. Main checkout left exactly as found (only controller's progress.md mod + untracked `.worktrees/`). Worktree kept in place (has node_modules + dist builds; useful for Task 8). Main and feat/docs have diverged and will need a deliberate merge/integration decision by the controller — out of scope here.

## Adaptations from the brief

1. **Verification (controller-authorized)**: ran `pnpm docs:check` + `pnpm test` only; did NOT run `pnpm docs:build`/rspress (macOS 26 native-module hang; build verified in CI per Task 8).
2. **Worktree instead of main checkout** (branch drift, see above). Same scoped `git add package.json README.md` discipline — never `git add -A`/`commit -a`.
3. **Extra bootstrap in the worktree** (environmental, not content changes): fresh worktree lacked gitignored artifacts, so `pnpm install --frozen-lockfile` (465 ms) + `pnpm build` (all `tsc`, exit 0) were required before `pnpm test` could run — tests import `packages/*/dist/index.js`. No repo files changed by this.

## Verification results (in the worktree, on feat/docs)

| Check | Result |
| --- | --- |
| `pnpm docs:check` | exit 0 — `[check-locales] OK — zh/en trees match`; forwarding script resolves `docs/` correctly |
| `pnpm test` | exit 0 — 126 tests: 125 pass / 1 skip / 0 fail (root test chain unaffected; feat/docs has a few more tests than main's 110 due to stronghold/F4 commits) |
| `node -e "JSON.parse(...)"` on package.json | valid JSON |

Not run (per adaptation): `pnpm docs:build` — deferred to CI (Task 8).

## Commit hygiene

- `git status` before commit showed exactly `M README.md`, `M package.json` — nothing else staged or swept in.
- Commit: `7ee455d`, parents on `feat/docs` (3e1b6eb = Task 6).

## Concerns / follow-ups for controller

1. **Branch drift is the big one**: the SDD docs project (feat/docs) and main (0.3.0, renamed packages) have diverged. Task 8 (CI) should be done aware of this; eventually feat/docs needs rebasing/merging onto main, and root README/package.json will conflict (both were modified on main since the fork point: version bump 0.1.0→0.3.0, README `@zturnlibs/ztron-*`→? naming, Tests count). My commit touches exactly the two files that will conflict — resolution is straightforward (keep main's newer content + add the docs wiring).
2. Worktree `/Users/zyj/Zturn/Ztron/.worktrees/docs` left in place (clean, committed). Remove with `git worktree remove .worktrees/docs` when no longer needed.
3. Main checkout untouched: `git status` = only ` M .superpowers/sdd/progress.md` (controller's) + `?? .worktrees/`.
