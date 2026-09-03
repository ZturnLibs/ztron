### Task 9: 部署 workflow（双目标，P1 手动触发）

**Files:**
- Create: `.github/workflows/docs-deploy.yml`、`docs/scripts/deploy-mirror.sh`

**Interfaces:**
- Consumes: Task 2 的 `check:locales:deploy`；Task 1 的构建产物 `docs/doc_build/`
- Produces: 手动 dispatch 的发布流程；secrets 契约 `CHINA_MIRROR_TARGET`（rsync 目标，如 `user@host:/var/www/ztron-docs/`）与 `CHINA_MIRROR_SSH_KEY`（私钥，target 未配置时整个镜像步骤跳过）

- [ ] **Step 1: 写 `.github/workflows/docs-deploy.yml`**

```yaml
name: docs-deploy

on:
  workflow_dispatch:
  # P1 验收通过后取消注释启用自动发布（spec §8.2）：
  # push:
  #   branches: [main]
  #   paths: ["docs/**", ".github/workflows/docs-deploy.yml"]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: docs-deploy
  cancel-in-progress: true

jobs:
  publish:
    runs-on: ubuntu-latest
    environment: github-pages
    defaults:
      run:
        working-directory: docs
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.15.4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: install
        run: pnpm install --frozen-lockfile
      - name: release gate (parity + no placeholders)
        run: pnpm run check:locales:deploy
      - name: build
        run: pnpm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/doc_build
      - name: sync china mirror
        env:
          CHINA_MIRROR_TARGET: ${{ secrets.CHINA_MIRROR_TARGET }}
          CHINA_MIRROR_SSH_KEY: ${{ secrets.CHINA_MIRROR_SSH_KEY }}
        run: bash docs/scripts/deploy-mirror.sh
        working-directory: .
      - uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 写 `docs/scripts/deploy-mirror.sh`**

```bash
#!/usr/bin/env bash
# Sync the built docs to the China mirror (spec §8.2, pluggable target).
# No-op when CHINA_MIRROR_TARGET is unset so the workflow stays green
# before the mirror is provisioned. Run from the repo root.
set -euo pipefail

if [[ -z "${CHINA_MIRROR_TARGET:-}" ]]; then
  echo "[mirror] CHINA_MIRROR_TARGET not set - skipping"
  exit 0
fi

KEY_FILE="$(mktemp)"
printf '%s\n' "${CHINA_MIRROR_SSH_KEY:?CHINA_MIRROR_SSH_KEY required when target is set}" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
trap 'rm -f "$KEY_FILE"' EXIT

rsync -av --delete -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=accept-new" \
  docs/doc_build/ "$CHINA_MIRROR_TARGET"
echo "[mirror] synced to $CHINA_MIRROR_TARGET"
```

- [ ] **Step 3: 可执行权限 + YAML 校验**

```bash
chmod +x docs/scripts/deploy-mirror.sh
bash -n docs/scripts/deploy-mirror.sh && echo "sh syntax ok"
ruby -ryaml -e 'YAML.load_file(".github/workflows/docs-deploy.yml"); puts "yaml ok"'
```

预期：`sh syntax ok` 与 `yaml ok`。

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/docs-deploy.yml docs/scripts/deploy-mirror.sh
git commit -m "ci: docs-deploy workflow - pages + pluggable china mirror (manual dispatch)"
```

---

