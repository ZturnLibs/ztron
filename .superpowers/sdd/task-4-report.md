# Task 4 Report: publish workflow 增发 npmjs 公共源

**Status:** complete
**Branch:** `feat/onboarding`
**Commit:** `a8cbf3c` — `ci(publish): npmjs public registry channel (NPM_TOKEN; independent of GitHub Packages)`
**File modified:** `.github/workflows/publish.yml` (+27 lines, pure append — existing `publish` job untouched)

## What was done

Appended a second independent top-level job `publish-npm` to `.github/workflows/publish.yml`, per the brief's Step 1 (corrected final form, i.e. the publish step carries the `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` prefix).

### Job definition (as committed)

```yaml
  publish-npm:
    name: publish @zturnlibs/ztron-* to npmjs (public)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
          registry-url: https://registry.npmjs.org
          scope: "@zturnlibs"
      - name: install
        run: pnpm install --frozen-lockfile
      - name: build (workspace)
        run: pnpm run build
      - name: publish (leaf-first, public scoped)
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for d in packages/inject packages/core packages/runtime-ffi packages/api packages/cli packages/driver; do
            echo "--- publishing $d"
            (cd "$d" && pnpm publish --no-git-checks --access public) || exit 1
          done
```

### Key properties verified

- **Independent jobs:** `publish` and `publish-npm` are sibling top-level jobs under `jobs:` with no `needs` linkage, so a `publish-npm` failure cannot block the GitHub Packages job (and vice versa). Confirmed by parsing: `jobs` keys = `["publish", "publish-npm"]`.
- **Differences vs GitHub Packages job** (only these, as the brief requires): `registry-url: https://registry.npmjs.org`, `--access public` instead of `--access restricted`, and `NODE_AUTH_TOKEN` from secret `NPM_TOKEN` injected on the publish step (setup-node writes `scope` + `registry-url` into `.npmrc`; the token itself is read from the `NODE_AUTH_TOKEN` env var).
- **Leaf-first publish order preserved:** `inject → core → runtime-ffi → api → cli → driver` (scoped dependency exists before dependents publish).
- **Trigger unchanged:** still file-top `push: tags: v*` + `workflow_dispatch`; `permissions: packages: write, contents: read` remain (harmless for npmjs, required for the GitHub Packages job).
- The npmjs job omits `unit tests` / `pack dry-run` steps exactly as the brief's YAML specifies (those gates already run in the `publish` job on the same tag push).

## Validation

- YAML check (brief Step 2):
  - Command: `ruby -ryaml -e "YAML.safe_load(File.read('.github/workflows/publish.yml')); puts 'yaml ok'"`
  - Result: `yaml ok`
- Structural check: parsed YAML shows exactly two jobs, `publish` and `publish-npm`; `publish-npm` steps in order: checkout, pnpm/action-setup@v4 (9.15.4), setup-node@v4 (node 22, cache pnpm, registry.npmjs.org, scope @zturnlibs), install, build (workspace), publish (leaf-first, public scoped) with `env.NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}`.
- Commit staged only `.github/workflows/publish.yml` (working tree also contains unrelated `.superpowers/sdd/*.md` modifications belonging to other tasks — left untouched).

## Reminder for the user (controller to relay, per brief Step 4)

到 npmjs.com 创建 `@zturnlibs` scope + automation token，配到仓库 Settings → Secrets → Actions → `NPM_TOKEN`；下个 `v*` tag 起双通道发布（GitHub Packages + npmjs public）。`publish-npm` 在 `NPM_TOKEN` 缺失或 scope 未就绪前会失败，但不影响 GitHub Packages 通道。

## Concerns

- This report file previously contained a report from an earlier SDD round (docs task, commit `2aaead3`); it was overwritten per the current round's report contract. Old content remains in git history.
- Note: `pnpm publish` publishes whatever version is in each `packages/*/package.json` — ensure the release process bumps versions before tagging, or npmjs will reject duplicates (`--no-git-checks` only suppresses git-state checks, not version conflicts).
