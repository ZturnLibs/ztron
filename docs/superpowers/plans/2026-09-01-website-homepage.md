# Ztron 官方主页（GitHub Pages）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在仓库内构建 Astro 双语（en `/` + zh `/zh/`）单页落地页 `website/`，并经 GitHub Actions 自动部署到 `https://zturnlibs.github.io/ztron/`。

**Architecture:** `website/` 作为 pnpm workspace 新成员（`@zturnlibs/website`, private）。全部文案收敛到 `src/i18n/{en,zh}.ts` 两份 `satisfies SiteStrings` 字典，漏译在 `astro check`（并入 `build` 脚本）时构建失败。9 个分区组件由两个入口页组装，纯静态输出、零客户端框架。

**Tech Stack:** Astro 5（devDeps 仅 `astro` + `@astrojs/check` + `typescript` + `shiki`），系统字体栈，CSS 自定义属性设计令牌，Actions `deploy-pages@v4`。

**Spec:** `docs/superpowers/specs/2026-09-01-website-design.md`（内容口径、视觉令牌、验收标准以 spec 为准）

## Global Constraints

- 背景色令牌：页面 `#0A0C10` / 表面 `#11141B` / 浮起 `#161A23`；边框 `rgba(255,255,255,0.08)`
- 文本三级：`#E6EAF2` / `#9AA3B2` / `#6B7280`；强调渐变 `#8B5CF6 → #22D3EE`
- 语义色：绿 `#34D399`（ready）/ 琥珀 `#FBBF24`（wip）/ 红 `#F87171`；代码底 `#0D1017`
- 字体纯系统栈，**不加载任何外部字体/CDN 资源**；深色 only；尊重 `prefers-reduced-motion`
- Astro `base: '/ztron/'`，站内资源路径一律 base-aware（`import.meta.env.BASE_URL`），禁止手写绝对 `/...`
- 客户端 JS < 20KB；依赖面不超出 `astro`、`@astrojs/check`、`typescript`、`shiki`
- 内容口径只取仓库事实（README/ROADMAP/DESIGN），不新造宣传数据
- 每个任务独立可构建（`pnpm --filter @zturnlibs/website build` 退出 0）并单独提交
- 在 `feat/home-page` 分支上工作；**不要动 `/Users/zyj/Zturn/tauri`（只读参考）**
- 命令/包名/插件名等技术元素不翻译

---

### Task 1: Scaffold website workspace + 设计令牌 + BaseLayout

**Files:**
- Modify: `pnpm-workspace.yaml`
- Create: `website/package.json`, `website/astro.config.mjs`, `website/tsconfig.json`
- Create: `website/src/styles/tokens.css`, `website/src/styles/global.css`
- Create: `website/src/layouts/BaseLayout.astro`
- Create: `website/src/pages/index.astro`, `website/src/pages/zh/index.astro`

**Interfaces:**
- Produces: `BaseLayout` 组件（props: `locale: 'en'|'zh'`, `title: string`, `description: string`, `altPath: string`；渲染 `<html lang>` + head + 单 slot）；`tokens.css` 的全部 CSS 自定义属性（后续所有组件的样式基础）

- [ ] **Step 1.1: workspace 加入 website**

`pnpm-workspace.yaml` 全文替换为：

```yaml
packages:
  - "packages/*"
  - "examples/*"
  - "website"
```

- [ ] **Step 1.2: website/package.json**

```json
{
  "name": "@zturnlibs/website",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro check && astro build",
    "preview": "astro preview"
  },
  "devDependencies": {
    "astro": "^5.0.0",
    "@astrojs/check": "^0.9.4",
    "typescript": "^5.7.2",
    "shiki": "^3.0.0"
  }
}
```

- [ ] **Step 1.3: astro.config.mjs**

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://zturnlibs.github.io',
  base: '/ztron/',
  i18n: { defaultLocale: 'en', locales: ['en', 'zh'] },
});
```

- [ ] **Step 1.4: website/tsconfig.json**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "src/**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 1.5: tokens.css（spec 第 4 节令牌，逐字落实）**

```css
:root {
  --bg: #0a0c10;
  --surface: #11141b;
  --elevated: #161a23;
  --border: rgba(255, 255, 255, 0.08);
  --text-1: #e6eaf2;
  --text-2: #9aa3b2;
  --text-3: #6b7280;
  --accent-from: #8b5cf6;
  --accent-to: #22d3ee;
  --ok: #34d399;
  --wip: #fbbf24;
  --bad: #f87171;
  --code-bg: #0d1017;
  --grad: linear-gradient(120deg, var(--accent-from), var(--accent-to));
  --font-ui: system-ui, -apple-system, 'PingFang SC', 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, 'SF Mono', 'JetBrains Mono', Consolas, monospace;
  --radius: 10px;
  --max-w: 1120px;
}
```

- [ ] **Step 1.6: global.css（布局工具类 + 重置）**

```css
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
body {
  margin: 0;
  background: var(--bg);
  color: var(--text-1);
  font-family: var(--font-ui);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; text-decoration: none; }
code, pre { font-family: var(--font-mono); }

.container { max-width: var(--max-w); margin: 0 auto; padding: 0 24px; }
.section { padding: 88px 0; border-top: 1px solid var(--border); }
.section-title { font-size: 30px; margin: 0 0 8px; letter-spacing: -0.02em; }
.section-title em {
  font-style: normal;
  background: var(--grad);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.section-sub { color: var(--text-2); margin: 0 0 40px; max-width: 640px; }

.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 10px 20px; border-radius: 8px; font-weight: 600;
  border: 1px solid var(--border); color: var(--text-1);
  transition: border-color 0.15s, transform 0.15s;
}
.btn:hover { border-color: var(--accent-from); transform: translateY(-1px); }
.btn.primary { background: var(--grad); border: none; color: #0a0c10; }
.btn.primary:hover { opacity: 0.92; }
```

- [ ] **Step 1.7: BaseLayout.astro**

```astro
---
interface Props {
  locale: 'en' | 'zh';
  title: string;
  description: string;
  altPath: string; // 另一语言的路径，用于 hreflang 互指，如 '/zh/' 或 '/'
}
const { locale, title, description, altPath } = Astro.props;
const htmlLang = locale === 'zh' ? 'zh-CN' : 'en';
const site = Astro.site ?? new URL('https://zturnlibs.github.io');
const base = import.meta.env.BASE_URL;
const canonical = new URL(locale === 'en' ? '.' : './', new URL(base, site));
const alt = new URL(altPath, new URL(base, site));
---
<!doctype html>
<html lang={htmlLang}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonical} />
    <link rel="alternate" hreflang="en" href={new URL('.', new URL(base, site))} />
    <link rel="alternate" hreflang="zh" href={new URL('zh/', new URL(base, site))} />
    <link rel="alternate" hreflang="x-default" href={new URL('.', new URL(base, site))} />
    <link rel="icon" type="image/png" sizes="32x32" href={new URL('favicon-32.png', base)} />
    <link rel="apple-touch-icon" href={new URL('apple-touch-icon.png', base)} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:image" content={new URL('og-image.png', base)} />
  </head>
  <body>
    <slot />
  </body>
</html>
<style is:global>
  @import '../styles/tokens.css';
  @import '../styles/global.css';
</style>
```

- [ ] **Step 1.8: 两个占位入口页（Task 2 之前保证可构建）**

`website/src/pages/index.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout locale="en" title="Ztron" description="placeholder" altPath="/zh/">
  <main class="container"><p>Ztron — en placeholder</p></main>
