# Ztron 官方文档系统 P1（MVP）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库内 `docs/` 搭建独立安装的 Rspress 双语文档站（中/英），交付「开始 4 页 + 指南 7 页 + CLI 参考」全量内容、zh/en 结构一致性检查、CI job 与双目标（GitHub Pages + 国内镜像）部署 workflow。

**Architecture:** Rspress 1.x 静态站点，`docs/` 自带 package.json + lockfile（不进 pnpm workspace），内容按语言分目录（`docs/zh/` canonical、`docs/en/` 镜像），侧边栏/导航由各级 `_meta.json`/`_nav.json` 声明。`scripts/check-locales.ts` 以纯函数 + CLI 双形态强制两棵目录树一致（`--deploy` 模式额外拦截未翻译占位标记）。部署为单 workflow 双目标：Pages 用官方 actions，国内镜像用可插拔 rsync 脚本（secrets 未配置时跳过）。

**Tech Stack:** Rspress ^1.40.2 · TypeScript（node `--experimental-strip-types` 直接运行脚本与测试）· GitHub Actions（actions/checkout@v4、pnpm/action-setup@v4、setup-node@v4、pages 系列 actions）

**设计规格：** `docs/superpowers/specs/2026-09-01-docs-system-design.md`（P2 的 TypeDoc/插件页/命令面生成**不在本计划内**）

## Global Constraints

- 中文 canonical、英文镜像；两棵目录树文件路径集合必须一致（`reference/api/` 子树豁免，属 P2 生成物）
- `docs/` 独立安装：**绝不修改** `pnpm-workspace.yaml`；根 `pnpm build`/`pnpm test` 不触碰 docs
- Rspress 版本 `^1.40.2`（与 zturn-home-site 对齐）；站点 `base: "/ztron/"`（GitHub Pages 项目页子路径）
- 站点 `lang: "zh"`（默认语言无路由前缀）；en 挂 `/en/` 前缀
- ICP 备案号 `鄂ICP备2025110122号` 显示在 footer（两个 locale 都显示——国内镜像两 locale 同域，合规需要）
- 未翻译占位标记约定：en 页面正文第一行 `<!-- i18n:untranslated -->`
- 版本标注约定：每页正文末行 `` 适用版本：`ztron 0.1.0` ``
- 品牌图标从 `/Users/zyj/Zturn/zturn-home-site/docs/public/zturnlabs-icon.png` **只读复制**（不改源仓库）
- 提交信息沿用仓库现有风格（`docs:` / `feat:` / `ci:` 前缀，英文一行）
- 所有命令默认在仓库根执行；`docs/` 内命令用 `pnpm --dir docs run …` 或先 `cd docs`
- 事实源（写内容前必读，引用其中真实代码/字段，不得凭空编写）：
  - `README.md`（架构图、包表、Quick start、验证锚点）
  - `examples/hello/ztron.conf.json`、`examples/hello/src/commands.ts`、`examples/hello/src/main.ts`、`examples/hello/frontend/src/main.ts`
  - `examples/hello/capabilities/main.json`
  - `packages/core/src/app.ts:1533`（`ProjectConfigFile` 完整 shape）
  - `packages/cli/src/index.ts:38`（USAGE）、`packages/cli/src/signer.ts`、`packages/cli/src/codegen.ts:177`
  - `packages/api/src/event.ts`、`packages/api/src/window.ts`（`WindowEventName`）
  - `DESIGN.md` §3（架构图）、§9（Rust→TS 对照表）
  - GitHub 仓库地址：`https://github.com/ZturnLibs/ztron`

## File Structure

