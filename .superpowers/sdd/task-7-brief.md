### Task 7: 根仓库接线（转发脚本 + README 入口）

**Files:**
- Modify: `package.json`（根，scripts 追加 4 行）
- Modify: `README.md`（根，Tests 节后插入 Documentation 节）

**Interfaces:**
- Consumes: Task 1–6 的 docs 内脚本
- Produces: 根级命令 `pnpm docs:dev|build|preview|check`（Task 8 CI 与日常使用依赖）

- [ ] **Step 1: 根 `package.json` scripts 追加**

```json
"docs:dev": "pnpm --dir docs run dev",
"docs:build": "pnpm --dir docs run build",
"docs:preview": "pnpm --dir docs run preview",
"docs:check": "pnpm --dir docs run check:locales"
```

- [ ] **Step 2: 根 `README.md` 在 `## Tests` 节之后插入**

```markdown
## Documentation

Bilingual docs (zh default / en mirror) live in [`docs/`](./docs) — an Rspress site, installed independently of the workspace:

```bash
pnpm docs:dev     # dev server
pnpm docs:build   # static build -> docs/doc_build/
pnpm docs:check   # zh/en structure parity gate
```
```

- [ ] **Step 3: 验证**

```bash
pnpm docs:check && pnpm docs:build && pnpm test
```

预期：全部 exit 0（`pnpm test` 证明根测试链未受影响）。

- [ ] **Step 4: 提交**

```bash
git add package.json README.md
git commit -m "docs: root wiring - docs:* forwarding scripts + README section"
```

---