</BaseLayout>
```

`website/src/pages/zh/index.astro`：

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
---
<BaseLayout locale="zh" title="Ztron" description="占位" altPath="/">
  <main class="container"><p>Ztron — zh 占位</p></main>
</BaseLayout>
```

- [ ] **Step 1.9: 安装并构建验证**

Run: `pnpm install && pnpm --filter @zturnlibs/website build`
Expected: 安装成功更新 `pnpm-lock.yaml`；`astro check` 0 error；`astro build` 输出 `dist/index.html` 与 `dist/zh/index.html`，退出码 0。

- [ ] **Step 1.10: Commit**

```bash
git add pnpm-workspace.yaml pnpm-lock.yaml website/
git commit -m "feat(website): scaffold astro workspace member + tokens + base layout"
```

---

### Task 2: i18n 字典系统（SiteStrings + en/zh 全量文案）

**Files:**
- Create: `website/src/i18n/types.ts`, `website/src/i18n/en.ts`, `website/src/i18n/zh.ts`, `website/src/i18n/index.ts`, `website/src/i18n/shared.ts`

**Interfaces:**
- Produces: `getStrings(locale: 'en'|'zh'): SiteStrings`（index.ts）；`SiteStrings` 完整接口（下方逐字段）；`shared.ts` 导出 `ANCHORS = { features:'#features', architecture:'#architecture', plugins:'#plugins', status:'#status', quickstart:'#quickstart' } as const` 与 `REPO = 'https://github.com/ZturnLibs/ztron'`、`REPO_DOC = (f: string) => \`${REPO}/blob/main/${f}\``
- 后续所有组件的 props 都以 `s: SiteStrings`（或其子对象）+ `locale` 传入

- [ ] **Step 2.1: types.ts**

```ts
export interface Feature {
  icon: 'runtime' | 'ts' | 'plugins' | 'acl' | 'native' | 'tests';
  title: string;
  body: string;
}
export interface PluginGroup { label: string; plugins: string[] }
export interface StatusRow { platform: 'macOS' | 'Windows' | 'Linux'; status: 'ready' | 'wip'; note: string }
export interface CodeTab { id: string; label: string; code: string }
export interface PackageCard { name: string; role: string }
export interface TerminalLine { prompt?: string; text: string; kind?: 'cmd' | 'ok' }

export interface SiteStrings {
  meta: { title: string; description: string };
  nav: { features: string; architecture: string; plugins: string; status: string; quickstart: string; langLabel: string };
  hero: { eyebrow: string; title: string; titleAccent: string; body: string; ctaPrimary: string; ctaSecondary: string };
  terminal: { title: string; lines: TerminalLine[] };
  features: { heading: string; headingAccent: string; sub: string; items: Feature[] };
  arch: { heading: string; sub: string; hostTitle: string; hostBody: string; backendTitle: string; backendBody: string; wireLabel: string; frontendLabel: string; packagingLabel: string };
  plugins: { heading: string; headingAccent: string; sub: string; groups: PluginGroup[] };
  statusm: { heading: string; sub: string; rows: StatusRow[]; checks: string; more: string; moreLabel: string };
  quickstart: { heading: string; headingAccent: string; sub: string; tabs: CodeTab[] };
  packages: { heading: string; sub: string; items: PackageCard[] };
  footer: { license: string; links: { label: string; href: string }[] };
}
```

- [ ] **Step 2.2: en.ts（完整英文文案）**

```ts
import type { SiteStrings } from './types';

export const en = {
  meta: {
    title: 'Ztron — A Tauri-style desktop framework in TypeScript',
    description:
      'Cross-platform desktop apps on a ~2 MB txiki.js runtime + system WebView. Native windows, tray, menus, 25 plugins and an ACL — all in TypeScript.',
  },
  nav: { features: 'Features', architecture: 'Architecture', plugins: 'Plugins', status: 'Status', quickstart: 'Quick Start', langLabel: '中文' },
  hero: {
    eyebrow: 'Tauri-style · Pure TypeScript · ~2 MB runtime',
    title: 'The desktop framework,',
    titleAccent: 'rewritten in TypeScript',
    body: 'Ztron pairs the tiny txiki.js runtime with the system WebView: native windows, tray, menus, dialogs and 25 official plugins — behind a Tauri-compatible API you already know.',
    ctaPrimary: 'Get started',
    ctaSecondary: 'GitHub ↗',
  },
  terminal: {
    title: 'ztron — dev',
    lines: [
      { prompt: '$', text: 'ztron init my-app', kind: 'cmd' },
      { text: '✓ scaffolded src/main.ts + frontend/', kind: 'ok' },
      { prompt: '$', text: 'cd my-app && ztron dev', kind: 'cmd' },
      { text: '✓ vite dev server + host + backend', kind: 'ok' },
      { text: '✓ window opened — hello from Ztron', kind: 'ok' },
    ],
  },
  features: {
    heading: 'Everything a desktop app ',
    headingAccent: 'needs',
    sub: 'Built for the web-skilled — the whole stack, from native host bindings to the frontend API, is TypeScript.',
    items: [
      { icon: 'runtime', title: 'Featherweight runtime', body: 'txiki.js (~2 MB) replaces Node and Electron bundles. Your app ships small and starts fast.' },
      { icon: 'ts', title: 'Full-stack TypeScript', body: 'Core, plugin layer, CLI and frontend API are all TypeScript — typed commands via `ztron codegen`.' },
      { icon: 'plugins', title: '25 official plugins', body: 'store, http, sql, shell, updater, notification, clipboard and more — Tauri-parity APIs.' },
      { icon: 'acl', title: 'Least-privilege ACL', body: 'Capabilities gate every IPC call; PathScope, HttpScope and CSP are enforced by default.' },
      { icon: 'native', title: 'Native integration', body: 'Tray, menu bar, dialogs, notifications, global shortcuts, drag & drop and multi-window — via the native host.' },
      { icon: 'tests', title: 'Three-layer testing', body: 'Surface, unit and integration suites plus a MockRuntime — 86 deterministic checks stay green.' },
    ],
  },
  arch: {
    heading: 'Two processes, one TypeScript stack',
    sub: 'A tiny native host owns the GUI; everything else lives in an async txiki.js backend.',
    hostTitle: 'ztron-host',
    hostBody: 'native C · system WebView · window / tray / menu / dialog',
    backendTitle: 'tjs backend',
    backendBody: 'txiki.js · @ztronlibs/core · IPC · plugins · ACL · updater',
    wireLabel: 'TCP · JSON',
    frontendLabel: 'Vite frontend → @zturnlibs/api (invoke · listen · Channel)',
    packagingLabel: 'tjs compile → ztron build → signed .app / .dmg',
  },
  plugins: {
    heading: '25 plugins, ',
    headingAccent: 'ready to use',
    sub: 'Each plugin ships as core commands + typed API + ACL permissions.',
    groups: [
      { label: 'Data & files', plugins: ['store', 'sql', 'fs', 'upload'] },
      { label: 'System', plugins: ['os', 'shell', 'log', 'autostart', 'clipboard'] },
      { label: 'Network', plugins: ['http', 'websocket', 'network', 'local-ip', 'deep-link'] },
      { label: 'Desktop', plugins: ['tray', 'menu', 'dialog', 'notification', 'global-shortcut', 'single-instance', 'positioner', 'window-state'] },
      { label: 'Lifecycle', plugins: ['updater', 'persisted-scope', 'app'] },
    ],
  },
  statusm: {
    heading: 'Where it runs today',
    sub: 'macOS is fully verified; Windows and Linux hosts are scaffolded and next.',
    rows: [
      { platform: 'macOS', status: 'ready', note: 'dev pipeline · .app + .dmg · ad-hoc signing · updater' },
      { platform: 'Windows', status: 'wip', note: 'host skeleton (WebView2) — compile & packaging pending' },
      { platform: 'Linux', status: 'wip', note: 'host skeleton (GTK + WebKitGTK) — compile & packaging pending' },
    ],
    checks: '86 deterministic end-to-end checks pass on every run — `ztron check` gates CI.',
    more: 'See the full capability matrix in ROADMAP.md',
    moreLabel: 'ROADMAP.md ↗',
  },
  quickstart: {
    heading: 'Quick ',
    headingAccent: 'start',
    sub: 'Two commands to a native window.',
    tabs: [
      {
        id: 'monorepo',
        label: 'Inside the monorepo',
        code: 'pnpm install\nscripts/build-native.sh                 # tjs + ztron-host + webview lib (macOS)\npnpm --filter @ztron/example-hello dev  # vite build + host + backend',
      },
      {
        id: 'scaffold',
        label: 'Scaffold a project',
        code: 'ztron init my-app        # src/main.ts + frontend/\ncd my-app\nztron dev --entry src/main.ts\nztron codegen            # typed invoke bindings',
      },
    ],
  },
  packages: {
    heading: 'One workspace, five packages',
    sub: 'Published to GitHub Packages as @zturnlibs/*.',
    items: [
      { name: '@zturnlibs/api', role: 'Frontend API translated from @tauri-apps/api — invoke/events/Channel + plugin wrappers' },
      { name: '@zturnlibs/core', role: 'Main-process core: IPC, events, commands, ACL, PathScope, 25 plugins, MockRuntime' },
      { name: '@zturnlibs/runtime-ffi', role: 'HostRuntime socket adapter (Plan A) + FFI reference bindings' },
      { name: '@zturnlibs/inject', role: 'window.__TAURI_INTERNALS__ bootstrap injected into page HTML' },
      { name: '@zturnlibs/cli', role: 'ztron dev / build / codegen / init — Vite build + host + backend' },
    ],
  },
  footer: {
    license: 'MIT © 2026 ZtronLibs',
    links: [
      { label: 'GitHub ↗', href: 'https://github.com/ZturnLibs/ztron' },
      { label: 'DESIGN.md ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/DESIGN.md' },
      { label: 'ROADMAP.md ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md' },
      { label: 'LICENSE ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/LICENSE' },
    ],
  },
} satisfies SiteStrings;
```

