### Task 5: 英文全量镜像

**Files:**
- Create: `docs/en/start/{_meta.json,intro.md,install.md,quick-start.md,examples.md}`、`docs/en/guide/{_meta.json + 7 页}`、`docs/en/reference/{_meta.json,cli.md}`
- Modify: `docs/en/index.md`（替换为正式首页）

**Interfaces:**
- Consumes: Task 3/4 的 zh 页面（翻译底本）；术语表（本任务 Step 1 定义，Task 6 固化进 CONTRIBUTING）
- Produces: 与 zh 同构的 en 树（`check:locales` 通过是本任务的验收）

- [ ] **Step 1: 定稿术语表（翻译时执行，Task 6 原样收录）**

| 中文 | English | 备注 |
|---|---|---|
| 命令 | command | invoke 不译 |
| 能力 | capability | ACL 语境 |
| 作用域 | scope | PathScope/HttpScope 类型名不译 |
| 窗口 | window | WebviewWindow 类型名不译 |
| 托盘 | tray | |
| 更新器 | updater | |
| 打包 | bundling/packaging | |
| 回归检查 | regression run | `ztron check` 语境 |
| 侧边栏/导航 | sidebar/navbar | |

- [ ] **Step 2: 翻译全部 12 页 + 3 个 `_meta.json` + 首页**

要求：与 zh 页面**标题结构一一对应**（heading 层级与数量一致）；代码块原样保留（注释可译）；链接路径保持相同（locale 内相对解析）；每页末行版本标注同 zh；术语表执行。`_meta.json` 用英文侧边栏文本（Start/Install/Quick Start/Examples/Architecture/IPC/Events & Channel/Windows/Configuration/Security/Migrating from Tauri/CLI Reference）。

- [ ] **Step 3: 结构一致性验收（本任务核心验收）**

```bash
pnpm --dir docs run check:locales && pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build
```

预期：三命令全部 exit 0；en 页面**不得**残留 `<!-- i18n:untranslated -->` 标记。

- [ ] **Step 4: 提交**

```bash
git add docs/en
git commit -m "docs(en): full english mirror of start/guide/reference"
```

---

