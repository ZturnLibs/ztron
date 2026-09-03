
## Final-review fixes (branch feat/docs, commit 3a52744)

### Fix 1 (C1) — section _meta.json rewritten as v1 string-item arrays
Six files converted from navbar-style `{"text","link"}` objects (which make Rspress v1
treat entries as `type:'file'` and call path.resolve(workDir, undefined) → build TypeError):
- docs/{zh,en}/start/_meta.json → `["intro", "install", "quick-start", "examples"]`
- docs/{zh,en}/guide/_meta.json → `["architecture", "ipc", "events", "window", "config", "security", "tauri-migration"]`
- docs/{zh,en}/reference/_meta.json → `["cli"]`
Titles auto-derive from frontmatter; zh/en file contents identical (symmetric for parity).

### Fix 2 (C2) — _nav.json (v2 concept) replaced by v1 per-locale root _meta.json
- Created docs/zh/_meta.json: nav `开始→/start/`, `指南→/guide/`, `参考→/reference/`
- Created docs/en/_meta.json: nav `Start→/start/`, `Guide→/guide/`, `Reference→/reference/`
- Deleted docs/zh/_nav.json and docs/en/_nav.json via `git rm`.
- docs/CONTRIBUTING.md and docs/README.md: grep found no `_nav.json` mentions — unchanged.
  (Remaining `_nav.json` mentions live only in superpowers spec/plan history docs and the
  TRACKED regex in scripts/check-locales.ts, which still tracks `_meta.json` so parity holds.)

### Fix 3 — stale "under construction" parentheticals removed (4 files, 5 spots)
- docs/zh/start/intro.md: removed「（指南章节建设中）」after 架构指南 and 迁移指南 links (2 spots)
- docs/en/start/intro.md: removed "(guide chapters under construction)" after both links (2 spots)
- docs/zh/start/quick-start.md: removed「（参考章节建设中）」after CLI 参考 link
- docs/en/start/quick-start.md: removed "(reference chapters under construction)" after CLI Reference link
Links to /guide/architecture, /guide/tauri-migration, /reference/cli kept (targets exist).
Sentences remain grammatical. Remaining「建设中」hits in docs/{zh,en}/index.md are legitimate
product-status notes about the Windows/Linux bundling pipeline — intentionally kept.

### Fix 4 — ROADMAP deep-link (plus README consistency)
- docs/{zh,en}/start/intro.md: ROADMAP link now https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md;
  README link deep-linked consistently to https://github.com/ZturnLibs/ztron/blob/main/README.md.
  Both files verified present at repo root on main.

### Fix 5 — deploy-mirror.sh trap ordering
docs/scripts/deploy-mirror.sh: `trap 'rm -f "$KEY_FILE"' EXIT` moved to immediately after
`KEY_FILE="$(mktemp)"`, before the printf writes key material; everything else identical.

### Fix 6 — mirror step cannot block Pages deploy
.github/workflows/docs-deploy.yml: added `continue-on-error: true` to the "sync china mirror"
step (same indent as name:/env:/run:); step order unchanged.

### Verification (all green)
- `node -e 'JSON.parse(...8 _meta.json files...)'` → `json ok`
- `bash -n docs/scripts/deploy-mirror.sh` → `sh ok`
- `ruby -ryaml` on docs-deploy.yml → `yaml ok`
- `pnpm --dir docs run check:locales` → `[check-locales] OK — zh/en trees match`
- `pnpm --dir docs run check:locales:deploy` → `OK — zh/en trees match, no placeholders`
- `pnpm --dir docs run test` → 5 pass / 0 fail
- `grep -rn "_nav.json" docs/ --include="*.md" | grep -v superpowers` → no stale mentions
- `grep -rn "建设中" docs/zh docs/en` → only legit index.md pipeline-status lines

Commit: 3a52744 "fix(docs): final-review findings - v1 _meta schemas, stale notes, mirror hardening"
(16 files changed, 26 insertions, 55 deletions; scoped add only; worktree clean after commit)
