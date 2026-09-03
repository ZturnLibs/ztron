### Task 6: 写作规范与 docs README

**Files:**
- Create: `docs/CONTRIBUTING.md`、`docs/README.md`

**Interfaces:**
- Consumes: Task 2 的占位标记约定、Task 5 的术语表
- Produces: 文档贡献规范（后续所有内容任务的遵循标准）

- [ ] **Step 1: 写 `docs/CONTRIBUTING.md`**，章节与要点：
  1. **双语流程**：zh canonical 先行，en 跟随；`pnpm run check:locales` 本地必过；`--deploy` 为发布门禁，占位页用 `<!-- i18n:untranslated -->` 标记（正文首行）但发布前必须清零
  2. **术语表**：Task 5 Step 1 的表格原样收录
  3. **代码示例规则**：优先从 `examples/hello`、`examples/multiwin` 摘取可运行片段，注明来源路径；不得凭空编写
  4. **能力主张规则**：带验证锚点（如 `FS_WATCH_OK`），锚点语义见根 `README.md` 状态表
  5. **版本标注**：每页末行 `` 适用版本：`ztron x.y.z` ``；API 行为变更的 PR 须同 PR 更新受影响页面
  6. **frontmatter**：仅 `title` 必填

- [ ] **Step 2: 写 `docs/README.md`**

```markdown
# Ztron Docs

Rspress 双语文档站（zh 默认 / en 镜像）。独立安装，不依赖 workspace。

## 运行

pnpm install
pnpm dev            # 开发服务器
pnpm build          # 静态构建 -> doc_build/
pnpm preview        # 本地预览构建产物
pnpm test           # scripts 单元测试
pnpm run check:locales          # zh/en 结构一致性
pnpm run check:locales:deploy   # 发布门禁（含占位检测）

（根目录等价命令：`pnpm docs:dev` / `pnpm docs:build` / `pnpm docs:check`。）

贡献规范见 [CONTRIBUTING.md](./CONTRIBUTING.md)。
```

- [ ] **Step 3: 提交**

```bash
git add docs/CONTRIBUTING.md docs/README.md
git commit -m "docs(site): contributing guide (bilingual workflow, terms, sample rules) + docs README"
```

---

