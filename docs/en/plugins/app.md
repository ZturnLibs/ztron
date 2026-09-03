---
title: App（app）
---

# Overview

The `app` module provides application metadata and whole-app lifecycle
control: name/version/identifier/bundle-format queries, multi-window
support, whole-app show/hide and the macOS Dock icon toggle — a port of
`@tauri-apps/api/app`. The module exports standalone functions plus an
aggregate object `app` (e.g. `app.getName`).

```ts
import { getName, getConfig } from "@zturnlibs/ztron-api/app";
// or from the main entry: import { app } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

app is a framework built-in: its `plugin:app|*` commands are granted by
the **`core:default`** permission set in a capability; individual
`core:allow-app_<underscored_cmd>` permissions (e.g.
`core:allow-app_get_config`) grant single commands. No scope.

# Example

From `examples/hello/frontend/src/main.ts` (verification anchors
`APP_OK`, `APP_CONFIG_OK`, `APP_LIFECYCLE_OK`):

```ts
import {
  getName, getVersion, getConfig, getIdentifier,
  getBundleType, supportsMultipleWindows,
  setDockVisibility, hideApplication, showApplication,
} from "@zturnlibs/ztron-api";

const appName = await getName();          // "com.ztron.hello" (falls back to the identifier)
const version = await getVersion();       // "0.1.0"
const info = await getConfig();           // { identifier, appName?, version? }, secrets stripped
const ident = await getIdentifier();      // "com.ztron.hello"
const btype = await getBundleType();      // "App" inside an .app bundle or in dev
const multiWin = await supportsMultipleWindows();

// Whole-app lifecycle (macOS)
await setDockVisibility(false); await setDockVisibility(true);
await hideApplication(); await showApplication();
```

`getConfig()` never contains secrets such as `invokeKey` (hello asserts
`!("invokeKey" in appInfo)`).

# Commands

`plugin:app|*` totals **13 commands**: `name`, `version`,
`tauri_version`, `get_config`, `identifier`, `bundle_type`,
`supports_multiple_windows`, `show`, `hide`, `set_dock_visibility`,
`default_window_icon`, `fetch_data_store_identifiers`,
`remove_data_store`. Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.0`
