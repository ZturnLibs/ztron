# Task 2 Report: `ztron doctor` health-check command

**Status: COMPLETE** — commit `ef56d4c` on `feat/onboarding` (`feat(cli): ztron doctor - one-shot native-chain environment check`).

## What was done (TDD red/green)

1. **Red**: wrote `tests/unit/cli-doctor.test.ts` byte-exact per brief; build + run confirmed the expected failure
   (`Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../packages/cli/dist/doctor.js`, 118 total, 1 fail).
2. **Green**: implemented `packages/cli/src/doctor.ts` and wired `packages/cli/src/index.ts`
   (help line after `ztron init`, `case "doctor"` after `case "init"`).
3. **Verify**: full suite `pnpm test:unit` → **120 pass / 0 fail** (baseline 117 + 3 new doctor tests), build (`tsc -p tsconfig.json`) clean.
4. **Manual runs**:
   - Worktree root (no `native/libs`, no `tjs` on PATH): tjs FAIL with `build-native.sh` hint → `doctor: FAILED`, `exit=1`. Matches brief expectation.
   - Isolated temp repo with full chain (`tjs`/`ztron-host`/`libwebview.dylib` + `ZTRON_TJS`): all 5 checks PASS → `doctor: OK`, `exit=0`.
   - Usage render: `  ztron doctor                     Check node/tjs/host/webview chain (exit 1 on fail)` appears directly under the `ztron init` line.

## Files

- Created: `/Users/zyj/Zturn/Ztron/.worktrees/onboarding/packages/cli/src/doctor.ts` — pure `runDoctor({cwd, env, platform})` → `DoctorReport {checks, ok}`; renders nothing, sets nothing global.
- Modified: `/Users/zyj/Zturn/Ztron/.worktrees/onboarding/packages/cli/src/index.ts` — USAGE line + `case "doctor"` (dynamic `import("./doctor.js")`, prints PASS/FAIL + hints, `process.exitCode = 1` on fail).
- Created: `/Users/zyj/Zturn/Ztron/.worktrees/onboarding/tests/unit/cli-doctor.test.ts` — 3 tests, byte-exact per brief.

## Deviations (test kept exact; implementation minimally adapted)

**Conflict in the brief**: Step 1's test asserts `r.checks.length === 5` with `platform: "darwin"`, but Step 3's `doctor.ts` only pushes 4 checks on darwin (platform check guarded by `if (platform !== "darwin")`). Following TDD, the test is the contract, so the platform check is now **unconditional** (informational, `pass: true`, never fails the doctor):

- darwin: `detail: "darwin — supported dev platform"`, `hint: ""`
- non-darwin: detail/hint byte-identical to the brief (`"...host is a skeleton; macOS is the supported dev platform"` / `"see ROADMAP.md for Windows/Linux status"`)

This yields a stable 5-check report shape on every platform and satisfies all three brief tests unmodified. Alternative (conditional check + test changed to 4) rejected: it would alter the "exact test code".

Minor formatting: the brief's help-text fence starts with `*   2b.` — plan-doc artifacts (markdown bullet + journey step number), not meaningful in user-facing USAGE; the exact description string `Check node/tjs/host/webview chain (exit 1 on fail)` was kept, aligned to the existing description column (col 36).

## Observations / notes for next tasks

- **Worktree walk-up artifact**: running `doctor` inside `.worktrees/onboarding`, `findNativeFile` walks up past the worktree root into the main checkout and finds `/Users/zyj/Zturn/Ztron/native/libs/*`, so host/webview PASS here (tjs still FAILs — not on PATH). Expected behavior of the Task 1 finder; in CI / fresh clones the walk-up finds nothing. Main repo was never touched (verification used `/tmp` for the all-pass path).
- `runDoctor` honors `env.ZTRON_TJS` / `env.ZTRON_HOST_BIN` itself before falling back to the finders (which read `process.env` directly) — necessary because the finders aren't env-parameterized; keeps `runDoctor` pure/testable per the brief.
- `platform` check's `hint` is `""` on darwin; index.ts only prints hints for FAILs, so it never renders.
- Left untouched (coordinator's unstaged edits): `.superpowers/sdd/progress.md`, `task-1-brief.md`, `task-2-brief.md`.