- [ ] **Step 2.3: zh.ts 先故意缺一个 key（红灯）**

写入与 en 结构相同的完整中文文案，但**暂时删掉 `hero.titleAccent` 这一项**：

```ts
import type { SiteStrings } from './types';

export const zh = {
  meta: {
    title: 'Ztron — 用 TypeScript 重写的 Tauri 式桌面框架',
    description:
      '基于 ~2MB 的 txiki.js 运行时 + 系统 WebView 构建跨平台桌面应用：原生窗口、托盘、菜单、25 个插件与 ACL 权限，全栈 TypeScript。',
  },
  nav: { features: '特性', architecture: '架构', plugins: '插件', status: '状态', quickstart: '快速上手', langLabel: 'EN' },
  hero: {
    eyebrow: 'Tauri 式架构 · 纯 TypeScript · ~2MB 运行时',
    title: '为 TypeScript 而生的',
    // titleAccent 故意缺失，验证类型拦截
    body: 'Ztron 用极小的 txiki.js 运行时搭配系统 WebView：原生窗口、托盘、菜单、对话框与 25 个官方插件——都藏在你早已熟悉的 Tauri 兼容 API 背后。',
    ctaPrimary: '快速上手',
    ctaSecondary: 'GitHub ↗',
  },
  terminal: {
    title: 'ztron — dev',
    lines: [
      { prompt: '$', text: 'ztron init my-app', kind: 'cmd' },
      { text: '✓ 已生成 src/main.ts + frontend/', kind: 'ok' },
      { prompt: '$', text: 'cd my-app && ztron dev', kind: 'cmd' },
      { text: '✓ vite dev server + host + backend', kind: 'ok' },
      { text: '✓ 窗口已打开 — hello from Ztron', kind: 'ok' },
    ],
  },
  features: {
    heading: '桌面应用所需，',
    headingAccent: '一应俱全',
    sub: '为 Web 开发者而生——从原生 host 绑定到前端 API，整条技术栈都是 TypeScript。',
    items: [
      { icon: 'runtime', title: '轻量运行时', body: 'txiki.js（约 2MB）取代 Node 与 Electron 捆绑：应用体积小、启动快。' },
      { icon: 'ts', title: '全栈 TypeScript', body: '核心、插件层、CLI 与前端 API 全部是 TypeScript，`ztron codegen` 生成类型化命令。' },
      { icon: 'plugins', title: '25 个官方插件', body: 'store、http、sql、shell、updater、notification、clipboard……与 Tauri 对齐的 API。' },
      { icon: 'acl', title: '最小权限 ACL', body: 'Capabilities 为每次 IPC 把关；PathScope、HttpScope 与 CSP 默认强制。' },
      { icon: 'native', title: '原生系统集成', body: '托盘、菜单栏、对话框、通知、全局快捷键、文件拖放与多窗口——经由原生 host。' },
      { icon: 'tests', title: '三层测试', body: 'surface + unit + integration 与 MockRuntime：86 项确定性检查保持全绿。' },
    ],
  },
  arch: {
    heading: '两个进程，一套 TypeScript 技术栈',
    sub: '极小的原生 host 负责 GUI，其余一切运行在异步 txiki.js 后端。',
    hostTitle: 'ztron-host',
    hostBody: '原生 C · 系统 WebView · 窗口 / 托盘 / 菜单 / 对话框',
    backendTitle: 'tjs backend',
    backendBody: 'txiki.js · @zturnlibs/core · IPC · 插件 · ACL · 更新器',
    wireLabel: 'TCP · JSON',
    frontendLabel: 'Vite 前端 → @zturnlibs/api（invoke · listen · Channel）',
    packagingLabel: 'tjs compile → ztron build → 签名 .app / .dmg',
  },
  plugins: {
    heading: '25 个插件，',
    headingAccent: '开箱即用',
    sub: '每个插件 = core 命令 + 类型化 API + ACL 权限。',
    groups: [
      { label: '数据与文件', plugins: ['store', 'sql', 'fs', 'upload'] },
      { label: '系统', plugins: ['os', 'shell', 'log', 'autostart', 'clipboard'] },
      { label: '网络', plugins: ['http', 'websocket', 'network', 'local-ip', 'deep-link'] },
      { label: '桌面', plugins: ['tray', 'menu', 'dialog', 'notification', 'global-shortcut', 'single-instance', 'positioner', 'window-state'] },
      { label: '生命周期', plugins: ['updater', 'persisted-scope', 'app'] },
    ],
  },
  statusm: {
    heading: '当前支持的平台',
    sub: 'macOS 已完整验证；Windows 与 Linux host 已就位骨架，是下一步。',
    rows: [
      { platform: 'macOS', status: 'ready', note: 'dev 管线 · .app + .dmg · ad-hoc 签名 · 更新器' },
      { platform: 'Windows', status: 'wip', note: 'host 骨架（WebView2）——编译与打包待完成' },
      { platform: 'Linux', status: 'wip', note: 'host 骨架（GTK + WebKitGTK）——编译与打包待完成' },
    ],
    checks: '每次运行通过 86 项端到端确定性检查——`ztron check` 是 CI 的门禁。',
    more: '完整能力矩阵见 ROADMAP.md',
    moreLabel: 'ROADMAP.md ↗',
  },
  quickstart: {
    heading: '快速',
    headingAccent: '上手',
    sub: '两条命令，一个原生窗口。',
    tabs: [
      {
        id: 'monorepo',
        label: '在 monorepo 内开发',
        code: 'pnpm install\nscripts/build-native.sh                 # 构建 tjs + ztron-host + webview 库（macOS）\npnpm --filter @ztron/example-hello dev  # vite 构建 + host + backend',
      },
      {
        id: 'scaffold',
        label: '脚手架新项目',
        code: 'ztron init my-app        # 生成 src/main.ts + frontend/\ncd my-app\nztron dev --entry src/main.ts\nztron codegen            # 类型化 invoke 绑定',
      },
    ],
  },
  packages: {
    heading: '一个工作区，五个包',
    sub: '以 @zturnlibs/* 发布到 GitHub Packages。',
    items: [
      { name: '@zturnlibs/api', role: '由 @tauri-apps/api 翻译而来的前端 API——invoke/events/Channel + 插件封装' },
      { name: '@zturnlibs/core', role: '主进程核心：IPC、事件、命令、ACL、PathScope、25 插件、MockRuntime' },
      { name: '@zturnlibs/runtime-ffi', role: 'HostRuntime socket 适配器（Plan A）+ FFI 参考绑定' },
      { name: '@zturnlibs/inject', role: '注入页面 HTML 的 window.__TAURI_INTERNALS__ 引导' },
      { name: '@zturnlibs/cli', role: 'ztron dev / build / codegen / init——Vite 构建 + host + 后端' },
    ],
  },
  footer: {
    license: 'MIT © 2026 ZtronLibs',
    links: [
      { label: 'GitHub ↗', href: 'https://github.com/ZturnLibs/ztron' },
      { label: 'DESIGN.md ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/DESIGN.md' },
      { label: 'ROADMAP.md ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md' },
      { label: 'LICENSE ↗', href: 'https://github.com/ZturnLibs/ztron/blob/main/LICENSE' },
    ],
  },
} satisfies SiteStrings;
```

