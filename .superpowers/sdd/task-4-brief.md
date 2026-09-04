### Task 4: publish workflow 增发 npmjs 公共源

**Files:**
- Modify: `.github/workflows/publish.yml`

**Interfaces:**
- Produces: `publish-npm` job（与现有 `publish` job 并列，独立失败互不影响）；发布顺序沿用 leaf-first：`inject core runtime-ffi api cli driver`

- [ ] **Step 1: 追加 job（文件末尾）**

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
        run: |
          for d in packages/inject packages/core packages/runtime-ffi packages/api packages/cli packages/driver; do
            echo "--- publishing $d"
            (cd "$d" && pnpm publish --no-git-checks --access public) || exit 1
          done
```

（与 GitHub Packages job 的差异仅：registry-url、不设 NODE_AUTH_TOKEN 之外的额外 token——setup-node 的 `scope` + `registry-url` 会写入 .npmrc，token 来自 secret `NPM_TOKEN`，由 setup-node 自动读取环境变量 `NODE_AUTH_TOKEN`——需在 publish 步骤注入：把 publish 步骤改为 `env: NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 前缀，即：

```yaml
      - name: publish (leaf-first, public scoped)
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          for d in packages/inject packages/core packages/runtime-ffi packages/api packages/cli packages/driver; do
            echo "--- publishing $d"
            (cd "$d" && pnpm publish --no-git-checks --access public) || exit 1
          done
```

）

- [ ] **Step 2: YAML 校验**

Run: `ruby -ryaml -e "YAML.safe_load(File.read('.github/workflows/publish.yml')); puts 'yaml ok'"`
Expected: `yaml ok`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml
git commit -m "ci(publish): npmjs public registry channel (NPM_TOKEN; independent of GitHub Packages)"
```

- [ ] **Step 4: 提醒用户（控制器职责，非提交）**

控制器在任务完成报告里提醒用户：到 npmjs.com 创建 `@zturnlibs` scope + automation token，配到仓库 Settings → Secrets → Actions → `NPM_TOKEN`；下个 `v*` tag 起双通道发布。

---