```
docs/                              # T1 创建，独立安装
├── package.json                   #   @zturnlibs/ztron-docs + rspress + 脚本
├── .gitignore                     #   node_modules/ doc_build/
├── rspress.config.ts              #   locales + base + route.exclude + 品牌
├── i18n.json                      #   导航键双语
├── README.md                      #   T6：如何运行文档站
├── CONTRIBUTING.md                #   T6：写作规范（站外文件，非路由页）
├── public/
│   └── zturnlabs-icon.png         #   T1 从 home-site 复制
├── scripts/
│   ├── check-locales.ts           #   T2：结构一致性 + 占位检测（纯函数 + CLI）
│   ├── check-locales.test.ts      #   T2：单元测试
│   └── deploy-mirror.sh           #   T9：国内镜像 rsync（无配置则跳过）
├── zh/                            # T3/T4 填充
│   ├── _nav.json  index.md
│   ├── start/    _meta.json + intro.md install.md quick-start.md examples.md
│   ├── guide/    _meta.json + architecture.md ipc.md events.md window.md config.md security.md tauri-migration.md
│   └── reference/ _meta.json + cli.md
├── en/                            # T5 全量镜像翻译
│   └── （与 zh 同构）
├── superpowers/specs|plans/…      # 既有（route.exclude 排除，勿动）
.github/workflows/ci.yml           # T8 追加 docs job
.github/workflows/docs-deploy.yml  # T9 新建
package.json（根）                  # T7 追加 docs:* 转发脚本
README.md（根）                     # T7 追加 Documentation 节
```

每个文件单一职责：`rspress.config.ts` 只放站点配置；`check-locales.ts` 只做树比对与标记检测；每个内容页一个主题。内容任务（T3–T5）中每个 `.md` 文件是独立交付物，可单独评审。

---

### Task 1: 站点骨架（可安装、可构建、双语最小首页）

**Files:**
- Create: `docs/package.json`、`docs/.gitignore`、`docs/rspress.config.ts`、`docs/i18n.json`、`docs/zh/index.md`、`docs/en/index.md`、`docs/zh/_nav.json`、`docs/en/_nav.json`
- Create: `docs/public/zturnlabs-icon.png`（复制自 `/Users/zyj/Zturn/zturn-home-site/docs/public/zturnlabs-icon.png`）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `docs/` 可构建站点；目录约定 `docs/zh`（默认语言、无路由前缀）与 `docs/en`（`/en/` 前缀）；`i18n.json` 键 `start`/`guide`/`reference`（后续任务在 `_nav.json` 里以键引用）

- [ ] **Step 1: 写 `docs/package.json`**

```json
{
  "name": "@zturnlibs/ztron-docs",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "rspress dev",
    "build": "rspress build",
    "preview": "rspress preview",
    "check:locales": "node --experimental-strip-types scripts/check-locales.ts",
    "check:locales:deploy": "node --experimental-strip-types scripts/check-locales.ts --deploy",
    "test": "node --experimental-strip-types --test scripts/*.test.ts"
  },
  "dependencies": {
    "rspress": "^1.40.2"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: 写 `docs/.gitignore`**

```
node_modules/
doc_build/
```

- [ ] **Step 3: 写 `docs/rspress.config.ts`**

```ts
import { defineConfig } from "rspress/config";
import { fileURLToPath } from "node:url";

// 站点根即本目录：zh/ 为默认语言（无路由前缀），en/ 挂 /en/。
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  // GitHub Pages 项目页子路径；绑定自定义域名后改为 "/"
  base: "/ztron/",
  lang: "zh",
  title: "Ztron",
  icon: "/zturnlabs-icon.png",
  locales: [
    { lang: "zh", label: "中文" },
    { lang: "en", label: "English" },
  ],
  route: {
    exclude: ["**/superpowers/**", "**/scripts/**", "**/translations/**"],
  },
  themeConfig: {
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/ZturnLibs/ztron",
      },
    ],
    footer: {
      message: `
        <div>
          <div><a href="https://github.com/ZturnLibs/ztron">GitHub</a> · Ztron</div>
          <div><a href="https://beian.miit.gov.cn/">鄂ICP备2025110122号</a></div>
        </div>
      `,
    },
  },
});
```

- [ ] **Step 4: 写 `docs/i18n.json`（导航键双语）**

```json
{
  "start": { "zh": "开始", "en": "Start" },
  "guide": { "zh": "指南", "en": "Guide" },
  "reference": { "zh": "参考", "en": "Reference" },
  "plugins": { "zh": "插件", "en": "Plugins" }
}
```

- [ ] **Step 5: 写最小首页与导航**

`docs/zh/index.md`：

```markdown
---
title: Ztron 文档
---

