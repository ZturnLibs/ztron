# Task 3 Report: `init` next-step guidance + native-chain reminder

**Status: COMPLETE** — commit `a0ae398` on `feat/onboarding` (`feat(cli): init prints next-step guidance + native-chain reminder`).

## What was done (TDD red/green)

1. **Red**: wrote `tests/unit/cli-init-hints.test.ts` byte-exact per brief; build + run confirmed the expected
   failure (`actual: '[ztron] scaffolded a project in ...\n[ztron] next: pnpm install && pnpm dev\n'`,
   `expected: /next steps/i` → assertion error, 1 fail).
2. **Green**: appended the brief's exact 8-line block to the tail of `initProject`
   (`packages/cli/src/index.ts`, after the existing two `console.log` lines, now lines 685–694):
   `findNativeFile(target, "ztron-host")` probe + 3 numbered `next steps:` lines + conditional
   `note: no native/libs found above <target>` reminder.
3. **Verify**:
   - New test: **1 pass / 0 fail** (`node --experimental-strip-types --test tests/unit/cli-init-hints.test.ts`).
   - Full suite `pnpm test:unit` → **121 pass / 0 fail / 657ms** (baseline 120 + 1 new init test; matches brief's
     expected count progression — locate 3 and doctor 3 already counted in the 120 baseline).
   - `pnpm --filter @zturnlibs/ztron-cli build` (`tsc -p tsconfig.json`) clean.
4. **Manual runs** (built `dist/index.js`):
   - Bare temp dir (no chain above): all 3 steps + `[ztron] note: no native/libs found above
     /private/tmp/.../my-app — run \`ztron doctor\` after step 2.`, `exit=0`.
   - Temp dir with `native/libs/ztron-host` two levels above target (`/tmp/zt-chain/sub/app`):
     3 steps printed, **no** note line (probe walks up and finds the chain), `exit=0`.
   - Test-spawned path confirms regexes: `next steps` (case-insensitive), `ZTRON_TJS`, `ztron dev`, `ztron doctor`.

## Files

- Modified: `/Users/zyj/Zturn/Ztron/.worktrees/onboarding/packages/cli/src/index.ts` — `initProject` tail (+8 lines; existing scaffold logs untouched).
- Created: `/Users/zyj/Zturn/Ztron/.worktrees/onboarding/tests/unit/cli-init-hints.test.ts` — 1 process-spawn test, byte-exact per brief.
- No changes to `native-locate.ts` (Task 1) or `doctor.ts` (Task 2); `findNativeFile` was already imported at `index.ts:39`.
- This file replaces the stale pre-existing `task-3-report.md` stub from the earlier docs/zh journey (commit `f38a442`), matching how Tasks 1–2 replaced their stubs.

## Notes / observations

- The brief's "Produces: `nextSteps(target): string[]` exported from index.ts" is explicitly marked infeasible
  (index.ts has no export guard and is the CLI entrypoint); implemented as the brief directs: logic inlined in
  `initProject`, verification via CLI-process spawn + stdout assertions. No new public API.
- `findNativeFile` walk-up (up to 8 levels) means `init` run inside a repo that *has* `native/libs/ztron-host`
  (e.g. the Ztron main checkout) suppresses the note — intended "developer already has the chain" signal.
  In fresh clones/CI the walk-up finds nothing and the note prints. Main repo was never touched (manual
  verification used `/tmp`).
- Step 2 line is long (single `console.log`, ~170 chars) — kept byte-exact per brief; tsc has no line-length check.
- Left untouched (coordinator's unstaged edits): `.superpowers/sdd/progress.md`, `task-1-brief.md`,
  `task-2-brief.md`, `task-2-report.md`, `task-3-brief.md`. This report is also left uncommitted,
  matching the Task 2 pattern (source+test only in the task commit).
