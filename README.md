<div align="center">

<img src="./assets/ztron-logo.svg" alt="Ztron" width="88" />

# Ztron

**用纯 TypeScript 构建跨平台桌面应用——Tauri 式架构，微型运行时 + 系统 WebView。**

[![CI](https://github.com/ZturnLibs/ztron/actions/workflows/ci.yml/badge.svg)](https://github.com/ZturnLibs/ztron/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@zturnlibs/ztron-cli?label=%40zturnlibs%2Fztron-cli)](https://www.npmjs.com/package/@zturnlibs/ztron-cli)
![platform](https://img.shields.io/badge/platform-macOS%20Apple%20Silicon%20verified-blue)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![docs](https://img.shields.io/badge/docs-zh%2F%20en-8b5cf6)](https://zturnlibs.github.io/ztron/docs/)

**简体中文** · [English](./README.en.md)

[主页](https://zturnlibs.github.io/ztron/) · [文档](https://zturnlibs.github.io/ztron/docs/) · [快速开始](https://zturnlibs.github.io/ztron/docs/start/quick-start.html) · [示例](./examples/)

</div>

---

## 为什么是 Ztron

- **纯 TypeScript 全栈** —— 前后端都是 TS。没有 Rust 工具链、没有交叉编译；原生层（窗口宿主 + 运行时）已随 CLI 预编译好。
- **真的轻量** —— 后端运行时 [txiki.js](https://txikijs.org) 仅 ~2MB，渲染用**系统自带 WebView**，不捆绑 Chromium，安装包 5MB 级。
- **Tauri 用户零成本迁移** —— API 自 [`@tauri-apps/api`](https://github.com/tauri-apps/tauri) 忠实移植为 `@zturnlibs/ztron-api`，IPC/事件/命令/插件协议同构，[迁移指南](https://zturnlibs.github.io/ztron/docs/guide/tauri-migration.html)半天搬完。
- **生态完整** —— 25+ 内置插件（fs/http/store/sql/shell/tray/menu/dialog/updater…）、ACL 能力权限体系、`ztron://` 自定义协议、自动更新 + 签名 + dmg 打包。

## 30 秒上手

> 前置：macOS（Apple Silicon 已验证）+ Node.js ≥ 20。原生链已随 CLI 预编译，**无需 clone 本仓库、无需编译、无需配环境变量**。

```bash
npm i -g @zturnlibs/ztron-cli
ztron init my-app --template react-ts   # 模板：vanilla | react-ts | vue-ts | svelte
cd my-app && pnpm install
ztron dev                               # 原生窗口弹出
```

打包、体检随时可用：

```bash
ztron build      # 打包 + ad-hoc 签名 ZtronApp.app + dmg
ztron doctor     # 环境五项体检，FAIL 自带修复提示
```

遇到问题跑 `ztron doctor`；完整安装说明见[文档](https://zturnlibs.github.io/ztron/docs/start/install.html)。

## 特性一览

| 特性 | 说明 |
| --- | --- |
| 声明式窗口 | `ztron.conf.json` 里声明启动窗口（尺寸/位置/透明/装饰…），双层数据校验 |
| 全模块 HMR | Vite dev server + `ztron://` 自定义协议（WKURLSchemeHandler），模块级热替换 |
| 类型安全命令 | `ztron codegen` 生成 typed invoke 绑定，前后端契约不漂移 |
| ACL 能力权限 | capability 文件声明权限面；fs/http 全部 PathScope/HttpScope 收敛 |
| 多窗口 | `WebviewWindow` 运行时创建/销毁、label 路由、窗口注册表 |
| 系统 API 全家桶 | tray/menu/dialog/clipboard/notification/global-shortcut/deep-link/fs.watch/拖放… |
| 生产打包 | `tjs compile` 独立可执行 + .app/dmg + ad-hoc/Developer ID 签名 + 自动更新 |
| 三层测试 | surface/unit/integration 三层，`ztron check` 退出码化回归（86 项确定性检查） |

## 架构

```
┌──────────────────────────┐  TCP/JSON  ┌───────────────────────────────────┐
│ ztron-host (native C)     │◄──────────►│ tjs backend (txiki.js, async)     │
│ 系统 WebView + GUI 循环    │            │ @zturnlibs/ztron-core             │
│ window/tray/menu/dialog   │            │   IPC / events / commands / ACL   │
└──────────────────────────┘            └───────────────────────────────────┘
   frontend: Vite 页面 → @zturnlibs/ztron-api → invoke/listen/Channel/fs/http/…
   packaging: ztron build → tjs compile 后端 → macOS .app / dmg（签名）
```

深度解析见 [DESIGN.md](./DESIGN.md)（架构决策、技术发现、翻译对照表）。

## 包家族

| 包 | 职责 |
| --- | --- |
| [`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api) | 前端 API（自 `@tauri-apps/api` 移植）：fs/http/os/store/log/shell/window/tray/menu/dialog/updater… |
| [`@zturnlibs/ztron-core`](https://www.npmjs.com/package/@zturnlibs/ztron-core) | 主进程核心：IPC、events、Channel、commands、ACL、PathScope、25+ 插件、MockRuntime |
| [`@zturnlibs/ztron-runtime-ffi`](https://www.npmjs.com/package/@zturnlibs/ztron-runtime-ffi) | `HostRuntime` socket 适配（双进程模型）+ FFI 参考绑定 |
| [`@zturnlibs/ztron-cli`](https://www.npmjs.com/package/@zturnlibs/ztron-cli) | `init` / `dev` / `build` / `check` / `codegen` / `doctor` / `bench` |
| [`@zturnlibs/ztron-driver`](https://www.npmjs.com/package/@zturnlibs/ztron-driver) | WebDriver 中继（W3C 协议，外部自动化驱动 Ztron 应用） |

## 示例与模板

`ztron init --template <name>` 可选模板：

| 模板 | 技术栈 |
| --- | --- |
| `vanilla` | TS + Vite（最小起点） |
| `react-ts` | React 19 + Tailwind v4 |
| `vue-ts` | Vue 3.5 + Tailwind v4 |
| `svelte` | Svelte 5 runes + Tailwind v4 |

[`examples/`](./examples/) 下有 8 个可运行示例，最值得看的是 **[showcase](./examples/showcase/)**——34 张交互卡片现场演示全部插件 API（`pnpm --filter @zturnlibs/ztron-example-showcase dev`），另有 hello / multiwin / react-demo / vue-demo / svelte-demo / bench / menuprobe。逐个讲解见[文档示例页](https://zturnlibs.github.io/ztron/docs/start/examples.html)。

## 平台支持

| 平台 | 状态 |
| --- | --- |
| macOS（Apple Silicon） | ✅ 完整验证（Intel 未验证，可尝试） |
| Windows（WebView2） | 🚧 host 骨架已就位，打包链待接入 |
| Linux（WebKitGTK） | 🚧 host 骨架已就位，打包链待接入 |
| Mobile（Android/iOS） | 📋 规划中 |

## 参与开发

```bash
pnpm install                                        # 工作区依赖
scripts/build-native.sh                             # 编译原生链（macOS，一次性）
pnpm --filter @zturnlibs/ztron-example-hello dev    # 在 monorepo 内跑示例
pnpm test                                           # 150 项测试（surface/unit/core 三层）
```

三层测试面向"特性 + API 100% 覆盖"：surface 保证框架注册的命令与 API 导出面零偏差；unit 经 MockRuntime 全量路由；integration 驱动真实 host + WebView（`ztron check` 86 项确定性检查，exit code 可回归）。设计详见 [tests/README.md](./tests/README.md)。

性能基线（冷/热启动、invoke P50/P95、Channel 吞吐、窗口创建、RSS）：

```bash
node packages/cli/dist/index.js bench --runs 3
```

## 项目状态

**M0–P30 全部完成**：86 项确定性检查 FULL_OK / exit 0。完整开发日志（每个阶段交付了什么、验收标准、踩过的坑）见 [DESIGN.md §7](./DESIGN.md)；与 Tauri 的能力差距与后续规划见 [ROADMAP.md](./ROADMAP.md)。

## License

[MIT](./LICENSE)
