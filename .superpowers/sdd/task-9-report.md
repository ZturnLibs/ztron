# Task 9 Report: 部署 workflow（双目标，P1 手动触发）

**Status:** COMPLETE
**Worktree:** /Users/zyj/Zturn/Ztron/.worktrees/docs (branch `feat/docs`)
**Commit:** `02ea3f5` — `ci: docs-deploy workflow - pages + pluggable china mirror (manual dispatch)`

## What was done

1. **Created `.github/workflows/docs-deploy.yml`** — transcribed VERBATIM from the task brief:
   - Trigger: `workflow_dispatch` only (P1 auto-publish `push:` trigger present but commented out, per spec §8.2).
   - Permissions: `contents: read`, `pages: write`, `id-token: write`.
   - Concurrency group `docs-deploy`, `cancel-in-progress: true`.
   - Job `publish`: ubuntu-latest, `environment: github-pages`, default working-directory `docs`.
   - Steps: checkout@v4 → pnpm/action-setup@v4 (9.15.4) → setup-node@v4 (node 22) → `pnpm install --frozen-lockfile` → release gate `pnpm run check:locales:deploy` (consumes Task 2) → `pnpm run build` (produces `docs/doc_build/`, Task 1) → configure-pages@v5 → upload-pages-artifact@v3 (`path: docs/doc_build`) → "sync china mirror" step (repo-root working-directory, runs `bash docs/scripts/deploy-mirror.sh` with `secrets.CHINA_MIRROR_TARGET` / `secrets.CHINA_MIRROR_SSH_KEY`) → deploy-pages@v4.

2. **Created `docs/scripts/deploy-mirror.sh`** — transcribed VERBATIM from the brief:
   - `set -euo pipefail`.
   - **No-op guard verified while transcribing:** `[[ -z "${CHINA_MIRROR_TARGET:-}" ]]` → prints `[mirror] CHINA_MIRROR_TARGET not set - skipping` and `exit 0`. This keeps the workflow green before the mirror secrets are provisioned.
   - When target IS set: `CHINA_MIRROR_SSH_KEY` is mandatory (`${...:?...}` guard), written to a `mktemp` file, `chmod 600`, `trap rm EXIT`; rsync `-av --delete` over ssh (`-i $KEY_FILE -o StrictHostKeyChecking=accept-new`) from `docs/doc_build/` to target.

3. **Scoped commit:** `git add .github/workflows/docs-deploy.yml docs/scripts/deploy-mirror.sh` only (never `-A`). Show-stat confirms exactly 2 files, 69 insertions; script committed as mode `100755`.

## Verification (all from worktree root; site build skipped per env constraint)

| Check | Result |
|---|---|
| `chmod +x docs/scripts/deploy-mirror.sh` | ok (mode 755 in commit) |
| `bash -n docs/scripts/deploy-mirror.sh` | `sh syntax ok` |
| `ruby -ryaml -e 'YAML.load_file(...); puts "yaml ok"'` | `yaml ok` |
| Functional no-op smoke: `env -u CHINA_MIRROR_TARGET bash docs/scripts/deploy-mirror.sh` | `[mirror] CHINA_MIRROR_TARGET not set - skipping` (exit 0) |
| Pre-commit worktree state | clean; commit contains only the 2 new files |

## Concerns / notes

- `secrets.CHINA_MIRROR_TARGET` / `secrets.CHINA_MIRROR_SSH_KEY` do not exist in the GitHub repo yet — expected; script no-ops until provisioned (verified functionally).
- `environment: github-pages` left as written; the environment is created automatically by the first Pages deploy or via repo settings.
- Per env constraint, the brief's site-build step was NOT run (macOS 26 native deadlock); no rsync/rsync-mirror end-to-end test possible locally beyond the no-op path.
- T8's docs job in ci.yml untouched; this task created new files only. Main checkout (`main` branch) not touched.

## Files

- /Users/zyj/Zturn/Ztron/.worktrees/docs/.github/workflows/docs-deploy.yml (new)
- /Users/zyj/Zturn/Ztron/.worktrees/docs/docs/scripts/deploy-mirror.sh (new, executable)
