---
title: 从 Tauri 迁移
---

Ztron 的 API 面刻意与 Tauri v2 对齐（`@zturnlibs/ztron-api` 即从
`@tauri-apps/api` 翻译而来），迁移成本主要在后端语言：Rust 换成
TypeScript。仓库 `DESIGN.md` §9 给出了 Rust → TS 的模块对照表（原样
照抄）：

| Rust 模块 | Ztron TS 等价物 |
| --- | --- |
| `tauri-runtime-wry`     | `runtime-ffi`(tjs:ffi 绑 webview C API)        |
| `tauri` core            | `core`(命令/事件/state/插件)                   |
| `tauri-codegen` 注入    | `inject`(嵌入页面 HTML)                        |
| `ipc/mod.rs` 协议       | `core/ipc`(JSON + callback/error id + Channel) |
| `tauri-plugin`          | TS 插件(注册命令 + 权限)                       |
| `tauri-bundler`         | `tjs compile` + 平台打包脚本                   |
| `tauri-utils`(配置/CSP) | zod schema + 注入 CSP                          |
| `@tauri-apps/api`       | `api`(传输层适配,协议不变)                     |

## 命令迁移

Rust 的 `#[tauri::command]` 宏 + `invoke_handler` 注册，改为
`defineCommand` 类型化声明（配合 `ztron codegen`）或 `app.command(...)`
内联注册，再在 `AppBuilder` 的 setup 回调中执行 `app.commandDef(greet)`。
详见[调用后端命令](/guide/ipc)。

## 配置迁移

`tauri.conf.json` → `ztron.conf.json`，大部分字段同名（`identifier`、
`version`、`build.*`、`app.security.*`、`bundle.*`、`windows[]` 等），
类型真源从 Rust 结构体变为 TS 的 `ProjectConfigFile` 接口。字段明细见
[配置 ztron.conf.json](/guide/config)。

## 前端迁移

通常只需改 import：`@tauri-apps/api` → `@zturnlibs/ztron-api`。`invoke`、
`listen`、`emit` 等签名不变；事件常量枚举由上游的 `TauriEvent` 更名为
`ZtronEvent`，事件名前缀相应为 `ztron://`（如
`ZtronEvent.WINDOW_RESIZED = "ztron://resize"`）。

## 差异注记

- IPC 载荷是 JSON，不是 MessagePack——但这与 Tauri v2 桌面端一致：
  研究修正表明桌面端本就没有 MessagePack，真实目标是
  `InvokeResponseBody::Raw`；Ztron 的 base64-in-JSON 对齐 Tauri 自己
  在 Android 上的推荐做法（P24）。
- `app.withGlobalTauri` 已支持（注入 `window.__ZTRON_INTERNALS__` 引导，
  见 `inject` 包）。
- 能力覆盖度与差距见 `ROADMAP.md`；Windows/Linux host 尚未提供编译
  与打包，暂无法承诺迁移后的跨平台时间表。

适用版本：`ztron 0.3.0`
