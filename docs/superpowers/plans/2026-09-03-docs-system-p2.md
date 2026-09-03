# Ztron 文档系统 P2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付 P2：TypeDoc 双语 API 参考（中文翻译覆盖层 + strict 门禁）、命令面参考、全量配置参考（两条生成管线 + 防漂移 CI 检查）、全部插件页（中英双语，分四批）。

**Architecture:** `docs/scripts/gen-api-docs.ts` 以 TypeDoc 0.28 + typedoc-plugin-markdown 4.13 对 `packages/api/src/index.ts` 跑两次构建：英文直出 `docs/en/reference/api/`；中文构建挂本地插件（Converter 阶段按符号限定名查 `docs/translations/api-zh.json` 替换注释）输出 `docs/zh/reference/api/`（两目录 gitignore）。命令面与配置参考由 `gen-commands.ts` / `gen-config.ts` 生成并**提交产物**（CI 用 `--check` 模式重生成比对防漂移）。插件页为手写内容，模板：能力 / 权限与 Scope / 示例，事实全部取自 manifest、README 锚点与 hello/multiwin 实际用法。

**Tech Stack:** TypeDoc 0.28.x · typedoc-plugin-markdown 4.x · TypeScript（compiler API，解析 ProjectConfigFile）· node `--experimental-strip-types` · Rspress 1.47（已就绪）· GitHub Actions（现有 docs job 扩展）

**设计规格:** `docs/superpowers/specs/2026-09-01-docs-system-design.md` §5.2/§6/§9-P2（决策 8：翻译覆盖层）

## Global Constraints

- 工作分支 `feat/docs`（已与 main 同步于 094f7ff）；worktree：`/Users/zyj/Zturn/Ztron/.worktrees/docs`；**所有 git 命令用 `git -C <worktree> …`**（shell cwd 会漂移，并行会话会切检出）
- 中文 canonical、英文镜像；`check:locales` 双门禁必须保持绿；`reference/api/` 子树已豁免结构比对（P2 生成物）；生成页 zh/en 由同一生成器产出
- API 参考生成物 `docs/{zh,en}/reference/api/` **gitignore**；命令面/配置参考产物**入库**，CI `--check` 防漂移
- 翻译文件 `docs/translations/api-zh.json`，键 = 符号限定名（如 `fs.readFile`）；strict 模式：缺翻译（zh 构建遇到 JSON 中没有的符号）或孤儿键（JSON 有但构建未遇到）任一即 exit 1
- 站点 `base: /ztron/docs/`；本地 rspress build 可用（原生模块死锁已恢复），但**子代理一律禁止跑 `pnpm build`/`rspress`**（由控制器统一验证，避免并发构建互踩 `doc_build/`）
- 版本标注：所有新增手写页末行 `` 适用版本：`ztron 0.3.0` ``；事实必须取自当前树（v0.3.0：包名 `@zturnlibs/ztron-*`、事件 `ztron://`、枚举 `ZtronEvent`）
- 插件页事实三源：① `tests/helpers/manifest.ts` COMMANDS（该插件的命令与权限串）② `examples/hello/capabilities/main.json`（真实 capability 写法）③ `examples/hello/src/main.ts` / `examples/hello/frontend/src/main.ts` / `README.md`（真实用法与验证锚点）；**不得凭空编写 API 用法**
- CI：`ci.yml` 的 docs job 追加三条 `--check`（api 翻译覆盖 / commands 漂移 / config 漂移）
- 提交信息英文、`feat(docs)`/`docs`/`ci` 前缀；每个任务一个提交，scoped add

## File Structure

```
docs/
├── package.json                     # +typedoc 等依赖 +gen 脚本（T1/T2）
├── typedoc.json                     # T1：入口/插件/输出配置
├── typedoc.zh-plugin.ts             # T2：中文覆盖层 TypeDoc 插件
├── translations/
│   └── api-zh.json                  # T2：API 中文翻译（渐进补齐）
├── scripts/
│   ├── gen-api-docs.ts              # T1/T2：双构建 + strict 检查
│   ├── gen-commands.ts              # T3：manifest → reference/commands.md（zh/en）
│   └── gen-config.ts                # T4：ProjectConfigFile → reference/config.md（zh/en）
├── translations/config-zh.json      # T4：配置字段中文说明覆盖层
├── zh/reference/{commands.md, config.md}   # T3/T4 生成入库
├── en/reference/{commands.md, config.md}
├── zh/reference/_meta.json          # T5：+ api/commands/config
├── en/reference/_meta.json
├── zh/plugins/  en/plugins/         # T6–T9：插件页（每页能力/权限/示例）
├── zh/_meta.json en/_meta.json      # T5：导航加「插件」
docs/translations/api-zh.json 渐进补齐贯穿 T2–T9（新页引用的 API 需有中文）
根 package.json                        # T2：+ docs:api 转发
.github/workflows/ci.yml               # T2/T3/T4：docs job 加三条 --check
```

