---
title: 简介
---

# Ztron 是什么

Ztron 是一个 Tauri 风格的跨平台桌面应用框架，核心以 TypeScript 重写而非 Rust。它运行于 [txiki.js](https://txikijs.org)（约 2MB 的轻量 JS 运行时）之上，界面使用系统 WebView（[webview/webview](https://github.com/webview/webview)，经 `tjs:ffi` 集成）。前端保持真实 Web 技术栈（Vite 构建），主进程逻辑全部用 TypeScript 编写，宿主进程（`ztron-host`）则是原生 C 实现。API 协议与 `@tauri-apps/api` 同构，前端代码迁移成本低。

# 架构一览

```
┌────────────────────────┐  TCP/JSON   ┌──────────────────────────────────┐
│ ztron-host (native C)   │◄───────────►│ tjs backend (txiki.js, async)    │
│ system WebView + GUI    │             │ @zturnlibs/core: IPC/events/commands │
│ window/tray/menu/dialog │             │  ACL + plugins + updater         │
└────────────────────────┘             └──────────────────────────────────┘
        frontend: Vite page → @zturnlibs/api → invoke/listen/Channel/fs/http/os/store/log/shell
        packaging: tjs compile backend → ztron build → macOS .app (signed)
```

两个进程通过 TCP/JSON 通信：`ztron-host` 负责窗口、托盘、菜单、对话框等原生 GUI；tjs backend 承载应用主进程逻辑与 IPC/事件/命令层。架构详情见[架构指南](/guide/architecture)（指南章节建设中）。

# 适用场景与现状

| 平台 | 状态 |
| --- | --- |
| macOS | 全链路已验证：M0–P30 里程碑，86 项确定性检查全部通过（`FULL_OK`，exit 0），可由 `ztron check` 驱动回归 |
| Windows / Linux | host 骨架已编译通过，尚未进入打包链，无发布时间承诺 |

能力范围包括多窗口（`MULTI_WINDOW_OK`）、托盘与菜单（`TRAY_OK`、`MENU_OK`）、拖放（`DRAG_DROP_ARMED`）、HTTP 流式请求（`HTTP_STREAM_OK`）、updater（`UPDATER_OK`）、dmg 打包等；各项验证锚点见仓库 [README.md](https://github.com/ZturnLibs/ztron) 的 Status 表，能力缺口与阶段计划见 [ROADMAP.md](https://github.com/ZturnLibs/ztron)。

# 与 Tauri 的关系

Ztron 的 API 协议与 `@tauri-apps/api` 同构，`@zturnlibs/api` 即其移植，前端代码多数情况下只需替换导入来源。IPC、能力（ACL/capabilities）与配置模型均对齐 Tauri v2。两者的差异与迁移注意事项见[迁移指南](/guide/tauri-migration)（指南章节建设中）。

适用版本：`ztron 0.1.0`
