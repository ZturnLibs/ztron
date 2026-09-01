# Ztron 官方文档系统 — 设计规格

- 日期：2026-09-01
- 分支：`feat/docs`
- 状态：待用户评审
- 交付物：仓库内 `docs/` 双语文档站（使用说明 / 引导 / API 文档）

## 0. 决策记录

以下决策已与用户确认：

| # | 决策 | 结论 |
|---|------|------|
| 1 | 文档语言 | **中英双语同步发布** |
| 2 | 站点工具与位置 | **Rspress，仓库内 `docs/`**（对齐 `zturn-home-site` 的技术栈） |
| 3 | API 文档产生方式 | **TypeDoc 自动生成 + 手写指南**；中英文都要完整 |
| 4 | MVP 范围 | **骨架 + 快速开始 + 核心指南**（API 参考、插件页进 P2） |
| 5 | 双语主从 | **中文为 canonical 源，英文为同步镜像**（手写页） |
| 6 | 部署 | **GitHub Pages 与国内镜像同流程一起发布**（不分先后） |
| 7 | 安装形态 | **`docs/` 独立安装**（自带 package.json + lockfile，不进 pnpm workspace） |

**按最佳判断落定、评审时可推翻的一项：**

| # | 决策 | 结论 | 备选 |
|---|------|------|------|
| 8 | 双语 API 参考的实现机制 | **翻译覆盖层**：TypeDoc 两次构建（第二次挂自定义插件按符号限定名替换中文注释），翻译存于 `docs/translations/api-zh.json`；源码与发布包 `.d.ts` 保持纯英文 | 源码双语注释（TSDoc 中英并列 + 构建时过滤），编辑器 IntelliSense 可双语，但 39 个模块源码注释翻倍、diff 噪声大 |

## 1. 目标与非目标

### 目标

- 新用户 30 分钟内按文档从零跑通 hello（init → dev → check → build）
- 应用开发者可日常查阅：CLI、`ztron.conf.json` 配置、全部 API 模块与插件（数量以 `tests/helpers/manifest.ts` 为准）
- Tauri 迁移者能快速定位差异（Rust command → TS command 等对照）
- 中英文内容**结构强制一致、语义同步发布**

### 非目标

- 不迁移开发者内部文档（`DESIGN.md` / `GAP.md` / `ROADMAP.md` / `VERIFY-LATER.md` 留在仓库根，与文档站互链）
- 不做 Rust/crate 文档（Ztron 无 Rust；原生层是 C，不暴露公共 API）
- 0.x 阶段不做多版本站点（结构预留，见 §8）
- 不为 `@ztronlibs/core` 内部 API 做参考（它是主进程内部模块，只通过 `@ztronlibs/api` 和 ztron.conf 暴露公共面）

## 2. 读者与场景

| 读者 | 场景 | 主要入口 |
|------|------|----------|
| 新用户 | 评估、跑通第一个应用 | 开始 → 快速开始 |
| 应用开发者 | 日常查 API / 配置 / 插件 | 参考 / 插件（站内全文搜索） |
| Tauri 迁移者 | 对照迁移 | 指南 → 从 Tauri 迁移 |

## 3. 总体结构

### 3.1 目录布局

```
Ztron/
├── docs/                          # 新增：Rspress 站点，独立安装
│   ├── package.json               #   name: "@ztron/docs", private
│   ├── pnpm-lock.yaml             #   独立 lockfile（决策 7）
│   ├── rspress.config.ts          #   locales + 路由排除 + 品牌
│   ├── i18n.json                  #   UI 文案双语
│   ├── public/                    #   共享静态资源（logo、架构图）
│   ├── translations/
│   │   └── api-zh.json            #   API 中文翻译覆盖层（决策 8）
│   ├── scripts/
│   │   ├── gen-api-docs.ts        #   TypeDoc 双语生成 + 覆盖率/孤儿键检查
│   │   └── check-locales.ts       #   zh/en 目录结构一致性检查
│   ├── CONTRIBUTING.md            #   文档写作规范（站点路由之外）
│   ├── superpowers/specs/         #   本规格所在地（route.exclude）
│   ├── zh/                        # 中文内容（canonical，决策 5）
│   │   ├── _nav.json
│   │   ├── index.md
│   │   ├── start/  guide/  reference/  plugins/
│   └── en/                        # 英文内容（镜像，结构必须与 zh 一致）
│       └── （同构目录树）
└── (pnpm-workspace.yaml、根 package.json 均不改)
```