- [ ] **Step 2.4: index.ts + shared.ts**

`website/src/i18n/index.ts`：

```ts
import type { SiteStrings } from './types';
import { en } from './en';
import { zh } from './zh';

export function getStrings(locale: 'en' | 'zh'): SiteStrings {
  return locale === 'zh' ? zh : en;
}
```

`website/src/i18n/shared.ts`：

```ts
export const ANCHORS = {
  features: '#features',
  architecture: '#architecture',
  plugins: '#plugins',
  status: '#status',
  quickstart: '#quickstart',
} as const;

export const REPO = 'https://github.com/ZturnLibs/ztron';
export const repoDoc = (file: string) => `${REPO}/blob/main/${file}`;
```

- [ ] **Step 2.5: 红灯验证（类型拦截缺 key）**

Run: `pnpm --filter @ztronlibs/website build`
Expected: **FAIL** —— `astro check` 报错，形如 `Property 'titleAccent' is missing in type ... but required in type SiteStrings`。

- [ ] **Step 2.6: 补上缺失 key（绿灯）**

在 `zh.ts` 的 `hero` 中加入（`title` 之后）：

```ts
    titleAccent: '桌面应用框架',
```

Run: `pnpm --filter @ztronlibs/website build`
Expected: PASS，退出码 0。

- [ ] **Step 2.7: Commit**

```bash
git add website/src/i18n/
git commit -m "feat(website): typed bilingual copy dictionaries (SiteStrings, en/zh)"
```

---

### Task 3: Nav + LangSwitcher + Footer + 页面骨架

**Files:**
- Create: `website/src/components/Nav.astro`, `website/src/components/LangSwitcher.astro`, `website/src/components/Footer.astro`, `website/src/components/Logo.astro`
- Modify: `website/src/pages/index.astro`, `website/src/pages/zh/index.astro`（替换占位为骨架，接入真实 meta）

**Interfaces:**
- Consumes: `getStrings`、`ANCHORS`（Task 2）
- Produces: `Nav`（props `s: SiteStrings`, `locale: 'en'|'zh'`）、`Footer`（props `s: SiteStrings`）、`Logo`（无 props）——两个入口页按 `Nav → <main>…9 分区…</main> → Footer` 组装；后续 Task 4-9 的分区组件都插进这两个页面的 `<main>` 中对应锚点位置

- [ ] **Step 3.1: Logo.astro**

```astro
<span class="logo" aria-hidden="true">
  <svg width="26" height="26" viewBox="0 0 26 26">
    <defs>
      <linearGradient id="zg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b5cf6" /><stop offset="1" stop-color="#22d3ee" />
      </linearGradient>
    </defs>
    <rect x="1" y="1" width="24" height="24" rx="6" fill="none" stroke="url(#zg)" stroke-width="2" />
    <path d="M8 8h10L8 18h10" fill="none" stroke="url(#zg)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" />
  </svg>
  <b>Ztron</b>
</span>
<style>
  .logo { display: inline-flex; align-items: center; gap: 9px; }
  .logo b { font-size: 18px; letter-spacing: -0.02em; }
</style>
```

- [ ] **Step 3.2: LangSwitcher.astro**

```astro
---
interface Props { locale: 'en' | 'zh'; label: string }
const { locale, label } = Astro.props;
const base = import.meta.env.BASE_URL;
const href = locale === 'en' ? new URL('zh/', base).pathname : base;
const target = locale === 'en' ? 'zh' : 'en';
---
<a class="lang" href={href} data-lang-switch={target}>{label}</a>
<style>
  .lang {
    font-size: 13px; padding: 6px 12px; border-radius: 999px;
    border: 1px solid var(--border); color: var(--text-2);
  }
  .lang:hover { color: var(--text-1); border-color: var(--accent-from); }
</style>
<script>
  document.querySelectorAll<HTMLAnchorElement>('[data-lang-switch]').forEach((a) =>
    a.addEventListener('click', () => localStorage.setItem('ztron-lang', a.dataset.langSwitch ?? ''))
  );
</script>
```

- [ ] **Step 3.3: Nav.astro（含移动端汉堡）**

```astro
---
import Logo from './Logo.astro';
import LangSwitcher from './LangSwitcher.astro';
import { ANCHORS, REPO } from '../i18n/shared';
interface Props { s: import('../i18n/types').SiteStrings; locale: 'en' | 'zh' }
const { s, locale } = Astro.props;
const links = [
  [ANCHORS.features, s.nav.features],
  [ANCHORS.architecture, s.nav.architecture],
  [ANCHORS.plugins, s.nav.plugins],
  [ANCHORS.status, s.nav.status],
  [ANCHORS.quickstart, s.nav.quickstart],
] as const;
---
<header class="nav">
  <div class="container inner">
    <a href={import.meta.env.BASE_URL} aria-label="Ztron"><Logo /></a>
    <nav class="links" data-nav-links>
      {links.map(([href, label]) => <a href={href}>{label}</a>)}
      <a class="gh" href={REPO} target="_blank" rel="noopener">GitHub ↗</a>
    </nav>
    <LangSwitcher locale={locale} label={s.nav.langLabel} />
    <button class="burger" aria-label="menu" aria-expanded="false" data-burger>
      <svg width="20" height="14" viewBox="0 0 20 14"><path d="M1 1h18M1 7h18M1 13h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>
  </div>
</header>
<style>
  .nav {
    position: sticky; top: 0; z-index: 10;
    background: rgba(10, 12, 16, 0.85); backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--border);
  }
  .inner { display: flex; align-items: center; gap: 20px; height: 60px; }
  .links { display: flex; gap: 22px; margin-left: auto; font-size: 14px; color: var(--text-2); }
  .links a:hover { color: var(--text-1); }
  .gh { color: var(--text-1); }
  .burger { display: none; background: none; border: 1px solid var(--border); border-radius: 8px; color: var(--text-1); padding: 6px 9px; }
  @media (max-width: 768px) {
    .links {
      display: none; position: absolute; top: 60px; left: 0; right: 0;
      flex-direction: column; padding: 16px 24px 20px; gap: 14px;
      background: var(--surface); border-bottom: 1px solid var(--border);
    }
    .links.open { display: flex; }
    .burger { display: block; margin-left: auto; }
    .inner > :global(.lang) { order: 3; }
  }
</style>
<script>
  const burger = document.querySelector('[data-burger]');
  const links = document.querySelector('[data-nav-links]');
  burger?.addEventListener('click', () => {
    const open = links?.classList.toggle('open');
    burger.setAttribute('aria-expanded', String(Boolean(open)));
  });
</script>
```

