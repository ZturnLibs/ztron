---
title: 架构总览
---

Ztron 是一个用 TypeScript 重写的 Tauri 风格跨平台桌面框架，底层基于
[txiki.js](https://txikijs.org)（约 2MB 的嵌入式 JS 运行时）与系统
WebView（通过 `tjs:ffi` 绑定 `webview/webview` 的 C API）。

## 双进程数据流

整个框架由两个进程组成，中间以 TCP/JSON 通信（Plan A 原生宿主方案）：

- **ztron-host（原生 C 进程）**：持有系统 WebView 与 GUI 能力，负责
  窗口、托盘、菜单、对话框等原生侧资源。
- **tjs backend（txiki.js 进程）**：异步 JS 后端，承载
  `@zturnlibs/ztron-core` 的 IPC、事件、命令、ACL 能力层、插件与更新器。

前端是普通的 Vite 页面，通过 `@zturnlibs/ztron-api` 调用
`invoke/listen/Channel/fs/http/os/store/log/shell` 等能力；打包时后端经
`tjs compile` 编译为独立可执行文件，再由 `ztron build` 产出 macOS
`.app`（含签名）。

## 五个包

| Package | 职责 |
| --- | --- |
| `@zturnlibs/ztron-api` | 前端 API（翻译自 `@tauri-apps/api`）+ fs/path/http/os/store/log/shell/updater/window/tray/menu/dialog 包装 |
| `@zturnlibs/ztron-core` | 主进程核心：IPC、事件、Channel、命令、插件、ACL 能力层、PathScope、25 个插件、MockRuntime 测试设施 |
| `@zturnlibs/ztron-runtime-ffi` | `HostRuntime` socket 适配器（Plan A）+ FFI 参考绑定 |
| `@zturnlibs/ztron-inject` | `window.__ZTRON_INTERNALS__` 引导（嵌入页面 HTML） |
| `@zturnlibs/ztron-cli` | `dev`/`build`/`codegen`/`init`；vite 构建 + `ztron-host` + tjs 后端 |

## 进程间如何协作

后端启动后通过 `runtime-ffi` 的 socket 与 host 建立连接；前端每一次
`invoke` 都经由注入脚本 `window.__ZTRON_INTERNALS__`（由 `inject` 包嵌入）
进入 IPC 通道，backend 的命令/插件系统处理后按 Tauri 的协议语义回传。
窗口创建、事件广播、Channel 流式数据都走同一条 TCP/JSON 通路。

## 深入阅读

- 架构决策、里程碑与风险记录见仓库根目录 `DESIGN.md`
- 与 Tauri 的能力差距与阶段计划见 `ROADMAP.md`
- 快速上手见「快速开始」；命令调用细节见 [调用后端命令](/guide/ipc)

适用版本：`ztron 0.3.0`
