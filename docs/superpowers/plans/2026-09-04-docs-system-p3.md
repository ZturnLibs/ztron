# Ztron 文档系统 P3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付规格 §9-P3 的剩余内容：打包与分发、签名与更新器、调试与日志三篇指南（×2 语言），以及英文全量润色（含历史遗留 minor 的清理）。「发布常态化」已在 P1/P2 由 `website.yml` 自动部署实现，本阶段不含部署工作。

**Architecture:** 三篇新指南页挂入现有「指南」分区（`_meta.json` 追加 + 分区落地页导引同步），内容全部溯源到 CLI 实现（bundler/signer/check）、updater 插件源码、README P-rows 与 hello 配置。英文润色只动 en 树的文本表述，保持标题结构与 zh 严格对齐（check:locales 继续把门）。

**Tech Stack:** 既有 Rspress 1.47 站点；无新依赖；CI 不变（现有三重生成门禁 + 双语结构门禁覆盖新页）。

**设计规格:** `docs/superpowers/specs/2026-09-01-docs-system-design.md` §9-P3

## Global Constraints

- Worktree `/Users/zyj/Zturn/Ztron/.worktrees/docs`（分支 feat/docs，须先与 origin/main 同步）；git 一律 `git -C <worktree> …`；scoped add；不碰主检出
- 子代理禁止 `pnpm run build`/rspress（控制器统一构建验证）
- 中文 canonical、英文镜像：标题层级/数量 1:1；代码块溯源（摘自需 verbatim 并标注，改写需标注「基于 … 改写」）；每页末行 `` 适用版本：`ztron 0.3.0` ``
- 事实源：`packages/cli/src/bundler.ts`、`packages/cli/src/signer.ts`、`packages/cli/src/index.ts`（check 分支）、`packages/core/src/plugins/updater.ts`、`packages/api/src/{updater,log,webview}.ts`、`examples/hello/src/main.ts`（updater/log 插件构造）、`README.md`（P4/P17/P28/P30/P21 行与验证锚点）、`DESIGN.md` 打包小节
- 如实标注现状：Developer ID 签名/公证未完成（README「Remaining」），文档不得暗示已支持
- 英文润色不改变任何链接路径、代码块、标题结构；已知遗留项必须清理：en/guide/events.md "send targeted" 措辞（×2 处）、start 两页的括号插入语残留（若仍在）
- 门禁：`check:locales` + `:deploy`、docs tests 11/11、`gen:api:check`（strict，578/578）、`gen:commands:check`、`gen:config:check` 全绿

## File Structure

```
docs/zh/guide/{bundling.md, signing-updater.md, debugging.md}   # T1 新页（en 镜像）
docs/en/guide/{bundling.md, signing-updater.md, debugging.md}
docs/{zh,en}/guide/_meta.json                                   # T2 追加三行（打包与分发 → 签名与更新器 → 调试与日志，置于「从 Tauri 迁移」之前）
docs/{zh,en}/guide/index.md                                     # T2 落地页导引加三行
docs/en/**                                                      # T3 英文润色（仅 en 树）
```

---

### Task 1: 三篇指南页（×2 语言）

**Files:**
- Create: `docs/zh/guide/{bundling,signing-updater,debugging}.md`、`docs/en/guide/` 同名三页

**Interfaces:**
- Produces: 路由 `/guide/bundling`、`/guide/signing-updater`、`/guide/debugging`（供 T2 导航引用）