---

### Task 1: TypeDoc 英文 API 参考管线

**Files:**
- Modify: `docs/package.json`（devDependencies: typedoc ^0.28.20, typedoc-plugin-markdown ^4.13.0；scripts: `gen:api`）
- Create: `docs/typedoc.json`、`docs/scripts/gen-api-docs.ts`（英文构建部分）
- Modify: `docs/.gitignore`（+`zh/reference/api/`、`en/reference/api/`）

**Interfaces:**
- Produces: `pnpm --dir docs run gen:api` → 生成 `docs/en/reference/api/*.md`（含 `_meta.json` 侧边栏）；`gen-api-docs.ts` 内导出 `buildApiDocs({ locale: "en" | "zh" }): Promise<void>`（T2 复用）

- [ ] **Step 1:** 写 `docs/typedoc.json`：`entryPoints: ["../packages/api/src/index.ts"]`、`plugin: ["typedoc-plugin-markdown", "./typedoc.zh-plugin.ts"]`（插件文件 T1 先建空壳 `export = {}`）、`out` 由脚本注入、`hideInPageTOC: true`、`readme: none`、`githubPages: false`
- [ ] **Step 2:** 写 `gen-api-docs.ts`：导出 `buildApiDocs({locale})`；内部以 `Application.bootstrap` 读 typedoc.json、覆写 `out` 为 `en|zh/reference/api/`、`convertAndGenerate`；`--check` 占位（T2 实现）。CLI 直接运行时执行 en+zh 双构建（zh 构建在 T2 前临时跳过并打印 skip）
- [ ] **Step 3:** `pnpm --dir docs install`；运行 `pnpm --dir docs run gen:api`；预期 `docs/en/reference/api/index.md` + 各模块 md 生成；`ls docs/en/reference/api | head` 含 `fs.md`、`window.md`
- [ ] **Step 4:** 提交（不含生成物）：`git -C <wt> add docs/package.json docs/pnpm-lock.yaml docs/typedoc.json docs/typedoc.zh-plugin.ts docs/scripts/gen-api-docs.ts docs/.gitignore && commit -m "feat(docs): typedoc en api reference pipeline"`
- [ ] **Step 5:** 控制器验证：`pnpm --dir docs run build`（API 页被 rspress 路由，抽查 `doc_build/en/reference/api/fs.html`）

### Task 2: 中文覆盖层 + strict 门禁 + CI 接线

**Files:**
- Modify: `docs/typedoc.zh-plugin.ts`（真实现）、`docs/scripts/gen-api-docs.ts`、`docs/package.json`（`gen:api:check`）、根 `package.json`（`docs:api` 转发）、`.github/workflows/ci.yml`、`docs/scripts/check-api-translations.test.ts`（新）
- Create: `docs/translations/api-zh.json`

**Interfaces:**
- Produces: `pnpm --dir docs run gen:api` 双语输出；`gen:api:check` strict（缺翻译/孤儿键 exit 1）；`collectMissed()`/`collectOrphans()` 纯函数可测

