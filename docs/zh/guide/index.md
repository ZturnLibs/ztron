---
title: 指南
---

# 指南

指南部分按主题讲解 Ztron 的核心机制：从[架构总览](/guide/architecture)的双进程模型出发，依次覆盖[调用后端命令](/guide/ipc)（invoke 命令调用）、[事件与 Channel](/guide/events)（双向通信）、[窗口](/guide/window)（声明式与运行时两种创建方式）、[配置 ztron.conf.json](/guide/config)（项目配置文件）与[安全模型](/guide/security)（ACL 能力授权），再以[打包与分发](/guide/bundling)、[签名与更新器](/guide/signing-updater)、[调试与日志](/guide/debugging)覆盖发布实操，最后以[从 Tauri 迁移](/guide/tauri-migration)收尾——Ztron 的 API 面与 Tauri v2 对齐，迁移成本主要在后端语言（Rust 换成 TypeScript）。

| 章节 | 说明 |
| --- | --- |
| [架构总览](/guide/architecture) | 双进程数据流：原生 host（窗口/托盘/菜单）与 tjs 异步后端经 TCP/JSON 协作 |
| [调用后端命令](/guide/ipc) | `invoke` 命令调用模型：`defineCommand` 类型化声明，协议对齐 Tauri v2（JSON + callback/error id + Channel） |
| [事件与 Channel](/guide/events) | 前后端双向事件：listen/once/emit/emitTo 与 Channel 有序流式消息 |
| [窗口](/guide/window) | 两种创建方式：声明式（`ztron.conf.json` 的 `windows[]`）与运行时（`WebviewWindow`） |
| [配置 ztron.conf.json](/guide/config) | 项目配置文件：双层校验（CLI fail-fast + core），经 `AppBuilder.fromConfig` 消费 |
| [安全模型](/guide/security) | Tauri v2 的 ACL 模型：默认全拒，命令与路径/URL 都需在 capability 中显式授权 |
| [打包与分发](/guide/bundling) | `ztron build` 产出可分发产物：macOS 上是 `.app` 与 `.dmg`，其余平台为真实工具链消费的目录布局 |
| [签名与更新器](/guide/signing-updater) | 自更新信任链：`ztron signer` minisign 签名/校验、更新清单与 `updaterPlugin` 的 `install()` 流程 |
| [调试与日志](/guide/debugging) | 调试入口汇总：DevTools 开关、log 插件结构化日志与 `ztron check` 回归运行器 |
| [从 Tauri 迁移](/guide/tauri-migration) | Rust → TS 模块对照：`@zturnlibs/ztron-api` 即 `@tauri-apps/api` 的翻译，前端多数只需替换导入来源 |

适用版本：`ztron 0.3.0`
