---
pageType: home
title: Ztron 文档
hero:
  name: Ztron
  text: Tauri 风格桌面框架，以 TypeScript 重写
  tagline: 运行于 txiki.js（~2MB）+ 系统 WebView —— 主进程用 TypeScript，前端用任意 Web 技术栈
  actions:
    - text: 快速开始
      link: /start/quick-start
    - text: 前置条件与安装
      link: /start/install
    - text: CLI 参考
      link: /reference/cli
features:
  - title: 双进程架构
    details: 原生宿主（窗口/托盘/菜单）与 tjs 异步后端通过 TCP/JSON 协作；@zturnlibs/ztron-core 负责 IPC、事件、插件与 ACL。
  - title: Tauri v2 能力对齐
    details: "@zturnlibs/ztron-api 移植 @tauri-apps/api；invoke / 事件 / Channel / fs / http / os / store / log / shell / updater 等插件齐备，从 Tauri 迁移有对照指南（见指南）。"
  - title: macOS 全链路已验证
    details: M0–P30 里程碑完成，86 项确定性检查（`ztron check` 可驱动回归）；Windows/Linux 打包链建设中。
  - title: 指南与示例
    details: 架构、IPC、事件、窗口、配置、安全模型，以及 hello / multiwin / menuprobe 三个可运行示例。
  - title: 插件体系
    details: 40 个内建/插件能力页（window、webview、fs、http、tray…）逐模块说明权限、scope、示例与命令清单，与命令级 API 参考互为对照。
  - title: 适用版本：`ztron 0.3.1`
    details: 文档随代码演进；重大 API 变更会在同一 PR 中更新本站（见 CONTRIBUTING）。
---
