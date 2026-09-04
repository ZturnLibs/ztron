# Task 7 Report: `examples.md` touch-up + end-to-end acceptance + PR

**Status:** complete
**Commit:** `c27192a` docs(start): examples positioning + deep-dive links (zh/en)
**Branch/PR:** `feat/onboarding` → `main` — https://github.com/ZturnLibs/ztron/pull/8

(Replaces the stale feat/docs-session report "根仓库接线" — that project was
merged via #2; this file now tracks the onboarding-journey Task 7.)

## Step 1 — examples.md edits (zh/en)

`docs/zh/start/examples.md` + `docs/en/start/examples.md`:

- Top positioning note (blockquote): `examples/` belongs to the framework repo
  (contributor/developer perspective); app devs enter via the quick-start
  `ztron init` path. Link target `/start/quick-start` (exists, Task 6 page).
- Trailing deep-dive line: 架构 / IPC / 安全 ACL / CLI 命令参考 (en mirror).
- hello check count corrected **86 → 85** in all 4 spots (table cell + prose,
  zh + en), matching Task 6's live `ztron check` observation.
- Verified in built output: `docs/doc_build/start/examples.html` (zh) and
  `docs/doc_build/en/start/examples.html` (en) carry the new content; no
  `86 检查` / `86 checks` remains in the start/ pages.

### Deviation from brief text (deliberate)

- Brief's deep-dive line linked `[API 参考](/en/reference/api/)` and
  `[命令参考](/reference/commands)`. Neither page exists in the docs tree
  (docs/{en,zh}/{guide,reference,start}; reference has only `cli.md`). Used the
  real command-reference page `/reference/cli` — the same target/label Task 6's
  accepted quick-start pages use (`[CLI 参考](/reference/cli)`). Spec §5.4 only
  requires "结尾链 guide/architecture 与 reference"; all four shipped targets
  exist. Dropped the nonexistent API-reference link.
- `docs/zh/index.md` hero still says "86 项确定性检查" — left alone per
  instruction (only start/examples.md in scope).

## Step 2 — end-to-end acceptance (spec §7)

1. **Clean-dir init → dev → build**: covered by Task 6 (clean tmpdir;
   init/doctor/codegen/build exit 0; hello `ztron check` → `FULL_OK`). Brief
   marks this "Task 6 Step 3 已覆盖，复核 exit 0" — evidence cited, not re-run.
2. **`ztron doctor` 3-state** (CLI: `packages/cli/dist/index.js doctor`):
   - Provisioned (worktree root, `ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs`;
     host/webview resolved via walk-up to `/Users/zyj/Zturn/Ztron/native/libs/`):
     `PASS ×5` (node 24.1.0 / tjs / ztron-host / libwebview.dylib / darwin),
     `doctor: OK`, **exit 0**.
   - Bare dir `/tmp/ztron-doctor-bare`, `env -u ZTRON_TJS -u ZTRON_HOST_BIN -u
     ZTRON_WEBVIEW_LIB PATH=/nonexistent <abs-node> … doctor`: tjs FAIL + hint,
     ztron-host FAIL + hint, webview FAIL + hint, `doctor: FAILED`, **exit 1**.
     (Node itself must be invoked by absolute path when PATH=/nonexistent —
     brief's command line elides this.)
   - Third state (tjs present, host missing): host/webview FAIL + hint, exit 1.
   - Unit coverage: `tests/unit/cli-doctor.test.ts` (within the 121 green CLI
     tests from Tasks 1–3).
   - Environment note: this machine has no `tjs` on PATH; the all-green state
     requires `ZTRON_TJS` (a documented, hint-recommended resolution path).
     Main repo `native/libs/` lacks `tjs` (built before the Task 5
     `build-native.sh` fix); the worktree has no `native/libs` and resolves
     host/webview by the 8-level walk-up — by design.
3. **Locale gate + full suite**:
   - `pnpm --dir docs run check:locales:deploy` → `[check-locales] OK — zh/en
     trees match, no placeholders`, exit 0.
   - `pnpm test` (root: `tests/unit/*.test.ts` + `tests/core.test.ts`) →
     **134 tests / 133 pass / 0 fail / 1 skipped / 0 todo**, exit 0. Skipped =
     `PathScope allows $TMP and denies /etc` (pre-existing env-dependent skip,
     not onboarding code). Baseline expectation "126+ from main plus new CLI
     tests" satisfied (feat/docs-era baseline was 126 total / 125 pass / 1 skip;
     branch adds the doctor/locate/init-hints suites).
4. **npm channel**: `npm view @zturnlibs/ztron-cli
   --registry=https://registry.npmjs.org` → **E404**, exit 1 (local default
   registry is a private mirror `npm.ixiaochuan.cn`, also 404). Expected: the
   publish-npm job needs the repo secret `NPM_TOKEN`; npmjs channel stays dark
   until first `v*` tag publish. Stated in PR body as prerequisite, non-blocker.

## Step 3 — final gate + build

- Locale gate: OK (above), exit 0.
- `pnpm --dir docs run build` → `success Pages rendered in 116 ms.`, exit 0.

## Step 4 — commit / push / PR

- Commit `c27192a` (examples only, per brief's `git add` list), pushed
  `feat/onboarding` to origin, PR created:
  **https://github.com/ZturnLibs/ztron/pull/8** — body covers spec link,
  W1/W2/W3 summaries, acceptance evidence table, NPM_TOKEN prerequisite,
  and the pnpm≥10 esbuild postinstall observation (scaffold-level fix —
  ship `pnpm-workspace.yaml`/`.npmrc` from `ztron init` — proposed for a
  later pass; `pnpm install` still exits 0, warning only).

## Step 5 — post-merge live verification

Pending merge (maintainer): after website.yml goes green, verify
`https://zturnlibs.github.io/ztron/docs/start/quick-start.html` and the zh
counterpart return 200 with new content (`grep ztron init my-app`).

## Concerns / follow-ups

- `NPM_TOKEN` secret must be configured before the next `v*` tag (W1 gate).
- pnpm≥10 esbuild postinstall issue (PR body, deferred).
- `docs/zh/index.md` hero + README still say 86 checks — out of Task 7 scope,
  suggest a one-line sweep in a future docs pass.
- Main repo `native/libs/` missing `tjs`: next `scripts/build-native.sh` run
  (with the Task 5 fix) will place it; until then `ZTRON_TJS` is needed for
  doctor/dev on this machine.
