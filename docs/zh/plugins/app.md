---
title: 应用（app）
---

# 概述

`app` 模块提供应用元数据与整体生命周期控制：名称/版本/标识符/打包
格式查询、是否支持多窗、整应用显隐与 macOS Dock 图标开关，是
`@tauri-apps/api/app` 的移植。模块既导出独立函数，也导出聚合对象
`app`（如 `app.getName`）。

```ts
import { getName, getConfig } from "@zturnlibs/ztron-api/app";
// 或从主入口：import { app } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

app 属于框架内建能力，其 `plugin:app|*` 命令由 capability 中的
**`core:default`** 权限集授权；细粒度可用
`core:allow-app_<命令下划线名>`（如 `core:allow-app_get_config`）。
无 scope 约束。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（验证锚点 `APP_OK`、
`APP_CONFIG_OK`、`APP_LIFECYCLE_OK`）：

```ts
import {
  getName, getVersion, getConfig, getIdentifier,
  getBundleType, supportsMultipleWindows,
  setDockVisibility, hideApplication, showApplication,
} from "@zturnlibs/ztron-api";

const appName = await getName();          // "com.ztron.hello"（回落到标识符）
const version = await getVersion();       // "0.1.0"
const info = await getConfig();           // { identifier, appName?, version? }，密钥已剥离
const ident = await getIdentifier();      // "com.ztron.hello"
const btype = await getBundleType();      // .app 包内或 dev 下为 "App"
const multiWin = await supportsMultipleWindows();

// 整应用生命周期（macOS）
await setDockVisibility(false); await setDockVisibility(true);
await hideApplication(); await showApplication();
```

`getConfig()` 返回体不含 `invokeKey` 等机密（hello 断言
`!("invokeKey" in appInfo)`）。

# 命令一览

`plugin:app|*` 共 **13 条**：`name`、`version`、`tauri_version`、
`get_config`、`identifier`、`bundle_type`、
`supports_multiple_windows`、`show`、`hide`、`set_dock_visibility`、
`default_window_icon`、`fetch_data_store_identifiers`、
`remove_data_store`。完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
