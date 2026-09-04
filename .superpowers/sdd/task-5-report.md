# Task 5 Report: docs start/ — intro.md & install.md rewrite (zh/en)

**Status:** COMPLETE
**Commit:** `3521a87` — `docs(start): tauri-style intro + prerequisites/install journey (zh/en)` (branch `feat/onboarding`)
**Files changed:** `docs/zh/start/intro.md`, `docs/zh/start/install.md`, `docs/en/start/intro.md`, `docs/en/start/install.md` (4 files, +82/−92)

## What was done

### Step 1+2: zh rewrites (verbatim from brief)
- `docs/zh/start/intro.md` — replaced the long architecture/ASCII/status-page intro with the brief's compact Tauri-style pitch: what Ztron is (~2MB txiki.js + system WebView, pure TS rewrite), one-sentence architecture, Tauri API alignment pointing to `/start/quick-start` and `/guide/tauri-migration`, closing `**下一步：[前置条件与安装](/start/install)**`.
- `docs/zh/start/install.md` — replaced monorepo-centric install with the brief's 4-step journey: prerequisites table (Apple Silicon verified / Node ≥ 20 / pnpm 9 / Xcode CLT; Windows/Linux host-skeleton-only note folded into the macOS row per brief), `npm i -g @zturnlibs/ztron-cli` + GitHub Packages fallback blockquote, one-time native chain build cloning to `~/ztron` producing `native/libs/{tjs,ztron-host,libwebview.dylib}`, three `ZTRON_*` export lines for `~/.zshrc`, `ztron doctor` health check ("五行全 PASS、输出 `doctor: OK`"), closing link to `/start/quick-start`.

### Step 3: en mirrors
- `docs/en/start/intro.md` ("Introduction") and `docs/en/start/install.md` ("Prerequisites & Installation") mirror zh section-by-section: identical heading levels (intro: 1 H1; install: 5 H1s: Prerequisites + Steps 1–4), identical 4 fenced bash blocks with identical command content, identical absolute link targets (`/start/quick-start`, `/guide/tauri-migration`, `/start/install`, `/start/quick-start` — diff-verified identical between locales). Prose translated; commands/package names/paths (`@zturnlibs/ztron-cli`, `native/libs/…`, `ZTRON_TJS` etc.) untranslated. Table row per brief: `macOS | Apple Silicon (verified)`; doctor output: `doctor: OK`. No `适用版本` line (matching the brief's zh content).

### Step 4: gates — both pass (EXIT=0)
- `pnpm --dir docs run check:locales:deploy` → `[check-locales] OK — zh/en trees match, no placeholders`
- `pnpm --dir docs run build` → `success Pages rendered in 107 ms.`
- Extra structural parity check (not enforced by the script): headings/fences/absolute-link counts match zh↔en for both pages, and link-target lists are byte-identical.

## Environment notes / concerns

- The worktree had no `docs/node_modules`. `docs` is a standalone package (own `pnpm-lock.yaml`, NOT listed in root `pnpm-workspace.yaml`), so a plain install walks up to the monorepo root. Fixed with `pnpm install --frozen-lockfile --ignore-workspace` inside `docs/` — lockfile unmodified (git-verified), `node_modules/` is gitignored via `docs/.gitignore`. Note for future tasks in fresh worktrees: run the docs install with `--ignore-workspace`.
- pnpm warns `Ignored build scripts: core-js@3.42.0` — harmless (funding postinstall), build succeeds.
- Pre-existing `.superpowers/sdd/*` modifications in the working tree were left untouched and are not part of this commit. (This file previously held an old journey's Task 5 report; overwritten per report contract.)
- Interface contract with quick-start preserved: install's export paths use `~/ztron/native/libs/…` form consistent with `<repo>/native/libs/…`; intro links into `/start/quick-start`; install's "下一步" links `/start/quick-start`. quick-start.md itself was not modified (per brief scope).
- Note: quick-start still calls the CLI via `node packages/cli/dist/index.js` while install now installs the global `ztron` binary; a later task may want to reconcile (out of Task 5 scope).

---

## Fix wave (review finding: fact-baseline error, Important)

**Status:** FIXED
**Finding:** Task 5 docs (`docs/{zh,en}/start/install.md`), `packages/cli/src/index.ts` step-2 init hint, and `tests/unit/cli-doctor.test.ts` all assume `scripts/build-native.sh` produces `native/libs/tjs`. Reality: the script left tjs at `native/txiki.js/build/tjs` and never copied it into `native/libs/`.

**Adjudicated direction (controller decision):** make the implementation match the three consumers — add the tjs copy to `scripts/build-native.sh` so `native/libs/` is the single artifacts directory.

**Change (`scripts/build-native.sh`, +5/−2):**
- Added platform-independent copy step immediately before the final echo, guarded to preserve `set -euo pipefail` semantics: `[ -f "$NATIVE/txiki.js/build/tjs" ] && cp "$NATIVE/txiki.js/build/tjs" "$NATIVE/libs/"`.
- Final echo updated to `tjs: $NATIVE/libs/tjs` (host part unchanged) so the message matches reality.
- Header comment updated: tjs artifact now listed as `native/libs/tjs (built in native/txiki.js/build/tjs)`.
- Docs, doctor fixture, and init hints deliberately untouched — they already assume `native/libs/tjs` and become correct with this change.

**Verification (this is a shell script — no unit test suite covers it; `bash -n` + tmpdir semantic check used instead; full unit suite not run since no TS changes):**
- `bash -n scripts/build-native.sh` → `SYNTAX OK` (exit 0).
- Tmpdir semantic check replicating the exact `set -euo pipefail` + guard + cp + echo shape with `NATIVE=tmp/native`:
  - tjs present → `==> done. tjs: …/native/libs/tjs, host: …/native/libs/ztron-host`, exit=0, `native/libs/tjs` created with expected content.
  - tjs missing → copy skipped, script does NOT abort (POSIX `set -e` ignores failures of non-final AND-OR-list commands), echo still runs, exit=0 — partial builds are not broken; a missing tjs build simply means no `libs/tjs` copy.
  - Re-run safety: plain `cp` overwrites, no stale-artifact guard needed.
- Full `ztron doctor` / `ztron init` flows unaffected (no TS changes).

**Commit:** see `fix(build): copy tjs into native/libs (single artifacts dir; aligns docs/init/doctor fixture)` on `feat/onboarding`.