# Ztron 文档

Tauri 风格的跨平台桌面框架，以 TypeScript 重写，运行于 txiki.js + 系统 WebView。

（P1 内容建设中——本页在 Task 3 之后由正式首页替换。）

适用版本：`ztron 0.1.0`
```

`docs/en/index.md`：

```markdown
---
title: Ztron Docs
---

# Ztron Docs

A Tauri-style cross-platform desktop framework rewritten in TypeScript, on txiki.js + the system WebView.

(Placeholder while P1 content lands — replaced by the real landing page after Task 3.)

适用版本：`ztron 0.1.0`
```

`docs/zh/_nav.json` 与 `docs/en/_nav.json` 内容相同（text 为 i18n 键，链接在各自 locale 内解析）：

```json
[
  { "text": "start", "link": "/start/intro" },
  { "text": "guide", "link": "/guide/architecture" },
  { "text": "reference", "link": "/reference/cli" }
]
```

- [ ] **Step 6: 复制品牌图标**

```bash
mkdir -p docs/public
cp /Users/zyj/Zturn/zturn-home-site/docs/public/zturnlabs-icon.png docs/public/
```

- [ ] **Step 7: 安装并构建验证**

```bash
cd docs && pnpm install && pnpm build
```

预期：`install` 生成 `docs/pnpm-lock.yaml`；`build` exit 0，产出 `docs/doc_build/`，内含 `index.html`（zh 默认）与 `en/index.html`。若 `en/` 前缀缺失，检查 `locales` 配置拼写。

- [ ] **Step 8: 提交**

```bash
git add docs/package.json docs/pnpm-lock.yaml docs/.gitignore docs/rspress.config.ts docs/i18n.json docs/zh docs/en docs/public
git commit -m "docs(site): rspress skeleton - bilingual locales, base path, brand icon"
```

---

### Task 2: check-locales 结构一致性检查（TDD）

**Files:**
- Create: `docs/scripts/check-locales.ts`、`docs/scripts/check-locales.test.ts`
- Modify: 无（package.json 脚本已含 check:locales/test）

**Interfaces:**
- Consumes: `docs/zh`、`docs/en` 目录树
- Produces: `walk(dir, base?): string[]`；`diffTrees(zhFiles: string[], enFiles: string[]): { missingInEn: string[]; missingInZh: string[] }`；`findPlaceholders(enDir: string, enFiles: string[]): string[]`；CLI 退出码 0/1，`--deploy` 标志；占位标记正则 `<!-- i18n:untranslated -->`（Task 5/6 依赖此约定）

- [ ] **Step 1: 写失败测试 `docs/scripts/check-locales.test.ts`**

```ts
/** Unit tests for the zh/en parity checker. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffTrees, findPlaceholders } from "./check-locales.ts";

test("identical trees produce no diffs", () => {
  const d = diffTrees(["index.md", "start/_meta.json"], ["index.md", "start/_meta.json"]);
  assert.deepEqual(d.missingInEn, []);
  assert.deepEqual(d.missingInZh, []);
});

test("file in zh missing from en is reported", () => {
  const d = diffTrees(["index.md", "guide/ipc.md"], ["index.md"]);
  assert.deepEqual(d.missingInEn, ["guide/ipc.md"]);
  assert.deepEqual(d.missingInZh, []);
});

test("file in en missing from zh is reported", () => {
  const d = diffTrees(["index.md"], ["index.md", "orphan.md"]);
  assert.deepEqual(d.missingInZh, ["orphan.md"]);
});

test("generated reference/api subtree is exempt", () => {
  const d = diffTrees(["index.md", "reference/api/fs.md"], ["index.md"]);
  assert.deepEqual(d.missingInEn, []);
  assert.deepEqual(d.missingInZh, []);
});

test("findPlaceholders flags en pages carrying the marker", () => {
  const dir = mkdtempSync(join(tmpdir(), "cl-test-"));
  try {
    mkdirSync(join(dir, "guide"), { recursive: true });
    writeFileSync(join(dir, "index.md"), "# Home\n");
    writeFileSync(join(dir, "guide", "ipc.md"), "<!-- i18n:untranslated -->\n# IPC\n");
    assert.deepEqual(findPlaceholders(dir, ["index.md", "guide/ipc.md"]), ["guide/ipc.md"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: 运行确认失败**

```bash
pnpm --dir docs run test
```

预期：FAIL，`Cannot find module './check-locales.ts'`。

- [ ] **Step 3: 实现 `docs/scripts/check-locales.ts`**

```ts
/**
 * check-locales — enforce zh/en structural parity for the docs site.
 * zh/ is the canonical tree; en/ must mirror it file-for-file.
 * Exit 1 on any mismatch. --deploy additionally fails on untranslated
 * placeholder markers in en/ pages (release gate, spec §5.1/§8.2).
 * reference/api/ is exempt: P2 gen-api-docs output, gitignored.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXEMPT = [/^reference[/\\]api[/\\]/];
const PLACEHOLDER = /<!--\s*i18n:untranslated\s*-->/;
const TRACKED = /\.(md|mdx)$|^_meta\.json$|^_nav\.json$/;

export function walk(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(dir, base))) {
    const rel = base ? `${base}/${name}` : name;
    if (statSync(join(dir, rel)).isDirectory()) out.push(...walk(dir, rel));
    else if (TRACKED.test(name)) out.push(rel);
  }
  return out;
}

export interface TreeDiff {
  missingInEn: string[];
  missingInZh: string[];
}

export function diffTrees(zhFiles: string[], enFiles: string[]): TreeDiff {
  const keep = (f: string) => !EXEMPT.some((re) => re.test(f));
  const en = new Set(enFiles.filter(keep));
  const zh = new Set(zhFiles.filter(keep));
  return {
    missingInEn: zhFiles.filter((f) => keep(f) && !en.has(f)),
    missingInZh: enFiles.filter((f) => keep(f) && !zh.has(f)),
  };
}

export function findPlaceholders(enDir: string, enFiles: string[]): string[] {
  return enFiles.filter(
    (f) => f.endsWith(".md") && PLACEHOLDER.test(readFileSync(join(enDir, f), "utf8")),
  );
}

function main(): void {
  const deploy = process.argv.includes("--deploy");
  const zhDir = join(ROOT, "zh");
  const enDir = join(ROOT, "en");
  const { missingInEn, missingInZh } = diffTrees(walk(zhDir), walk(enDir));
  const placeholders = deploy ? findPlaceholders(enDir, walk(enDir)) : [];
  for (const f of missingInEn) console.error(`[check-locales] missing in en/: ${f}`);
  for (const f of missingInZh) console.error(`[check-locales] missing in zh/: ${f}`);
  for (const f of placeholders) console.error(`[check-locales] untranslated placeholder in en/: ${f}`);
  if (missingInEn.length || missingInZh.length || placeholders.length) process.exit(1);
  console.log(`[check-locales] OK — zh/en trees match${deploy ? ", no placeholders" : ""}`);
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) main();
```

- [ ] **Step 4: 运行测试确认通过**

```bash
pnpm --dir docs run test
```

预期：5 tests PASS。

- [ ] **Step 5: 验证 CLI 两种模式（当前 zh/en 同构，均应通过）**

```bash
pnpm --dir docs run check:locales && pnpm --dir docs run check:locales:deploy
```

预期：两行 `[check-locales] OK …`，exit 0。

- [ ] **Step 6: 提交**

```bash
git add docs/scripts/check-locales.ts docs/scripts/check-locales.test.ts
git commit -m "docs(site): zh/en parity checker - tree diff + deploy placeholder gate (TDD)"
```

---

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

### Task 4: 中文「指南」7 页 + CLI 参考

**Files:**
- Create: `docs/zh/guide/_meta.json` 及 7 个指南页、`docs/zh/reference/_meta.json`、`docs/zh/reference/cli.md`

**Interfaces:**
- Consumes: Task 3 的侧边栏/首页链接目标（`/guide/architecture`、`/reference/cli`）；事实源见 Global Constraints
- Produces: 路由 `/guide/*`、`/reference/cli`（zh）

- [ ] **Step 1: 写 `docs/zh/guide/_meta.json` 与 `docs/zh/reference/_meta.json`**

```json
[
  { "text": "架构总览", "link": "/guide/architecture" },
  { "text": "调用后端命令", "link": "/guide/ipc" },
  { "text": "事件与 Channel", "link": "/guide/events" },
  { "text": "窗口", "link": "/guide/window" },
  { "text": "配置 ztron.conf.json", "link": "/guide/config" },
  { "text": "安全模型", "link": "/guide/security" },
  { "text": "从 Tauri 迁移", "link": "/guide/tauri-migration" }
]
```

```json
[
  { "text": "CLI 参考", "link": "/reference/cli" }
]
```

- [ ] **Step 2: `docs/zh/guide/architecture.md`** —— 贴 README 四框图 + 双进程数据流说明（ztron-host（C，窗口/托盘/菜单）↔ TCP/JSON ↔ tjs backend（@zturnlibs/ztron-core IPC/插件/ACL））；五包职责表（照 README Packages 表：api/core/runtime-ffi/inject/cli）；「深入阅读」链接仓库 `DESIGN.md`。

- [ ] **Step 3: `docs/zh/guide/ipc.md`** —— 必含以下真实代码（摘自 `examples/hello/src/commands.ts` 与 `src/main.ts`）：

```ts
// src/commands.ts —— 类型化命令（可被 ztron codegen 识别）
import { defineCommand } from "@zturnlibs/ztron-core";

export const greet = defineCommand("my:greet", {
  args: {} as { name: string },
  result: "" as string,
  handler: (args) => `hello, ${args.name}`,
});
```

```ts
// src/main.ts —— 注册（setup 回调内）
app.commandDef(greet);            // 类型化
app.command("m3:echo-port", () => echoPort);  // 内联
```

```ts
// frontend/src/main.ts —— 前端调用
import { invoke } from "@zturnlibs/ztron-api";
const echoed = await invoke<string>("my:echo", { msg: "hello-m3" });
```

并说明 `ztron codegen` 生成 `src/ztron-commands.ts` 类型绑定后 `g.invoke("my:greet", { name: "codegen" })` 的用法（同源：hello 前端第 103–110 行）；一段「命令为何受能力约束」预告链接 ../guide/security。

- [ ] **Step 4: `docs/zh/guide/events.md`** —— listen/once/emit/emitTo 代码示例（基于 `packages/api/src/event.ts` 真实签名：`listen<T>(event, cb, options?) → Promise<UnlistenFn>`，`UnlistenFn = () => Promise<void>`）；窗口事件名表（原样列 `window.ts` 的 `WindowEventName` 11 项：resize/move/focus/blur/close-requested/scale-change/theme-changed/drag-enter/drag-over/drag-drop/drag-leave）；一句带过插件监听器 `plugin:*|__listener` 契约（详解留 P2 插件页）。

- [ ] **Step 5: `docs/zh/guide/window.md`** —— 声明式：摘录 `examples/hello/ztron.conf.json` 双窗配置（main 窗 `url: "frontend"` + conf-second 窗 `html` 内联，含 width/height/minWidth/titleBarStyle/alwaysOnTop/x/y 字段展示）；运行时：`WebviewWindow`（`@zturnlibs/ztron-api`，multiwin 示例运行时创建/销毁第二窗，验证锚点 `SECOND_WINDOW_OK`）；平台边界注记：运行时多窗创建在 macOS 已解锁、webview 库在运行循环中的限制历史见 `DESIGN.md` §75。

- [ ] **Step 6: `docs/zh/guide/config.md`** —— 摘录 hello `ztron.conf.json` 全文；核心字段表（P1 子集，来源 `packages/core/src/app.ts` 的 `ProjectConfigFile`）：`entry`/`frontend`/`identifier`/`productName`(appName 别名)/`appName`/`mainBinaryName`/`version`/`csp`(旧顶层，建议用 app.security.csp)/`capabilities`(旧顶层)/`build.{devUrl,frontendDist,beforeDevCommand,beforeBuildCommand,beforeBundleCommand}`/`app.{withGlobalTauri,macOSPrivateApi}`/`app.security.{csp,devCsp,capabilities,assetProtocol.{scope,requireLiteralLeadingDot},freezePrototype}`/`bundle.{active,targets,icon,resources,category,publisher,homepage,shortDescription,longDescription,copyright,license}`/`plugins`/`windows[]`；校验行为说明（未知顶层键告警、违规抛错）；预告 P2 将从类型自动生成全量参考。

- [ ] **Step 7: `docs/zh/guide/security.md`** —— 摘录 `examples/hello/capabilities/main.json` 头部（identifier/description/windows/permissions 数组，含 `core:default`、`fs:write-default`、`http:default` 等真实权限串）；权限串格式 `plugin:permission` 说明；scope 三模型各一段 + 真实示例（PathScope `"$TMP/**"`、HttpScope `{ url: "https://api.github.com/*" }`、store scope `{ allow: ["$TMP/**"] }`，均摘自 hello main.ts）；CSP：`app.security.csp` 注入 + `devCsp` 分离；验证锚点 `ACL_DENY_OK`、`HTTP_SCOPE_DENY_OK`。

- [ ] **Step 8: `docs/zh/guide/tauri-migration.md`** —— 照抄 `DESIGN.md` §9 八行对照表（tauri-runtime-wry→runtime-ffi、tauri core→core、tauri-codegen 注入→inject、ipc/mod.rs→core/ipc、tauri-plugin→TS 插件、tauri-bundler→tjs compile+打包脚本、tauri-utils→schema+注入 CSP、@tauri-apps/api→api）；映射三小节：命令（Rust `#[tauri::command]` → `defineCommand`/`app.command`）、配置（tauri.conf.json 字段 → ztron.conf.json，大部分同名）、前端（`@tauri-apps/api` import 改 `@zturnlibs/ztron-api`，invoke/listen 签名不变）；差异注记：IPC 为 JSON（非 MessagePack，对齐 Tauri 桌面 Raw 响应语义）；`withGlobalTauri` 已支持。

- [ ] **Step 9: `docs/zh/reference/cli.md`** —— 7 命令各一节（语法/参数/示例）。命令集与事实（注意：源码 USAGE 字符串缺 codegen/signer，以 `packages/cli/src/index.ts` switch 分支为准共 7 个）：

```text
ztron init [dir]                  在 [dir] 脚手架新项目（默认当前目录）
ztron dev [--entry <file>]        构建 + 在原生 host + tjs backend 下运行
ztron build [--entry <file>]      产出独立可执行文件与 .app
ztron codegen                     扫描 defineCommand，生成 src/ztron-commands.ts 类型绑定
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                  回归运行：解析应用上报检查项，FULL_OK 且 0 FAIL 才 exit 0；
                                  --expect 逗号分隔强制要求的 tag
ztron signer <sub> [--pk-file f] [--sk-file f]
                                  minisign 兼容密钥生成/签名/验证（generate 等子命令；
                                  与 jedisct1/minisign 互验）
ztron version                     打印版本
```

每命令配一个可运行示例（init/dev/codegen/check 用 Task 3 的 hello 用法；signer 用 `ztron signer generate` 生成 minisign.pub/minisign.key）。

- [ ] **Step 10: 构建验证 + 提交**

```bash
pnpm --dir docs run build
git add docs/zh/guide docs/zh/reference
git commit -m "docs(zh): guide section (7 pages) + CLI reference"
```

预期：build exit 0。

---

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

### Task 10: 最终验证与 P1 验收移交

**Files:**
- Modify: 无（纯验证；发现问题回上游任务修复）

**Interfaces:**
- Consumes: Task 1–9 全部产物
- Produces: P1 验收清单（含需要用户手工完成的 3 步）

- [ ] **Step 1: 本地全链路**

```bash
pnpm --dir docs run test
pnpm --dir docs run check:locales
pnpm --dir docs run check:locales:deploy
pnpm --dir docs run build
pnpm test
```

预期：全部 exit 0；`pnpm --dir docs run build` 无 ERROR 级日志。

- [ ] **Step 2: 路由抽检（zh 默认无前缀、en 有前缀）**

```bash
ls docs/doc_build/index.html docs/doc_build/en/index.html
ls docs/doc_build/start/ docs/doc_build/en/start/ docs/doc_build/guide/ docs/doc_build/en/guide/ docs/doc_build/reference/ docs/doc_build/en/reference/
```

预期：zh/en 两侧各有 start/guide/reference 的页面 HTML（具体文件名以 Rspress 产物为准，目录存在且非空即可）。

- [ ] **Step 3: 内容事实复核（抽 3 项对照源码）**
  - quick-start 的命令逐字符比对 `README.md` Quick start
  - ipc 页代码比对 `examples/hello/src/commands.ts` / `frontend/src/main.ts`
  - config 页字段比对 `packages/core/src/app.ts` `ProjectConfigFile`

- [ ] **Step 4: 输出用户验收清单（最终汇报中给出，非文件）**
  1. GitHub 仓库 Settings → Pages → Source 选 **GitHub Actions**
  2. 配置 secrets `CHINA_MIRROR_TARGET` + `CHINA_MIRROR_SSH_KEY`（或暂不配，镜像步骤自动跳过）
  3. Actions 页手动 dispatch `docs-deploy`，确认 Pages 与镜像双目标生效
  4. 以新用户身份按 `zh/start/quick-start.md` 实际走一遍（clone → install → build-native → dev → check）——spec P1 验收①
  5. 验收通过后：取消 `docs-deploy.yml` 中 push 触发的注释，提交（启用自动发布）

---

## Self-Review 记录

- **规格覆盖**：P1 交付物（骨架/双语/品牌 ✓T1；开始 4 页 ✓T3；指南 7 页 + CLI 参考 ✓T4；en 镜像 ✓T5；CONTRIBUTING ✓T6；check-locales + CI job ✓T2/T8；部署 workflow 双目标 ✓T9；根接线 ✓T7；验收 ✓T10）。规格 §3.2 的根转发脚本 ✓T7；§5.1 占位门禁 ✓T2/T9；P2 内容（TypeDoc/插件页/命令面）明确排除 ✓。
- **占位符扫描**：T1 的临时首页为增量开发中间态（T3/T5 明确替换），非计划占位；其余步骤无 TBD/TODO。
- **类型一致性**：`diffTrees`/`findPlaceholders`/`walk` 签名在 T2 定义、T2 测试引用一致；`check:locales`/`check:locales:deploy` 脚本名在 T1 package.json、T7 根转发、T8/T9 workflow 三处一致；`doc_build` 路径在 T1/T9/T10 一致。