- [ ] **Step 1 (TDD):** 写 `check-api-translations.test.ts`：测纯函数 `diffTranslationKeys(used: Set<string>, defined: Record<string, unknown>) → {missing, orphans}`（missing=used 有 defined 无；orphans 反之）。先跑 `pnpm --dir docs run test` 确认失败
- [ ] **Step 2:** 实现 `typedoc.zh-plugin.ts`：Converter `CREATE_DECLARATION`/`CREATE_SIGNATURE` 事件上，按 reflection 命名空间路径拼限定名（`fs.readFile`；重载签名归并到宿主符号），命中 `api-zh.json` 则替换 `reflection.comment.summary`/`params`/`returns` 文本，未命中记入 `missed()`；插件导出 `missed(): string[]` 供脚本收集
- [ ] **Step 3:** 实现 strict：`gen-api-docs.ts --check` = 双构建后 `diffTranslationKeys` 非空则打印缺失/孤儿清单并 exit 1；无参运行只打印覆盖率报告（`covered/total`）
- [ ] **Step 4:** 建 `api-zh.json` 种子（先填 `core.invoke`、`event.listen`、`fs.readFile` 等 10 个核心符号验证链路；其余符号在 T6–T9 插件页任务中**按需补齐**——每批插件页任务完成后 strict 必须回绿）
- [ ] **Step 5:** `gen:api` 双构建验证 zh 输出含中文（抽查 `docs/zh/reference/api/fs.md` 中 `读取文本文件`）；`gen:api:check` 因其余符号缺失而 exit 1（预期红，清单即翻译欠账）；根 `package.json` 加 `"docs:api": "pnpm --dir docs run gen:api"`
- [ ] **Step 6:** `ci.yml` docs job：build 步骤前加 `- run: pnpm run gen:api:check`（改名 `name: api translation coverage (strict)`）
- [ ] **Step 7:** 提交 `feat(docs): zh api translation overlay + strict coverage gate`
- [ ] **Step 8:** 控制器验证 build + strict 红（种子阶段属预期，T9 后回绿）——**注意：为不阻塞 CI 合并，strict 步骤加 `continue-on-error: true`，T9 完成翻译后移除**

### Task 3: 命令面参考生成器

**Files:**
- Create: `docs/scripts/gen-commands.ts`、`docs/zh/reference/commands.md`、`docs/en/reference/commands.md`（生成入库）
- Modify: `docs/package.json`（`gen:commands` / `gen:commands:check`）、`ci.yml`（+`gen:commands:check`）

**Interfaces:**
- Consumes: `tests/helpers/manifest.ts` 的 `COMMANDS`（import via strip-types）
- Produces: 每语言一页：按 `plugin:xxx` 分组的命令清单表（命令 | 权限归属 | 同名 API 模块链接）；`--check` 重生成 diff 为空

- [ ] **Step 1:** `gen-commands.ts`：`import { COMMANDS } from "../../tests/helpers/manifest.ts"`；解析 `plugin:(?<group>[a-z-]*)\|(?<cmd>.*)`；映射表 `PLUGIN_TO_MODULE`（window→window、fs→fs、…、webview→webview-window 等别名显式列出）；渲染 zh/en 两模板（标题/列头双语，命令本体不译）；写两文件
- [ ] **Step 2:** 生成并人工抽查分组计数与 `grep -o '"plugin:[a-z-]*' | uniq -c` 一致（window 85、path 32、fs 23…）
- [ ] **Step 3:** `--check`：重生成 → 与入库产物 byte 比对，不一致 exit 1；`ci.yml` docs job 加该步
- [ ] **Step 4:** 提交 `feat(docs): generated command-surface reference (zh/en) with drift check`
- [ ] **Step 5:** 控制器验证 build 路由 `doc_build/{zh 前缀省略,en}/reference/commands.html`

### Task 4: 全量配置参考生成器

**Files:**
- Create: `docs/scripts/gen-config.ts`、`docs/translations/config-zh.json`、`docs/{zh,en}/reference/config.md`（入库）
- Modify: `docs/package.json`（`gen:config` / `gen:config:check`）、`ci.yml`、`docs/package.json` devDeps +`typescript`

**Interfaces:**
- Consumes: `packages/core/src/app.ts` 的 `interface ProjectConfigFile`（ts compiler API 解析：字段名/类型/可选性/顶层 jsdoc）
- Produces: 顶层字段 + `build.*`/`app.*`/`app.security.*`/`bundle.*` 嵌套表；`windows[]` 链到 guide/window；中文说明走 `config-zh.json`（键=字段路径如 `app.security.csp`），缺省回退英文 jsdoc

- [ ] **Step 1:** `gen-config.ts`：ts.createSourceFile 解析接口成员（含嵌套字面量类型），输出 zh/en 两 markdown；`--check` 同 T3
- [ ] **Step 2:** `config-zh.json` 覆盖全部字段路径中文说明（以现 `guide/config.md` 已核对过的表述为准）
- [ ] **Step 3:** `ci.yml` docs job 加 `gen:config:check`；提交 `feat(docs): generated full config reference (zh/en) with drift check`
- [ ] **Step 4:** 控制器验证 build + 与 guide/config.md 交叉引用链接互通（guide 页加一句「全字段表见参考」——zh/en 同步）

### Task 5: 导航与侧边栏整合

**Files:**
- Modify: `docs/{zh,en}/reference/_meta.json`（+ api/commands/config）、`docs/{zh,en}/_meta.json`（导航加「插件」，指向 /plugins/）、`docs/{zh,en}/index.md`（落地页 features 加插件页入口）