- [ ] **Step 1: `bundling.md` 打包与分发** — 结构：`## ztron build 做了什么`（vite 构建前端 → tjs compile 后端 → 组装 .app；以 bundler.ts 实际流程为准，逐步列出）；`## .app 结构`（launcher Mach-O 为主执行档 + 后端置于 Resources —— P17 签名链修复的原因，摘 DESIGN/README 表述）；`## DMG`（hdiutil UDZO、拖入 Applications 布局）；`## bundle.* 配置`（链接 ../config 全字段表，列 bundle.active/targets/icon/resources/category… 与 hello 实际用例）；`## 签名现状`（ad-hoc 已自动；Developer ID + 公证 = 未完成，如实标注并链接仓库 ROADMAP/Remaining）；`适用版本` 行
- [ ] **Step 2: `signing-updater.md` 签名与更新器** — `## minisign 密钥`（`ztron signer generate`，--pk-file/--sk-file，与 jedisct1/minisign 互验——读 signer.ts 确认子命令全集后照实写）；`## 更新清单格式`（manifest `platforms.darwin{url,sha256,signature}`——摘 updater 源码 docstring/类型）；`## 配置 updaterPlugin`（hello 真实片段：currentVersion + scope allow-list { url }，摘自标注）；`## install() 流程`（check→download→sha256+minisign 验证→relaunch，pubKey fail-closed，`{ok:false,reason:"no-update"}`）；`## 能力项`（updater:default 含 check/download/verify/verify_signature；updater:allow-install / -stream 单独授予——与 plugins/updater.md 一致口径）
- [ ] **Step 3: `debugging.md` 调试与日志** — `## DevTools`（plugin:webview|toggle_devtools / api webview 模块调用方式，对照源码）；`## 日志`（log v2：stdout/stderr/file/webview 四类 target、maxFileSize、keepAll/keepOne 轮换、appLogDir 布局——P21 + log.ts；hello LOG_ROTATE_OK 例子摘自标注）；`## ztron check`（回归运行器语义：解析上报检查行、FULL_OK + 0 FAIL 才 exit 0、--expect/--timeout；给出 hello 上的真实命令与输出示例——README P30 行）；`## 常见问题`（如：bare binary 通知权限降级 NOTIF_PERM_OK:false → 需 .app；后台重建后 dev 自动 reload）
- [ ] **Step 4:** en 镜像翻译（术语表口径；标题 1:1）
- [ ] **Step 5:** 验证：check:locales ×2、tests 11/11、三条 gen 检查；提交 `docs(guide): bundling/signing-updater/debugging guides (zh/en)`

### Task 2: 导航与落地页接线

**Files:**
- Modify: `docs/{zh,en}/guide/_meta.json`（三页插到 tauri-migration 之前）、`docs/{zh,en}/guide/index.md`（导引列表加三行，zh/en 对称）

- [ ] **Step 1:** 改 4 个文件；验证五门禁；提交 `docs(guide): wire ship/debug guides into nav and landing`

### Task 3: 英文润色（仅 en 树）

**Files:**
- Modify: `docs/en/guide/events.md`（"send targeted" ×2 → "send targeted events" 并核对语义方向与 zh 一致）、`docs/en/start/{intro,quick-start}.md`（清除遗留括号插入语——若 P2 已清则略过并记录）、其余 en 页通读一遍的轻度润色（措辞/冠词/术语一致性：capability/scope/command 全大写约定等），**不改标题、链接、代码块、frontmatter**

- [ ] **Step 1:** 先 grep 遗留项清单，逐项修；再通读 en/guide + en/start + en/reference 手写页做轻度润色（每处改动需可独立成立，不做整段重写）
- [ ] **Step 2:** 验证五门禁 + 标题计数 parity 抽查（每对页 heading 数相等）；提交 `docs(en): language polish pass (guide/start/reference)`

### Task 4: 终验与发布

- [ ] 控制器：本地 build + 组装，抽查 `/guide/bundling.html` 等新页与 en 对应页；push → PR → CI 全绿 → merge → 线上 200 抽检 → feat/docs 同步 main → 账本收尾

## Self-Review 记录

- **规格覆盖**：§9-P3 四项中「双目标可达/发布常态化」已由前两阶段完成并注明；本计划覆盖其余全部内容项 ✓
- **占位符扫描**：无 TBD；润色任务明确了遗留项清单的来源与处理方式
- **类型一致性**：新路由名 bundling/signing-updater/debugging 在 T1/T2 一致；链接约定沿用 `/guide/…` 根绝对式