- [ ] **Step 3.4: Footer.astro**

```astro
---
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
---
<footer class="section footer">
  <div class="container row">
    <span>{s.footer.license}</span>
    <nav class="links">
      {s.footer.links.map((l) => <a href={l.href} target="_blank" rel="noopener">{l.label}</a>)}
    </nav>
  </div>
</footer>
<style>
  .footer { padding: 36px 0; }
  .row { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; justify-content: space-between; color: var(--text-3); font-size: 14px; }
  .links { display: flex; gap: 20px; }
  .links a:hover { color: var(--text-1); }
</style>
```

- [ ] **Step 3.5: 两个入口页替换为真实骨架**

`website/src/pages/index.astro`：

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';
import { getStrings } from '../i18n';
const s = getStrings('en');
---
<BaseLayout locale="en" title={s.meta.title} description={s.meta.description} altPath="/zh/">
  <Nav s={s} locale="en" />
  <main>
    {/* Task 4-9 的分区组件依序插入此处的对应锚点位置 */}
    <p class="container" style="padding:80px 24px;color:var(--text-3)">sections incoming</p>
  </main>
  <Footer s={s} />
</BaseLayout>
```

`website/src/pages/zh/index.astro` 同构，`locale="zh"`、`altPath="/"`、`getStrings('zh')`，import 路径均以 `../` 开头（与 en 页相同——两个文件都在 `src/pages` 的下一层）。

- [ ] **Step 3.6: 构建验证**

Run: `pnpm --filter @zturnlibs/website build`
Expected: PASS 退出 0。

Run: `pnpm --filter @zturnlibs/website dev`，浏览器打开 `http://localhost:4321/ztron/`
Expected: 顶部导航（Logo/锚点/GitHub/中文按钮）与页脚渲染正常；点「中文」跳到 `/ztron/zh/` 显示中文导航；窗口缩到 <768px 出现汉堡按钮且可展开。

- [ ] **Step 3.7: Commit**

```bash
git add website/src/components/ website/src/pages/
git commit -m "feat(website): nav + lang switcher + footer, real page shells"
```

---

### Task 4: Hero + Terminal

**Files:**
- Create: `website/src/components/Hero.astro`, `website/src/components/Terminal.astro`
- Modify: `website/src/pages/index.astro`, `website/src/pages/zh/index.astro`（`<main>` 顶部插入 `<Hero s={s} />`，`id="top"` 区域）

**Interfaces:**
- Consumes: `s.hero`、`s.terminal`（SiteStrings 子对象）
- Produces: `Hero`（props `s: SiteStrings`），内部渲染 `Terminal`；CTA 主按钮指向 `ANCHORS.quickstart`，次按钮指向 `REPO`

- [ ] **Step 4.1: Terminal.astro**

```astro
---
interface Props { title: string; lines: import('../i18n/types').TerminalLine[] }
const { title, lines } = Astro.props;
---
<div class="term">
  <div class="bar"><i></i><i></i><i></i><span>{title}</span></div>
  <pre>{lines.map((l) => <span class={l.kind ?? ''}>{l.prompt && <b>{l.prompt} </b>}{l.text}{'\n'}</span>)}</pre>
</div>
<style>
  .term { background: var(--code-bg); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  .bar { display: flex; align-items: center; gap: 7px; padding: 11px 14px; border-bottom: 1px solid var(--border); }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #2a2f3a; }
  .bar i:first-of-type { background: #ff5f57; } .bar i:nth-of-type(2) { background: #febc2e; } .bar i:nth-of-type(3) { background: #28c840; }
  .bar span { margin-left: 8px; color: var(--text-3); font-size: 12px; font-family: var(--font-mono); }
  pre { margin: 0; padding: 18px 20px; font-size: 13.5px; line-height: 1.9; color: var(--text-2); overflow-x: auto; }
  pre b { color: var(--accent-to); font-weight: 600; }
  pre .ok { color: var(--ok); }
  pre .cmd { color: var(--text-1); }
</style>
```

- [ ] **Step 4.2: Hero.astro**

```astro
---
import Terminal from './Terminal.astro';
import { ANCHORS, REPO } from '../i18n/shared';
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
---
<section class="hero">
  <div class="grid-bg" aria-hidden="true"></div>
  <div class="container cols">
    <div>
      <p class="eyebrow">{s.hero.eyebrow}</p>
      <h1>{s.hero.title}<br /><em>{s.hero.titleAccent}</em></h1>
      <p class="body">{s.hero.body}</p>
      <div class="ctas">
        <a class="btn primary" href={ANCHORS.quickstart}>{s.hero.ctaPrimary}</a>
        <a class="btn" href={REPO} target="_blank" rel="noopener">{s.hero.ctaSecondary}</a>
      </div>
    </div>
    <Terminal title={s.terminal.title} lines={s.terminal.lines} />
  </div>
</section>
<style>
  .hero { position: relative; padding: 96px 0 104px; overflow: hidden; }
  .grid-bg {
    position: absolute; inset: 0; pointer-events: none;
    background:
      radial-gradient(560px 300px at 70% -10%, rgba(139, 92, 246, 0.16), transparent 70%),
      radial-gradient(560px 300px at 90% 10%, rgba(34, 211, 238, 0.10), transparent 70%),
      linear-gradient(var(--border) 1px, transparent 1px),
      linear-gradient(90deg, var(--border) 1px, transparent 1px);
    background-size: auto, auto, 44px 44px, 44px 44px;
    mask-image: linear-gradient(#000 55%, transparent);
  }
  .cols { position: relative; display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; }
  .eyebrow { font-family: var(--font-mono); font-size: 13px; color: var(--accent-to); margin: 0 0 18px; }
  h1 { font-size: 46px; line-height: 1.12; letter-spacing: -0.03em; margin: 0 0 20px; }
  h1 em {
    font-style: normal;
    background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .body { color: var(--text-2); font-size: 17px; max-width: 520px; margin: 0 0 30px; }
  .ctas { display: flex; gap: 14px; flex-wrap: wrap; }
  @media (max-width: 900px) { .cols { grid-template-columns: 1fr; gap: 40px; } h1 { font-size: 36px; } }
</style>
```

- [ ] **Step 4.3: 页面接入 + 构建验证**

两个入口页 `<main>` 内占位 `<p>` 之前插入：

```astro
<Hero s={s} />
```

（zh 页 import 路径同样为 `../components/Hero.astro`）

Run: `pnpm --filter @zturnlibs/website build`
Expected: PASS 退出 0；`astro dev` 下两语言 Hero + 终端渲染正常，CTA 跳转正确。