### 3.2 独立安装与脚本（决策 7）

- `docs/` **不加入** `pnpm-workspace.yaml`；根 `pnpm build` / `pnpm test` 不触碰文档站
- 站内命令一律在 `docs/` 内执行：`pnpm install` / `dev` / `build` / `preview`
- 根 `package.json` 仅加便捷转发（不引入依赖）：
  `docs:dev` / `docs:build` / `docs:preview` / `docs:check`（结构检查）随 P1 落地，实现为 `pnpm --dir docs run …`；`docs:api`（重生成 API 参考）随 P2 落地
- Rspress 版本与 `zturn-home-site` 对齐（`^1.40`）；升级到更高大版本另行评估

### 3.3 rspress.config.ts 要点

- `locales`：`zh`（默认，路由无前缀）+ `en`（`/en/` 前缀）
- `route.exclude`：`**/superpowers/**`、`**/scripts/**`、`**/translations/**`
- 主题：默认文档主题；logo/图标复用 ZturnLabs 品牌资产；`socialLinks` 指向 GitHub 仓库与 `zturn-home-site`；footer 与 home-site 呼应（含 ICP 备案号，仅中文站显示）
- 搜索：Rspress 内建全文搜索（双语各自索引）

## 4. 信息架构

导航树（`[ ]` 为 P2+ 内容）：

```
开始 (start)
  intro          Ztron 是什么 · 为什么 · 架构图 · 与 Tauri 的关系
  install        前置条件与安装（macOS arm64 · node≥20 · pnpm · build-native.sh）
  quick-start    init → dev → check → build → .app/.dmg
  examples       示例导读（hello / multiwin / menuprobe）

指南 (guide)
  architecture        双进程架构 · tjs backend · ztron-host · IPC 模型
  ipc                 定义命令 · invoke · Channel · ztron codegen 类型绑定
  events              listen/emit · 事件名表 · 插件监听器
  window              ztron.conf windows[] · WebviewWindow · 多窗口现状与平台边界注记
  config              ztron.conf.json 核心字段（含 $schema）
  security            ACL / capabilities / PathScope / HttpScope / CSP 概览
  tauri-migration     从 Tauri 迁移（Rust→TS 对照 · conf 映射 · api 包映射）

参考 (reference)
  cli          init / dev / build / codegen / check / signer / version
  config       [ P2：全字段配置参考（生成式） ]
  api          [ P2：TypeDoc 双语 API 参考，全部模块 ]
  commands     [ P2：命令面参考（生成式索引） ]

插件 (plugins)   [ P2：全部插件页（以 manifest 为准），每页：能力 · 权限/scope · 示例 ]
  第一批（11）：fs · http · os · store · log · shell · dialog · notification · tray · menu · updater
  第二批（14）：sql · clipboard · autostart · global-shortcut · single-instance · deep-link ·
               websocket · local-ip · network · upload · persisted-scope · window-state ·
               positioner · opener（以 tests/helpers/manifest.ts 为准）
```

「从 Tauri 迁移」的对照表基础取自 `DESIGN.md` §9（Rust → TS 翻译对照）。

## 5. 双语体系

### 5.1 手写页（start / guide / reference 手写部分 / plugins）

