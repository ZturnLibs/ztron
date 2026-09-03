### Task 8: CI docs job

**Files:**
- Modify: `.github/workflows/ci.yml`（文件末尾追加 job）

**Interfaces:**
- Consumes: Task 1–7 的产物（lockfile、check:locales、build、test）
- Produces: PR/main 推送上的文档门禁

- [ ] **Step 1: `ci.yml` 末尾追加（与现有 job 同缩进）**

```yaml
  docs:
    name: docs (parity + build)
    runs-on: ubuntu-latest
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
      - name: unit tests (scripts)
        run: pnpm test
      - name: locale parity
        run: pnpm run check:locales
      - name: build
        run: pnpm run build
```

- [ ] **Step 2: 本地验证 YAML 语法**

```bash
ruby -ryaml -e 'YAML.load_file(".github/workflows/ci.yml"); puts "yaml ok"'
```

预期：输出 `yaml ok`（macOS 自带 ruby；若不可用改 `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`，PyYAML 缺失时以视觉核对缩进代替）。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: docs job - locale parity, script tests, site build"
```

（实际门禁效果以 push 后 GitHub Actions 运行为准，最终验证在 Task 10。）

---