- [ ] **Step 4.4: Commit**

```bash
git add website/src/components/ website/src/pages/
git commit -m "feat(website): hero + terminal showcase"
```

---

### Task 5: FeatureGrid（6 卡）

**Files:**
- Create: `website/src/components/FeatureGrid.astro`
- Modify: 两个入口页，Hero 之后插入 `<FeatureGrid s={s} />`

**Interfaces:**
- Consumes: `s.features`（含 `items: Feature[6]`，`icon` 为 6 个字面量键）
- Produces: `<section id="features">`（锚点与 `ANCHORS.features` 对齐）

- [ ] **Step 5.1: 组件**

```astro
---
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
const paths: Record<string, string> = {
  runtime: 'M4 11h8M4 11a7 7 0 0 1 14-2M20 13h-8m8 0a7 7 0 0 1-14 2M6 3l2 2M18 21l-2-2',
  ts: 'M3 3h18v18H3zM9 9l6 6M15 9l-6 6',
  plugins: 'M4 7h7l2 3h7v8H4zM4 7V5h5l2 2',
  acl: 'M12 3l8 3v6c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6zM9 12l2 2 4-4',
  native: 'M3 5h18v12H3zM8 21h8M12 17v4M7 9h6M7 12h4',
  tests: 'M5 12l4 4L19 6M5 5v14h14',
};
---
<section class="section" id="features">
  <div class="container">
    <h2 class="section-title">{s.features.heading}<em>{s.features.headingAccent}</em></h2>
    <p class="section-sub">{s.features.sub}</p>
    <div class="grid">
      {s.features.items.map((f) => (
        <article class="card">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="url(#fg)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
            <defs><linearGradient id="fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6" /><stop offset="1" stop-color="#22d3ee" /></linearGradient></defs>
            <path d={paths[f.icon]} />
          </svg>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </article>
      ))}
    </div>
  </div>
</section>
<style>
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .card {
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 24px; transition: border-color 0.15s, transform 0.15s;
  }
  .card:hover { border-color: var(--accent-from); transform: translateY(-2px); }
  .card h3 { font-size: 16.5px; margin: 14px 0 8px; }
  .card p { color: var(--text-2); font-size: 14.5px; margin: 0; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 5.2: 构建验证**

Run: `pnpm --filter @ztronlibs/website build`
Expected: PASS；dev 页面 `#features` 锚点从导航可跳达，6 卡双语言渲染。

- [ ] **Step 5.3: Commit**

```bash
git add website/src/components/ website/src/pages/
git commit -m "feat(website): feature grid (6 cards)"
```

---

### Task 6: ArchitectureDiagram

**Files:**
- Create: `website/src/components/Architecture.astro`
- Modify: 两个入口页，FeatureGrid 后插入 `<Architecture s={s} />`

**Interfaces:**
- Consumes: `s.arch`
- Produces: `<section id="architecture">`

- [ ] **Step 6.1: 组件（README ASCII 图的 CSS 重绘）**

```astro
---
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
---
<section class="section" id="architecture">
  <div class="container">
    <h2 class="section-title">{s.arch.heading}</h2>
    <p class="section-sub">{s.arch.sub}</p>
    <div class="diagram">
      <div class="box">
        <h3>{s.arch.hostTitle}</h3>
        <p>{s.arch.hostBody}</p>
      </div>
      <div class="wire"><span>{s.arch.wireLabel}</span></div>
      <div class="box">
        <h3>{s.arch.backendTitle}</h3>
        <p>{s.arch.backendBody}</p>
      </div>
      <div class="note">{s.arch.frontendLabel}</div>
      <div class="wire vert" aria-hidden="true"></div>
      <div class="note">{s.arch.packagingLabel}</div>
    </div>
  </div>
</section>
<style>
  .diagram {
    display: grid; grid-template-columns: 1fr 150px 1fr;
    gap: 0; align-items: stretch;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
    padding: 36px 28px; grid-template-areas: 'host wire backend' 'fe v1 pkg';
  }
  .box { grid-area: host; border: 1px solid var(--accent-from); border-radius: var(--radius); padding: 22px; background: var(--elevated); }
  .box:last-of-type { grid-area: backend; border-color: var(--accent-to); }
  .box h3 { font-family: var(--font-mono); font-size: 16px; margin: 0 0 8px; }
  .box p { color: var(--text-2); font-size: 14px; margin: 0; }
  .wire {
    grid-area: wire; align-self: center; justify-self: center; width: 100%;
    height: 2px; background: var(--grad); position: relative;
  }
  .wire::before, .wire::after {
    content: ''; position: absolute; top: -4px; border: 5px solid transparent;
  }
  .wire::before { left: -2px; border-right-color: var(--accent-from); }
  .wire::after { right: -2px; border-left-color: var(--accent-to); }
  .wire span {
    position: absolute; top: -30px; left: 50%; transform: translateX(-50%);
    font-family: var(--font-mono); font-size: 11.5px; color: var(--text-3); white-space: nowrap;
  }
  .note {
    grid-area: fe; margin-top: 22px; padding: 12px 16px; border: 1px dashed var(--border);
    border-radius: 8px; font-family: var(--font-mono); font-size: 12.5px; color: var(--text-2);
    text-align: center;
  }
  .note + .wire + .note { grid-area: pkg; }
  .wire.vert { grid-area: v1; visibility: hidden; }
  @media (max-width: 760px) {
    .diagram { grid-template-columns: 1fr; grid-template-areas: 'host' 'wire' 'backend' 'fe' 'pkg'; }
    .wire { width: 2px; height: 44px; margin: 12px auto; }
    .wire span { top: 12px; left: 12px; transform: none; }
  }
</style>
```

- [ ] **Step 6.2: 构建验证**

Run: `pnpm --filter @ztronlibs/website build`
Expected: PASS；dev 下桌面档两框 + 渐变连线 + 两条底部注记，<760px 纵向堆叠。

- [ ] **Step 6.3: Commit**

```bash
git add website/src/components/ website/src/pages/
git commit -m "feat(website): architecture diagram (host <-> backend)"
```

---

### Task 7: PluginWall

**Files:**
- Create: `website/src/components/PluginWall.astro`
- Modify: 两个入口页，Architecture 后插入 `<PluginWall s={s} />`

**Interfaces:**
- Consumes: `s.plugins.groups`（5 组共 25 个插件名）
- Produces: `<section id="plugins">`

- [ ] **Step 7.1: 核对插件清单与注册表一致**

Run: `grep -o "'[a-z-]*Plugin'" packages/core/src/plugins/index.ts | sort -u | head -40 && grep -c "Plugin" packages/core/src/plugins/index.ts`
Expected: 注册表导出覆盖字典 `plugins.groups` 中全部 25 个名字（fs/http/store/... 见 Task 2 字典）。若发现字典与注册表冲突，以注册表 + README P3 行为准修正字典后继续。

- [ ] **Step 7.2: 组件**

```astro
---
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
const total = s.plugins.groups.reduce((n, g) => n + g.plugins.length, 0);
---
<section class="section" id="plugins">
  <div class="container">
    <h2 class="section-title">{s.plugins.heading}<em>{s.plugins.headingAccent}</em></h2>
    <p class="section-sub">{s.plugins.sub}</p>
    <div class="groups">
      {s.plugins.groups.map((g) => (
        <div class="group">
          <h3>{g.label}</h3>
          <div class="chips">
            {g.plugins.map((p) => <span class="chip">{p}</span>)}
          </div>
        </div>
      ))}
    </div>
    <p class="count">{total} = 25 ✓</p>
  </div>
</section>
<style>
  .groups { display: flex; flex-direction: column; gap: 22px; }
  .group h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-3); margin: 0 0 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; }
  .chip {
    font-family: var(--font-mono); font-size: 13.5px; color: var(--text-1);
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 999px; padding: 7px 16px; transition: border-color 0.15s;
  }
  .chip:hover { border-color: var(--accent-to); }
  .count { font-family: var(--font-mono); color: var(--text-3); font-size: 12.5px; margin-top: 26px; }
</style>
```

