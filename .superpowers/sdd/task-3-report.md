# Task 3 Report: publish.yml 原生编译 job + 平台包发布 + npm 冒烟

**Status: DONE** (one brief deviation, user-approved before implementation)
**Commit:** `2d3d08b` feat(ci): build+publish darwin-arm64 native chain package, smoke real npm install
**File changed:** `.github/workflows/publish.yml` only (+82 lines, pure insertions)

## What was implemented

All four YAML blocks from the brief, verbatim except one stage step (see Deviations):

1. **`native-darwin-arm64` job** (inserted before `publish:`, `macos-14`): checkout →
   `bash scripts/build-native.sh` → stage artifacts into
   `packages/native-darwin-arm64/native/libs/` → verify manifest
   (`test -x tjs`, `test -x ztron-host`, `test -f libwebview.dylib`) →
   `npm pack` to `/tmp` + `TGZ` into `GITHUB_ENV` →
   `actions/upload-artifact@v4` as `ztron-darwin-arm64-tgz`
   (`if-no-files-found: error`).

2. **`publish:` job**: `needs: native-darwin-arm64`; after checkout, downloads the
   artifact to `/tmp/native-tgz` and publishes the platform package
   (`npm publish /tmp/native-tgz/ztron-darwin-arm64-*.tgz --access restricted
   --tag latest`, `NODE_AUTH_TOKEN: secrets.GITHUB_TOKEN`) — before any JS-family
   step, satisfying the leaf-first rule (CLI's optionalDependencies point at it).
   All original steps kept, order unchanged.

3. **`publish-npm:` job**: same wiring with `--access public` and
   `NODE_AUTH_TOKEN: secrets.NPM_TOKEN`. Original steps kept, order unchanged.

4. **`smoke-npm` job** (appended at end, `macos-14`, `needs: publish-npm`):
   setup-node 22 → retrying `npm i -g @zturnlibs/ztron-cli` (5 tries, 20s apart,
   for registry propagation) → `ztron doctor` (failure = job failure) →
   in a `mktemp -d`: `ztron init smoke-app`, `npm install --no-fund --no-audit`,
   `ztron build`, `test -d dist`.

## Deviation from the brief (user-approved)

**The brief's stage step could not work as written.** It copied
`libwebview.0.12.dylib` / `libwebview.0.12.0.dylib` from `native/libs/`, but on a
fresh CI runner those files do not exist there:

- `native/libs/` is gitignored (`.gitignore:25`), so checkout provides nothing.
- `scripts/build-native.sh` line 42 does `cp .../build/core/libwebview.dylib
  native/libs/` — `cp` follows the cmake symlink chain
  (`libwebview.dylib → libwebview.0.12.dylib → libwebview.0.12.0.dylib`), leaving
  exactly **one real file** in `native/libs/`. The trio present on this dev
  machine dates from a manual Aug-10 setup, not reproducible in CI.
- GitHub Actions runs steps with `bash -e`, so the verbatim loop's second `cp`
  would ENOENT → `native-darwin-arm64` red → both publish jobs skipped on every
  future tag push.

**Approved fix (only the stage step changed; everything else verbatim):** copy
`tjs`/`ztron-host` from `native/libs/`, then copy the single built
`native/libs/libwebview.dylib` to all three dylib names in the package (three
real copies — the brief's own stated intent; tarballs don't need symlinks).
Rationale recorded in an inline comment: `ztron-host`'s install name is
`@rpath/libwebview.0.12.dylib` (verified via `otool -L`), so the versioned name
must exist next to the binary. `ztron build`'s .app bundler
(`packages/cli/src/index.ts:1093-1102`) and `ztron doctor`
(`existsSync`-only checks) both work with real-file copies.

Also verified non-issues while reviewing: every JS package carries the same
`publishConfig.registry = npm.pkg.github.com` block and 0.3.1 shipped to npmjs
through `publish-npm` anyway, so the platform package's identical manifest shape
is proven; `npm pack` in the native job needs no setup-node (macos-14 images ship
Node, and the package has no scripts).

## Validation

1. **Ruby YAML self-check** (run from the worktree; brief's `cd` pointed at the
   main checkout, adapted to the worktree where the edited file lives):
   ```
   native-darwin-arm64, publish, publish-npm, smoke-npm
   workflow yaml OK
   ```
2. **`pnpm install --frozen-lockfile && pnpm build && pnpm test:unit`**
   (worktree): install clean ("Lockfile is up to date"), all workspace packages +
   website build OK, **138 tests pass, 0 fail**.
3. `git diff` audit: only `+` lines in publish.yml — every pre-existing line and
   step order byte-identical; committed exactly `git add
   .github/workflows/publish.yml` (pre-existing `.superpowers/sdd/*` edits left
   uncommitted).

## Self-review checklist

- **Completeness:** native job full chain present; `needs` on both publish jobs;
  download + native-publish-before-CLI in both; smoke job has all four step
  groups. Yes.
- **Correctness:** artifact name `ztron-darwin-arm64-tgz` identical across upload
  and both downloads; `TGZ=/tmp/$tgz` (`ztron-darwin-arm64-<version>.tgz`) matches
  upload glob `/tmp/ztron-darwin-arm64-*.tgz`; `--access restricted` +
  GITHUB_TOKEN vs `--access public` + NPM_TOKEN correctly paired per job. Yes.
- **Discipline:** existing steps byte-identical; nothing extra added; indentation
  matches existing jobs. Yes.
- **Validation:** ruby check lists all 4 jobs and passes; frozen-lockfile +
  build + tests green. Yes.

## Issues / concerns

- **End-to-end verification is impossible before a tag push** (publish workflows
  have real side effects), as the brief itself notes. Release-time watchlist:
  1. `native-darwin-arm64` green with 3 artifacts in `ztron-darwin-arm64-tgz`;
  2. both publish jobs publish the platform package before the JS family
     (and before the CLI tarball specifically);
  3. `smoke-npm` all green — this is the first real-world exercise of the
     bundled chain (doctor + init + build from a bare npm install).
- The smoke job's `npm install` inside the scaffold is required (template src
  imports `@zturnlibs/ztron-core` / `runtime-ffi` for esbuild) — per brief, kept.
