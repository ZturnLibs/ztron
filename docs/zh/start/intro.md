---
title: 简介
---

# Ztron 是什么

Ztron 是一个 **Tauri 式跨平台桌面框架，用纯 TypeScript 重写**：~2MB 的
[txiki.js](https://txikijs.org) 运行时 + 系统 WebView。原生窗口、托盘、菜单、
对话框与 25 个官方插件，全部通过你熟悉的 Tauri 兼容 API 使用。

架构一句话：极小的原生 host（C，负责 WebView 与 GUI）+ 异步 TypeScript 后端
（txiki.js，负责 IPC / 插件 / ACL），前端就是普通 Vite 页面。

熟悉 Tauri？API 直接对齐——`invoke` / `listen` / `fs` / `window` 全在
[`@zturnlibs/ztron-api`](/start/quick-start)，差异清单见
[从 Tauri 迁移](/guide/tauri-migration)。

**下一步：[前置条件与安装](/start/install)**
