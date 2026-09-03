### Task 3: 中文「开始」4 页 + 首页 + 侧边栏

**Files:**
- Create: `docs/zh/start/_meta.json`、`docs/zh/start/intro.md`、`docs/zh/start/install.md`、`docs/zh/start/quick-start.md`、`docs/zh/start/examples.md`
- Modify: `docs/zh/index.md`（替换为正式首页）

**Interfaces:**
- Consumes: Task 1 的 `_nav.json` 链接目标（`/start/intro` 等）；事实源见 Global Constraints
- Produces: zh 侧边栏结构 `intro → install → quick-start → examples`；路由 `/start/*`（en 镜像在 Task 5 落地，期间 `check:locales` 预期失败属正常——CI job 在 Task 8 才接入）

写作要求（适用于本任务所有页面）：中文 500–900 字/页；代码块一律从事实源原样摘取；能力主张必须带 README 验证锚点（如 `MULTI_WINDOW_OK`）；不承诺 Windows/Linux 发布时间；每页末行版本标注。

- [ ] **Step 1: 写 `docs/zh/start/_meta.json`**

```json
[
  { "text": "简介", "link": "/start/intro" },
  { "text": "前置条件与安装", "link": "/start/install" },
  { "text": "快速开始", "link": "/start/quick-start" },
  { "text": "示例", "link": "/start/examples" }
]
```

- [ ] **Step 2: 写 `docs/zh/start/intro.md`**

结构与事实（正文据此成文）：

```markdown
---
title: 简介
---

# Ztron 是什么
<!-- 3-4 句：Tauri 风格跨平台桌面框架的 TypeScript 重写；运行于 txiki.js（~2MB JS 运行时）+ 系统 WebView；
     前端用真实 Web 技术栈，主进程用 TypeScript 而非 Rust。来源 README.md 开头。 -->

# 架构一览
<!-- 贴 README.md 的四框 ASCII 图（ztron-host ↔ tjs backend / frontend / packaging），原样。 -->

# 适用场景与现状
<!-- 一段 + 短表：macOS 全链路已验证（M0–P30，86 项确定性检查，`ztron check` 可驱动）；
     Windows/Linux 为 host 骨架（编译通过），未到打包链。链接 ../guide/architecture 与仓库 ROADMAP.md。 -->

# 与 Tauri 的关系
<!-- 3 句：API 协议与 @tauri-apps/api 同构（@zturnlibs/ztron-api 为其移植）；IPC/能力/配置模型对齐 Tauri v2；
     差异与迁移见 ../guide/tauri-migration。 -->

适用版本：`ztron 0.1.0`
```

- [ ] **Step 3: 写 `docs/zh/start/install.md`**

```markdown
---
title: 前置条件与安装
---

# 前置条件
<!-- 表格：macOS（Apple Silicon 已验证；Intel 未验证，如实注明）· Node ≥ 20 · pnpm 9 · Xcode CLT（build-native 需要）。 -->

# 获取源码与安装依赖
git clone https://github.com/ZturnLibs/ztron.git
cd ztron
pnpm install

# 构建原生链（tjs + ztron-host + webview 库）
scripts/build-native.sh
<!-- 注明：首次构建耗时较长；之后源码变更才需重跑。 -->

# 构建 workspace 包（生成 packages/*/dist，CLI 可用）
pnpm build

# 重要限制：目前需在 monorepo 内使用
<!-- 如实说明：@zturnlibs/ztron-* 以 workspace 协议解析，ztron init 的新项目需位于 monorepo 内；
     发布管线已就绪（tag 触发 publish.yml → GitHub Packages），解除此限制后本节将更新。 -->

适用版本：`ztron 0.1.0`
```

- [ ] **Step 4: 写 `docs/zh/start/quick-start.md`**

```markdown
---
title: 快速开始
---

# 跑通 hello（10 分钟）
cd examples/hello
node ../../packages/cli/dist/index.js dev

# 回归检查（解析应用上报的检查项，FULL_OK + 0 FAIL 才 exit 0）
node ../../packages/cli/dist/index.js check

<!-- 说明 dev 的行为：Vite 构建前端 → 拉起 ztron-host（原生窗口）→ tjs backend 连接；
     窗口出现即成功。check 会输出全部检查项统计，如 `86 checks passed (FULL_OK)`。 -->

# 打包应用
node ../../packages/cli/dist/index.js build
<!-- 产出独立可执行与 .app（ad-hoc 签名）。 -->

# 创建自己的项目（monorepo 内）
cd /path/to/ztron
node packages/cli/dist/index.js init my-app
cd my-app
node ../packages/cli/dist/index.js dev --entry src/main.ts
node ../packages/cli/dist/index.js codegen

<!-- 注：以上命令与 README.md「Quick start」一致；命令详解见 ../reference/cli。 -->

适用版本：`ztron 0.1.0`
```

（写作注：`check`/`build` 用 `node …/index.js` 形式与 README 的 init 用法保持同型，不假设全局 ztron 命令。）

- [ ] **Step 5: 写 `docs/zh/start/examples.md`**

```markdown
---
title: 示例
---
<!-- 三行表格（名称/包名/演示内容/运行命令），事实如下：
  hello | @zturnlibs/ztron-example-hello | invoke/事件/Channel/fs/path 等 API 全面演练（86 检查） | pnpm --filter @zturnlibs/ztron-example-hello dev
  multiwin | @zturnlibs/ztron-example-multiwin | 多窗口：conf 声明 + 运行时 WebviewWindow 创建/销毁 | pnpm --filter @zturnlibs/ztron-example-multiwin dev
  menuprobe | @zturnlibs/ztron-example-menuprobe | 菜单能力探测 | pnpm --filter @zturnlibs/ztron-example-menuprobe dev
每行一段 2-3 句说明 + 指向 examples/ 目录源码路径。 -->

适用版本：`ztron 0.1.0`
```

- [ ] **Step 6: 替换 `docs/zh/index.md` 为正式首页**

```markdown
---
title: Ztron 文档
---

# Ztron 文档

Tauri 风格的跨平台桌面框架，以 TypeScript 重写，运行于 txiki.js + 系统 WebView。

- [快速开始](/start/quick-start) —— 10 分钟跑通第一个应用
- [指南](/guide/architecture) —— 架构、IPC、事件、窗口、配置、安全
- [CLI 参考](/reference/cli) —— init / dev / build / codegen / check / signer
- [示例](/start/examples) —— hello / multiwin / menuprobe

当前状态：macOS 全链路可用（`ztron 0.1.0`）；Windows/Linux 打包链建设中。

适用版本：`ztron 0.1.0`
```

- [ ] **Step 7: 构建验证**

```bash
pnpm --dir docs run build
```

预期：exit 0；`ls docs/doc_build/start/` 可见 intro/install/quick-start/examples 的 HTML。

- [ ] **Step 8: 提交**

```bash
git add docs/zh
git commit -m "docs(zh): start section - intro/install/quick-start/examples + landing page"
```

---