- **中文 canonical**：新页面先写 `zh/`，`en/` 跟随翻译
- `check-locales.ts` 强制两棵目录树路径集合一致，缺失即失败（CI 门禁）
- 允许 `en/` 临时以「未翻译」占位模板存在（结构不缺失，但页面标记欠账并在 CI 报告中列出）；`check-locales.ts --deploy` 模式额外检测占位标记，发现即失败 —— **发布流程不接受欠账**（见 §8.2：deploy 前置此步）
- 每页 frontmatter 双语 title 映射；术语以 CONTRIBUTING 中的中英对照表为准（invoke/命令、capability/能力、scope/作用域、webview 等固定译法）

### 5.2 API 参考（生成页）

- **英文**：TypeDoc 直接从 `packages/api/src` 生成（源码 TSDoc 注释当前即英文）
- **中文**：第二次 TypeDoc 构建挂载自定义插件，在注释解析阶段按**符号限定名**（如 `fs.readFile`）从 `translations/api-zh.json` 替换 summary / params / returns 文本；两次构建均用 `typedoc-plugin-markdown` 渲染，输出格式一致
- 翻译文件 schema（键 = 符号限定名）：

```json
{
  "fs.readFile": {
    "summary": "读取文本文件（按 UTF-8 解码）。",
    "params": { "path": "文件路径", "options": "可选参数" },
    "returns": "文件内容字符串"
  }
}
```

- 生成物 `zh/reference/api/` 与 `en/reference/api/` 均 **gitignore，构建时生成**；`_meta.json`（侧边栏）由生成脚本一并产出。`check-locales.ts` 的路径集合比对**豁免生成目录**（`reference/api/`）——两个 locale 的 API 树由同一生成器产出，一致性与翻译完整性由 §5.2 的 strict 检查保证
- `gen-api-docs.ts --strict`：P2 起为 CI 默认 —— 缺翻译、孤儿键（翻译文件中存在但源码已删除的符号）任一出现即失败；本地非 strict 运行输出覆盖率报告

## 6. 参考内容生成管线（P2 落地）

| 内容 | 数据源 | 生成方式 |
|------|--------|----------|
| API 参考 | `packages/api/src`（全部模块，TSDoc 已有基础） | §5.2 双构建；入口以 `index.ts` re-export 面为准，与 tests surface manifest 同构 |
| 命令面参考 | `tests/helpers/manifest.ts` 的 `COMMANDS` | 脚本导出「命令 → 所属插件 → API 模块」索引页（`plugin:xxx\|cmd` 分组，链接到对应 API 页） |
| 配置参考 | `packages/core/src/app.ts` 的 `ZtronConf` 类型与校验 | P1 手写核心字段表；P2 从类型提取生成全字段表（含 `windows[]` 全量） |

三条管线共同原则：**签名/字段/命令一律生成，不手抄**，杜绝与代码漂移。

## 7. 写作规范（docs/CONTRIBUTING.md）

- frontmatter 约定、双语同步流程、术语对照表、截图规范
- **代码示例必须与 `examples/hello` / `multiwin` 可运行代码对齐**，优先摘取而非凭空编写
- 现状如实标注：文档明确说明「新项目当前需在 monorepo 内使用（`@ztron/*` 解析依赖），npm 发布（`publish.yml` → GitHub Packages）后解除」
- 每页标注「适用版本」（当前 `ztron 0.1.0`）；重大 API 变更要求同 PR 更新对应页面与翻译文件

## 8. 构建、CI 与部署

### 8.1 CI（`ci.yml` 新增 `docs` job）

- 触发与现有 job 相同（PR + main push）
- 步骤：checkout → pnpm/node setup → `pnpm install --frozen-lockfile --dir docs` → `pnpm --dir docs run check:locales` → `pnpm --dir docs run build`
- API 生成在 P2 并入 build 链（`gen-api-docs.ts`，strict 模式为 CI 默认：缺翻译、孤儿键任一出现即失败）；P1 的 build 仅静态内容
- 失败条件：结构不一致、翻译缺失/孤儿键（strict 后）、构建失败