- If a future `webview` bump changes the dylib SOVERSION, the hardcoded
  `libwebview.0.12*` names (here and in `ztron-host`'s baked install name) must
  move together — the stage-step comment documents the coupling.

---

*(This file replaces the stale `task-3-report.md` from the earlier feat/onboarding
journey, matching the established stub-replacement pattern.)*

## Fix wave

**Commit:** fix(ci): scoped tarball globs + native publish after setup-node auth (review findings)
**File changed:** `.github/workflows/publish.yml` only.

### What changed per finding

- **Important 1 (upload glob never matches):** upload-artifact `path:` in
  `native-darwin-arm64` changed from `/tmp/ztron-darwin-arm64-*.tgz` to
  `/tmp/zturnlibs-ztron-darwin-arm64-*.tgz` — `npm pack` of a scoped package
  flattens the scope into the filename (`zturnlibs-ztron-darwin-arm64-<ver>.tgz`),
  so the old glob matched nothing and `if-no-files-found: error` would have
  killed the job on every tag.
- **Important 2 (same prefix bug in both publish steps):** the "publish native
  platform package" `run:` globs in `publish` and `publish-npm` changed to
  `/tmp/native-tgz/zturnlibs-ztron-darwin-arm64-*.tgz`. Flags/env untouched:
  `--access restricted` + `secrets.GITHUB_TOKEN` in `publish`,
  `--access public` + `secrets.NPM_TOKEN` in `publish-npm`.
- **Important 3 (native publish before setup-node auth):** in BOTH jobs,
  `actions/download-artifact` + "publish native platform package" moved to
  immediately AFTER `actions/setup-node` (and still BEFORE `install`, so the
  leaf-first ordering vs the CLI is preserved). Reason: the tarball manifest
  pins `publishConfig.registry = npm.pkg.github.com`; npm resolves the publish
  registry from publishConfig unless a scoped `.npmrc` overrides it — and that
  `.npmrc` (registry + authToken) is written by setup-node. Old placement:
  GPR job → ENEEDAUTH; npmjs job → would push to GPR with the npmjs token.
  Inline comment added documenting the placement requirement.
- **Minor 1 (dead TGZ GITHUB_ENV):** "pack platform package" simplified to
  `cd packages/native-darwin-arm64` + `npm pack --pack-destination /tmp`
  (dropped the `tgz=$(...)`/`TGZ` GITHUB_ENV write nothing read). Used the
  inline-`cd` form because no step in the file uses `working-directory`.
- **Minor 2 (manifest verify misses rpath name):** "verify artifact manifest"
  now also `test -f packages/native-darwin-arm64/native/libs/libwebview.0.12.dylib`
  (the name `ztron-host` loads via `@rpath`). Stage step's three-name dylib
  copies left as is.

### Verification outputs

1. `npm pack --dry-run` (packages/native-darwin-arm64), filename line:
   `zturnlibs-ztron-darwin-arm64-0.3.1.tgz` — confirms the corrected globs
   (`/tmp/zturnlibs-ztron-darwin-arm64-*` and `/tmp/native-tgz/...`) match.
2. Ruby YAML self-check:
   ```
   native-darwin-arm64, publish, publish-npm, smoke-npm
   workflow yaml OK
   ```
3. Ordering proof (`grep -n "setup-node\|publish native platform"`):
   job `publish`: setup-node line 59 < publish native line 73;
   job `publish-npm`: setup-node line 129 < publish native line 143
   (line 182 is smoke-npm's unrelated setup-node). Native publish now runs
   after setup-node in both jobs.