- [ ] **Step 1:** 更新三组文件（zh/en 对称；`check:locales` 必须绿——注意 api/ 生成目录在 reference/_meta.json 中只放一个目录条目 `api`，不逐文件列举，避免与 gitignore 生成时序耦合）
- [ ] **Step 2:** 提交 `docs(site): integrate api/commands/config + plugins section into nav`
- [ ] **Step 3:** 控制器验证 build + parity + deploy gate 三绿

### Task 6–9: 插件页四批（每批 ≤10 页 ×2 语言）

**Files（每批）:**
- Create: `docs/{zh,en}/plugins/<name>.md` + `docs/{zh,en}/plugins/_meta.json`（首批创建，后续批追加）
- Modify: `docs/translations/api-zh.json`（补齐该批插件 API 符号中文，`gen:api:check` 回绿范围内）

**批次划分（以当前树 api 模块为准，共 40 页）：**
- T6 内建核心：window · webview · webview-window · app · process · event · path · image · dpi · core
- T7 文件网络：fs · http · shell · websocket · network · local-ip · upload · localhost · cli
- T8 桌面组件：dialog · notification · tray · menu · global-shortcut · clipboard · updater · persisted-scope · window-state · positioner
- T9 数据与杂项：store · log · sql · stronghold · autostart · single-instance · deep-link · opener + 移动端一览页 `mobile.md`（barcode-scanner · biometric · nfc · geolocation · haptics 合并一页说明现状 stub）

**每页统一模板（zh 示例，en 镜像翻译）：**

```markdown
---
title: <插件中文名>（<module>）
---
# 概述
<!-- 该插件解决什么问题、对应 api 模块 import 路径（@zturnlibs/ztron-api/<module>） -->
# 权限与 Scope
<!-- capability 权限串表：来自 tests/helpers/manifest.ts 该插件命令所需的权限命名（如 fs:write-default）；
     scope 配置示例：来自 examples/hello/src/main.ts 该插件构造参数（如 fsPlugin({scope})） -->
# 示例
<!-- 前端用法：hello/multiwin 前端真实代码摘录；无前端用法则给后端注册片段 -->
# 命令一览
<!-- 该插件 plugin:xxx|* 命令表（可链接 ../reference/commands/） -->
适用版本：`ztron 0.3.0`
```

- [ ] 每批步骤：读事实三源 → 逐页写 zh+en → 补 `api-zh.json` 该批符号 → `check:locales` 双绿 + `gen:api:check` 覆盖率提升报告 → scoped 提交 `docs(plugins): batch N - <列表> (zh/en)`
- [ ] T9 完成后：移除 T2 的 `continue-on-error`（strict 转硬门禁），`gen:api:check` 必须绿

### Task 10: 终验与 PR

- [ ] 本地全链：`pnpm --dir docs run test`（含 T2 新测试）→ `check:locales` ×2 → `gen:api` → `gen:api:check`（绿）→ `gen:commands:check` → `gen:config:check` → `pnpm --dir docs run build` → 根 `pnpm test`
- [ ] 组装验证：`dist/docs/reference/api/fs.html`、`dist/docs/plugins/fs.html`、`dist/docs/reference/commands.html` 存在
- [ ] push feat/docs → PR → CI 全绿 → merge（沿用 PR #2 流程）

## Self-Review 记录

- **规格覆盖**：spec §9-P2 三条线全覆盖（API 参考+strict ✓T1/T2/T9；命令面 ✓T3；配置参考 ✓T4；插件页两批→改为四批更小粒度，覆盖面等价且含新增模块 ✓T6–T9）；§5.2 生成物 gitignore+豁免 ✓T1；strict 缺翻译/孤儿键 ✓T2
- **对规格的两处偏离（已论证）**：① 插件页从「11+14 两批」改为「四批 + 移动端合并页」——因 0.3.0 新增 stronghold/mobile 等，40 模块超出原 25 页口径，以 manifest 实际为准（spec 本身规定"以 manifest 为准"）；② strict 门禁 T2–T9 期间 `continue-on-error`，翻译补齐后转硬门禁——避免中间态阻塞合入
- **类型一致性**：`buildApiDocs({locale})` T1 定义 T2 复用；`diffTranslationKeys` T2 定义并测试；gen 脚本命名 `gen:*`/`gen:*:check` 在 package.json/ci.yml 两处一致；`PLUGIN_TO_MODULE` 仅 T3 内部
- **占位符扫描**：无 TBD；`api-zh.json` 渐进补齐是任务内明确策略而非占位
