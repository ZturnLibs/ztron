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
    titleAccent: '桌面应用框架',
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
    backendBody: 'txiki.js · @zturnlibs/ztron-core · IPC · 插件 · ACL · 更新器',
    wireLabel: 'TCP · JSON',
    frontendLabel: 'Vite 前端 → @zturnlibs/ztron-api（invoke · listen · Channel）',
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
        code: 'pnpm install\nscripts/build-native.sh                 # 构建 tjs + ztron-host + webview 库（macOS）\npnpm --filter @zturnlibs/ztron-example-hello dev  # vite 构建 + host + backend',
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
    sub: '以 @zturnlibs/ztron-* 发布到 GitHub Packages。',
    items: [
      { name: '@zturnlibs/ztron-api', role: '由 @tauri-apps/api 翻译而来的前端 API——invoke/events/Channel + 插件封装' },
      { name: '@zturnlibs/ztron-core', role: '主进程核心：IPC、事件、命令、ACL、PathScope、25 插件、MockRuntime' },
      { name: '@zturnlibs/ztron-runtime-ffi', role: 'HostRuntime socket 适配器（Plan A）+ FFI 参考绑定' },
      { name: '@zturnlibs/ztron-inject', role: '注入页面 HTML 的 window.__TAURI_INTERNALS__ 引导' },
      { name: '@zturnlibs/ztron-cli', role: 'ztron dev / build / codegen / init——Vite 构建 + host + 后端' },
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