注：`{total} = 25 ✓` 中的 `25` 为事实校验注脚；若 Step 7.1 核对后调整了清单，同步改此处数字（写成 `{total}` 即可，`= 25 ✓` 文案放字典外属于校验标记——若总数变动，改为只显示 `{total} plugins`）。

- [ ] **Step 7.3: 构建验证**

Run: `pnpm --filter @ztronlibs/website build`
Expected: PASS；dev 下 5 组 chip 墙渲染，页面显示计数 25。

- [ ] **Step 7.4: Commit**

```bash
git add website/src/components/ website/src/pages/ website/src/i18n/
git commit -m "feat(website): plugin wall (25 plugins, registry-checked)"
```

---

### Task 8: StatusMatrix

**Files:**
- Create: `website/src/components/StatusMatrix.astro`
- Modify: 两个入口页，PluginWall 后插入 `<StatusMatrix s={s} />`

**Interfaces:**
- Consumes: `s.statusm`（rows 的 `status: 'ready'|'wip'` 驱动 pill 颜色）
- Produces: `<section id="status">`

- [ ] **Step 8.1: 组件**

```astro
---
import { repoDoc } from '../i18n/shared';
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
---
<section class="section" id="status">
  <div class="container">
    <h2 class="section-title">{s.statusm.heading}</h2>
    <p class="section-sub">{s.statusm.sub}</p>
    <div class="rows">
      {s.statusm.rows.map((r) => (
        <div class="row">
          <b>{r.platform}</b>
          <span class:list={['pill', r.status]}>{r.status === 'ready' ? '✓' : '…'}</span>
          <span class="note">{r.note}</span>
        </div>
      ))}
    </div>
    <p class="checks">{s.statusm.checks}</p>
    <a class="btn" href={repoDoc('ROADMAP.md')} target="_blank" rel="noopener">{s.statusm.moreLabel}</a>
  </div>
</section>
<style>
  .rows { display: flex; flex-direction: column; gap: 12px; max-width: 720px; }
  .row {
    display: grid; grid-template-columns: 110px 92px 1fr; gap: 16px; align-items: center;
    background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 18px;
  }
  .row b { font-size: 15px; }
  .pill { font-size: 12px; font-family: var(--font-mono); border-radius: 999px; padding: 3px 10px; text-align: center; }
  .pill.ready { color: var(--ok); border: 1px solid var(--ok); }
  .pill.wip { color: var(--wip); border: 1px solid var(--wip); }
  .note { color: var(--text-2); font-size: 14px; }
  .checks { font-family: var(--font-mono); color: var(--text-2); font-size: 13.5px; margin: 28px 0; }
  @media (max-width: 600px) { .row { grid-template-columns: 1fr 92px; } .note { grid-column: 1 / -1; } }
</style>
```

（`s.statusm.more` 与 `moreLabel` 二选一展示：页面用 `moreLabel` 作为按钮文字；`more` 是无障碍/全文语境的长文案，放在按钮的 `title` 属性上——实施时给 `<a>` 加 `title={s.statusm.more}`。）

- [ ] **Step 8.2: 构建验证**

Run: `pnpm --filter @ztronlbs/website build || pnpm --filter @zturnlibs/website build`
Expected: PASS（第一条含拼写保护，正常用第二条）；dev 下三平台行 + 绿/琥珀 pill + ROADMAP 外链。

- [ ] **Step 8.3: Commit**

```bash
git add website/src/components/ website/src/pages/
git commit -m "feat(website): platform status matrix"
```

---

### Task 9: QuickStart（Shiki 高亮 + tab）+ Packages

**Files:**
- Create: `website/src/lib/highlight.ts`, `website/src/components/QuickStart.astro`, `website/src/components/Packages.astro`
- Modify: 两个入口页，StatusMatrix 后插入 `<QuickStart s={s} />` 与 `<Packages s={s} />`，并移除 Task 3 的占位 `<p>sections incoming</p>`

**Interfaces:**
- Consumes: `s.quickstart.tabs`（`id/label/code`，code 为 bash）、`s.packages.items`
- Produces: `<section id="quickstart">`（tab 切换为组件内联脚本）；`highlight(code, lang)` 单例工具

- [ ] **Step 9.1: highlight.ts（shiki 单例，构建时高亮）**

```ts
import { createHighlighter } from 'shiki';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

export async function highlight(code: string, lang = 'bash'): Promise<string> {
  highlighter ??= await createHighlighter({
    themes: ['github-dark-default'],
    langs: [lang],
  });
  return highlighter.codeToHtml(code, { lang, theme: 'github-dark-default' });
}
```

- [ ] **Step 9.2: QuickStart.astro**

```astro
---
import { highlight } from '../lib/highlight';
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
const rendered = await Promise.all(
  s.quickstart.tabs.map(async (t) => ({ id: t.id, label: t.label, html: await highlight(t.code) }))
);
---
<section class="section" id="quickstart">
  <div class="container">
    <h2 class="section-title">{s.quickstart.heading}<em>{s.quickstart.headingAccent}</em></h2>
    <p class="section-sub">{s.quickstart.sub}</p>
    <div class="tabs" role="tablist">
      {rendered.map((t, i) => (
        <button role="tab" aria-selected={i === 0 ? 'true' : 'false'} data-tab={t.id} class={i === 0 ? 'on' : ''}>{t.label}</button>
      ))}
    </div>
    {rendered.map((t, i) => (
      <div class="pane" data-pane={t.id} hidden={i !== 0}>
        <Fragment set:html={t.html} />
      </div>
    ))}
  </div>
</section>
<style>
  .tabs { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
  .tabs button {
    background: none; border: 1px solid var(--border); color: var(--text-2);
    border-radius: 8px; padding: 8px 16px; font-size: 14px; cursor: pointer; font-family: var(--font-ui);
  }
  .tabs button.on { color: var(--text-1); border-color: var(--accent-from); }
  .pane :global(pre.shiki) { background: var(--code-bg) !important; border: 1px solid var(--border); border-radius: var(--radius); margin: 0; padding: 22px 24px; font-size: 13.5px; line-height: 1.85; overflow-x: auto; }
</style>
<script>
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-tab]');
  const panes = document.querySelectorAll<HTMLElement>('[data-pane]');
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      buttons.forEach((x) => {
        x.classList.toggle('on', x === b);
        x.setAttribute('aria-selected', String(x === b));
      });
      panes.forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
    })
  );
</script>
```

- [ ] **Step 9.3: Packages.astro**

```astro
---
interface Props { s: import('../i18n/types').SiteStrings }
const { s } = Astro.props;
---
<section class="section" id="packages">
  <div class="container">
    <h2 class="section-title">{s.packages.heading}</h2>
    <p class="section-sub">{s.packages.sub}</p>
    <div class="grid">
      {s.packages.items.map((p) => (
        <article class="card">
          <code>{p.name}</code>
          <p>{p.role}</p>
        </article>
      ))}
    </div>
  </div>
</section>
<style>
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 22px; }
  .card code { color: var(--accent-to); font-size: 14.5px; }
  .card p { color: var(--text-2); font-size: 14px; margin: 10px 0 0; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
</style>
```