### 8.2 部署（决策 6：双目标同流程发布）

- 触发：push 到 `main`（可加 path 过滤 `docs/**`）+ 手动 dispatch；**P1 验收通过前不启用自动触发**，仅手动演练
- 前置步骤：`pnpm --dir docs run check:locales -- --deploy`（占位标记检测，见 §5.1）
- **构建一次**产出静态目录，同一 workflow 内发布两个目标：
  1. **GitHub Pages**：`actions/upload-pages-artifact` + `actions/deploy-pages`；`base` 按项目页子路径 `/ztron/` 配置（自定义域名后调整）
  2. **国内镜像**：与 `zturn-home-site` 同托管（ICP 备案已具备）；上传机制可插拔（对象存储 / rsync，凭证走 repo secrets）
- 本地等价命令 `pnpm --dir docs run deploy` 双轨推送，CI 与本地均可完成完整发布
- 站点互链：文档站 header 链回 ZturnLabs 官网；home-site 链入文档站（对端仓库后续补充）

### 8.3 版本化

- 0.x 阶段单 `latest`，不做多版本
- 目录结构采用 Rspress 多版本形态（`docs/{version}/{lang}/` 可平滑扩展），1.0 时评估启用

## 9. 分阶段交付

| 阶段 | 内容 | 验收标准 |
|------|------|----------|
| **P1（MVP）** | Rspress 骨架 + 双语 locale + 品牌；`docs/` 独立安装与根转发脚本；开始 4 页 + 指南 7 页 + CLI 参考；CONTRIBUTING；`check-locales` + CI docs job；部署 workflow（双目标） | ① 新用户按 quick-start 从 clone 到 `ztron check` 通过（由评审者实际执行验证）② zh/en 树一致 ③ 一次完整双目标发布演练成功 |
| **P2** | 插件页两批（11 + 14，以 manifest 为准）；TypeDoc 双语 API 参考 + strict CI；命令面/全量配置参考 | ① API 页覆盖全部模块且中文翻译覆盖率 100%（strict 门禁）② 三条生成管线各一条命令可重跑 |
| **P3** | 打包/签名/公证/更新器指南；调试专题（devtools · 日志 · ztron check）；英文全量润色；发布常态化 | 站点公网双目标可达，导航与搜索完整 |

## 10. 风险与对策

| 风险 | 对策 |
|------|------|
| 翻译覆盖层与源码漂移 | strict CI + 孤儿键检测；重大 API 变更同 PR 更新翻译文件（写进 CONTRIBUTING） |
| 双语同步拖累迭代 | 结构强制一致 + en 占位标记；发布流程不接受欠账 |
| 高速迭代期文档过时 | 页面「适用版本」标注；示例与 examples 对齐 |
| TypeDoc/Rspress 升级 breaking | 独立 lockfile 锁版本；生成物不入库，可随时重跑 |
| 国内镜像运维成本 | 上传目标可插拔，单目标故障不阻塞另一目标 |

## 11. 与 Tauri 文档系统的对照（参考依据）

| 维度 | Tauri | Ztron 取舍 |
|------|-------|-----------|
| 文档仓库 | 独立 `tauri-docs` 仓库 | 仓库内 `docs/`（小团队，代码+文档同 PR） |
| 站点框架 | Docusaurus 起家，后自研重写 | Rspress（与 home-site 同栈，i18n/搜索内建） |
| JS API 参考 | TypeDoc 流水线 | 同型：TypeDoc + markdown 插件；增加中文覆盖层（Tauri 无双语需求） |
| Rust API | docs.rs | 不适用（无 Rust 公共面） |
| 分层 | Start → Guides → Reference | 同构采纳，按 Ztron 实际裁剪 |
| 插件页 | 每插件：能力 + 权限 + 示例 | 采纳同结构 |
| 版本化 | v1/v2 多版本 | 0.x 单版本，结构预留 |
