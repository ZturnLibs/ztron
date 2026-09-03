# Task 8 Report: CI docs job

**Status:** DONE
**Branch:** feat/docs (worktree /Users/zyj/Zturn/Ztron/.worktrees/docs)
**Commit:** bd0fb74 `ci: docs job - locale parity, script tests, site build`

## What was done

1. Read brief `/Users/zyj/Zturn/Ztron/.superpowers/sdd/task-8-brief.md`.
2. Confirmed `.github/workflows/ci.yml` on feat/docs had no existing `docs:` job
   (jobs were: unit, native-linux, native-windows, macos-spike) — not BLOCKED.
3. Appended the exact `docs:` job from the brief (verbatim) at the end of the
   file, at the same 2-space indent level as the existing jobs:
   - `name: docs (parity + build)`, `runs-on: ubuntu-latest`
   - `defaults.run.working-directory: docs`
   - actions/checkout@v4, pnpm/action-setup@v4 (version 9.15.4),
     actions/setup-node@v4 (node 22) — matches existing job conventions
   - steps: `pnpm install --frozen-lockfile`, `pnpm test`,
     `pnpm run check:locales`, `pnpm run build`
4. Scoped git: `git -C <worktree> add .github/workflows/ci.yml` only.

## Verification

- YAML syntax: python3 PyYAML unavailable in this env (ModuleNotFoundError);
  fell back to ruby per brief — `YAML.load_file` → `yaml ok`, jobs parse as:
  `unit, native-linux, native-windows, macos-spike, docs`.
- Prerequisites confirmed: `docs/package.json` exposes `test`
  (`node --experimental-strip-types --test scripts/*.test.ts`), `check:locales`
  (`node --experimental-strip-types scripts/check-locales.ts`), `build`
  (`rspress build`); `docs/pnpm-lock.yaml` exists (frozen-lockfile install
  inside working-directory docs/ is intended per task context).
- `git diff --cached` before commit: single file `.github/workflows/ci.yml`,
  23 insertions, only the docs-job hunk appended after macos-spike.
- `git show --stat HEAD`: 1 file changed, 23 insertions(+); `git status --short`
  clean afterwards.
- No build attempted locally (macOS 26 rspress native-module deadlock, per
  task constraints). Real gate effect verifies on push (Task 10).

## Notes

- Main checkout `/Users/zyj/Zturn/Ztron` (branch main) untouched; tauri
  reference dir untouched.
- Job ordering note: `docs` job has no `needs:` — it runs in parallel with the
  other jobs, which matches the brief (independent docs gate).
