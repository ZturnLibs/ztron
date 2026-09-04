---
title: 持久化键值存储（store）
---

# 概述

`store` 模块提供**持久化键值存储**：状态以 JSON 文件落盘，跨重启可用。
它镜像 `plugin:store|*` 命令（G9/D2 资源模型，译自
`tauri-plugin-store` v2），API 分两层：

- **v1 路径键面**：`get`/`set`/`remove`/`keys`/`values`/`entries`/
  `clear` 七个函数（以 `store` 命名空间导出），直接以文件路径寻址
  （字节兼容保留）；
- **v2 `Store` 类**（上游风格）：`Store.load` 显式装载实例，带
  autoSave、变更监听（Channel 推送）、`reset`/`save`/`saveTo`/
  `setAutoSave`/`close` 生命周期，与 v1 函数面操作同一批文件。

```ts
import { store, Store } from "@zturnlibs/ztron-api/store";
import type { StoreChangeEvent } from "@zturnlibs/ztron-api/store";
```

# 权限与 Scope

插件由 `storePlugin(options)` 构造，选项：

| 选项 | 说明 |
| --- | --- |
| `scope` | store 文件的 `PathScope`（如 `{ allow: ["$APPDATA/**"] }`；缺省 `{ allow: ["**"] }`） |
| `baseDir` | 相对路径的基准目录（缺省 `tjs.tmpDir`） |

路径越界时后端拒绝并报 `store scope denied: <abs>`。权限串三层：
`store:read`（get/keys/values/entries）、`store:write`（read +
set/delete/clear/save_store）、`store:default`（再加
load/save/save_to/reset/close/set_auto_save 生命周期面，共 11 条
许可）。hello 示例声明的是 `store:write`。注意：`on_change` 不在
`store:default` 内——需要单独声明 `store:allow-on-change`，否则
`plugin:store|on_change` 会被 ACL 拒绝。

# 示例

后端注册（scope 限定 `$TMP/**`）。摘自
`examples/hello/src/main.ts`（注释保留）：

```ts
.plugin(storePlugin({ scope: { allow: ["$TMP/**"] } }))
```

前端 v1 函数面：写值再读回。摘自
`examples/hello/frontend/src/main.ts`（锚点 `STORE_OK` 为其真实运行
输出，注释保留、有删节）：

```ts
// 5d. store plugin (KV persistence)
const tmp = await os.tmpdir();
const storePath = `${tmp}/ztron_store_test.json`;
await store.clear(storePath);
await store.set(storePath, "greeting", "hello-store");
const val = await store.get<string>(storePath, "greeting");
if (val === "hello-store") report("STORE_OK:" + val);
```

v2 `Store` 类（签名级示例，hello 未覆盖；与上游 `tauri-plugin-store`
v2 同形）：

```ts
const st = await Store.load("$TMP/app-state.json", { autoSave: true });
await st.set("counter", 1);
const unlisten = await st.onChange((e) => {
  // e: { event: "set" | "delete"; key; value? } | { event: "reset"; key: null }
});
await st.save();      // 无视 autoSave 立即落盘
await st.close();     // 冲刷（autoSave）并卸载实例
```

注意一个真实分歧：`Store#onChange` 返回的"取消监听"函数目前是
no-op（上游也没有按监听器退订；语义随 `close` 走）——包内源码注释
原样声明了这一点。

# 命令一览

`plugin:store|*` 共 **16 条**：

| 命令 | API |
| --- | --- |
| `get` / `set` | `store.get` / `store.set`（`Store#get` / `Store#set`） |
| `has` | `Store#has`（v1 函数面无此函数） |
| `delete` | `store.remove`（`Store#delete`；命令名是 delete，函数名叫 remove） |
| `keys` / `values` / `entries` | `store.keys` / `store.values` / `store.entries`（实例同名方法） |
| `clear` | `store.clear`（仅清内存快照，不落盘不发事件；要持久化的清空用 `reset`） |
| `save_store` | v1 的立即落盘（`store:write` 内） |
| `load` / `close` | `Store.load` / `Store#close`（close 冲刷后卸载实例与监听） |
| `save` / `save_to` | `Store#save` / `Store#saveTo` |
| `reset` | `Store#reset`（清空、推送 reset 事件、按 autoSave 持久化） |
| `set_auto_save` | `Store#setAutoSave` |
| `on_change` | `Store#onChange`（Channel 推送 set/delete/reset） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/store)。

适用版本：`ztron 0.3.1`
