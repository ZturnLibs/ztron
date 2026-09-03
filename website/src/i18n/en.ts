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