- [ ] **Step 9.4: 构建验证**

Run: `pnpm --filter @zturnlibs/website build`
Expected: PASS；dev 下 tab 可切换、代码块带 Shiki 配色（背景已被覆盖为 `--code-bg`），5 包卡片渲染。至此 9 分区全部就位，页面完整。

- [ ] **Step 9.5: Commit**

```bash
git add website/src/ website/src/pages/
git commit -m "feat(website): quickstart tabs (shiki) + packages grid; all 9 sections live"
```

---

### Task 10: public 静态资源（favicon / og-image）

**Files:**
- Create: `website/public/favicon-32.png`, `website/public/apple-touch-icon.png`（180x180）, `website/public/favicon-512.png`, `website/public/og-image.png`（1200x630）

（BaseLayout 已在 Task 1 引用这些路径，本任务补齐文件。）

- [ ] **Step 10.1: 由 app-icon 生成 favicon 系列（macOS sips）**

```bash
mkdir -p website/public
sips -z 512 512 assets/app-icon.png --out website/public/favicon-512.png
sips -z 180 180 assets/app-icon.png --out website/public/apple-touch-icon.png
sips -z 32 32   assets/app-icon.png --out website/public/favicon-32.png
```

Expected: 三个文件生成，`file website/public/*.png` 尺寸正确。

- [ ] **Step 10.2: og-image（1200x630）**

启动 `pnpm --filter @zturnlibs/website dev`，用浏览器工具将视口设为 1200x630，截图 Hero 区域（深色 + 标题 + 终端可见），保存为 `website/public/og-image.png`。若浏览器截图尺寸不精确，用 sips 归一：`sips -z 630 1200 <截图> --out website/public/og-image.png`。

Expected: `file website/public/og-image.png` 报 1200x630。

- [ ] **Step 10.3: 构建验证**

Run: `pnpm --filter @zturnlibs/website build && ls website/dist/ztron 2>/dev/null || ls website/dist`
Expected: PASS；dist 里包含 favicon-32.png / apple-touch-icon.png / og-image.png。

- [ ] **Step 10.4: Commit**

```bash
git add website/public/
git commit -m "feat(website): favicons from app-icon + og image"
```

---

### Task 11: 部署 workflow + website/README

**Files:**
- Create: `.github/workflows/website.yml`, `website/README.md`

- [ ] **Step 11.1: .github/workflows/website.yml**

```yaml
name: website

on:
  push:
    branches: [main]
    paths: ['website/**', '.github/workflows/website.yml']
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
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
      - name: install
        run: pnpm install --frozen-lockfile
      - name: build website
        run: pnpm --filter @zturnlibs/website build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: website/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 11.2: website/README.md**

```markdown
# Ztron Website (GitHub Pages)

Astro 双语落地页：英文 `/`，中文 `/zh/`。部署到 https://zturnlibs.github.io/ztron/

## 本地开发

    pnpm --filter @zturnlibs/website dev      # http://localhost:4321/ztron/
    pnpm --filter @zturnlibs/website build    # astro check && astro build（漏译即失败）
    pnpm --filter @zturnlibs/website preview

## 双语规则

所有文案在 `src/i18n/{en,zh}.ts`，受 `SiteStrings` 接口约束——新增 key 必须两份
字典同时补齐，否则构建失败。命令/包名/插件名不翻译。

## 部署

push 到 main 且 `website/**` 变更时由 `.github/workflows/website.yml` 自动部署。
一次性设置：仓库 Settings → Pages → Source 选择 "GitHub Actions"。

[![website](https://github.com/ZturnLibs/ztron/actions/workflows/website.yml/badge.svg)](https://github.com/ZturnLibs/ztron/actions/workflows/website.yml)
```

- [ ] **Step 11.3: YAML 校验**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/website.yml')); print('yaml ok')"`
Expected: `yaml ok`

- [ ] **Step 11.4: Commit**

```bash
git add .github/workflows/website.yml website/README.md
git commit -m "ci(website): github pages deploy workflow + website readme"
```

---

### Task 12: 验收 pass（spec 第 8 节 7 条硬标准）

**Files:**
- 无新增（发现问题则回到对应 Task 修复后重跑本任务）

- [ ] **Step 12.1: 构建 + 双语完整性**

Run: `pnpm --filter @zturnlibs/website build; echo "exit=$?"`
Expected: `exit=0`，dist 含 `index.html`、`zh/index.html`、favicon、og-image（验收 #1 #2 已由 Task 2 红灯环节证明拦截生效）。

- [ ] **Step 12.2: 本地预览全站走查**

Run: `pnpm --filter @zturnlibs/website preview`（http://localhost:4321/ztron/）

用浏览器工具核对（验收 #4）：
- `/ztron/` 与 `/ztron/zh/` 9 个分区全部渲染
- 语言切换往返：en → 中文 → EN，返回后内容正确
- 导航 5 个锚点均可跳达对应 section；GitHub/DESIGN/ROADMAP/LICENSE 外链可打开
- 终端窗口、tab 切换、移动汉堡菜单工作正常

- [ ] **Step 12.3: 客户端 JS 预算（验收 #3）**

浏览器 devtools 控制台执行：

```js
performance.getEntriesByType('resource').filter((r) => r.initiatorType === 'script').reduce((n, r) => n + r.transferSize, 0)
```

Expected: `< 20480`（字节）。

- [ ] **Step 12.4: 双断点截图走查（验收 #7）**

视口 1440px 与 390px 各截全页图，核对：深色令牌一致（背景 `#0A0C10`）、无横向滚动条（`document.documentElement.scrollWidth <= innerWidth`）、布局不破。

- [ ] **Step 12.5: Lighthouse（验收 #5）**

用 chrome-devtools 的 `lighthouse_audit`（navigation, desktop + mobile 各一次）。
Expected: Performance / Accessibility / Best Practices / SEO 四项 ≥ 95。不达标时定位（通常是图片体积或对比度）并修复。

- [ ] **Step 12.6: 线上部署验证（验收 #6）**

```bash
git push -u origin feat/home-page
```

开 PR → 合并 `main` → 等 website workflow 绿 → `curl -sI https://zturnlibs.github.io/ztron/ | head -1` 与 `curl -sI https://zturnlibs.github.io/ztron/zh/ | head -1`
Expected: 均为 `HTTP/2 200`（若 404，先确认仓库 Settings → Pages → Source = "GitHub Actions"）。

- [ ] **Step 12.7: 收尾提交（如有修复）**

```bash
git add -A website/
git commit -m "fix(website): acceptance pass fixes"
```

---

## Self-Review 记录

- **Spec 覆盖**：spec §2 的 9 分区 → Task 3/4/5/6/7/8/9；§3 i18n → Task 1(config)+2；§4 令牌 → Task 1，签名元素分散在 Task 3(汉堡)/4(终端+光晕网格)/5/6/7/8；§5 仓库结构 → Task 1/9；§6 部署 → Task 11；§7 错误处理 → Task 2(漏译)/3(锚点常量)/11(本地资源)；§8 验收 7 条 → Task 12 一一对应。无缺口。
- **占位符扫描**：无 TBD/TODO；Task 3 页面骨架的 `sections incoming` 是被 Task 9 显式移除的中间态，非遗留占位。
- **类型一致性**：`SiteStrings` 各字段在 Task 2 定义后被 Task 3-9 按同名引用（`s.hero`、`s.plugins.groups` 等）；`highlight(code, lang)` 仅 Task 9 定义并使用；`ANCHORS`/`REPO`/`repoDoc` 定义于 Task 2 shared.ts，消费于 Task 3/4/8。
