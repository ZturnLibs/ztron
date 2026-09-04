---
title: 持久化作用域（persisted-scope）
---

# 概述

`persisted-scope` 模块让 fs 的**作用域允许列表跨重启存活**：用户在
运行期（如通过保存对话框）授权的路径被并进 allowlist，重启后依然
有效。它是 Tauri 的 `tauri-plugin-persisted-scope` 的移植，由
`plugin:persisted-scope|*` 命令支撑。插件构造时创建一个
`PathScope`，从 JSON 文件加载额外的 allow 条目；`save` 命令把合并
后的 allowlist（基线 + 持久化条目）写回文件。与 fs 的接法是共享
同一个作用域实例：`fsPlugin({ scope: psPlugin.scope })`。

```ts
import { getPersistedScope, savePersistedScope, persistedScope } from "@zturnlibs/ztron-api/persisted-scope";
```

# 权限与 Scope

persisted-scope 是**独立插件**，权限只有两条：

| 权限 | 授予内容 |
| --- | --- |
| `persisted-scope:default` | `allow-get` + `allow-save`（读/写合并后的 allowlist） |

摘自 `examples/hello/capabilities/main.json`：
`"persisted-scope:default"`。

构造参数：`persistedScopePlugin({ file, scope })`——`file` 是持久化
JSON 的路径；`scope` 是基线 PathScope 配置（**始终允许**，不会被
移除）。hello 的基线是 `$TMP/**`，spike 中再长出
`$HOME/ztron-persisted-spike/**`（见 [文件系统](/plugins/fs)）。

**种子竞态**（P8 修复，注释摘自 `examples/hello/src/main.ts`）——
预置的 allow 条目必须在插件构造**之前**写完，因为插件在构造函数里
加载文件；fire-and-forget 的写入与加载竞速，冷启动时（文件还没
落盘）会输：

```ts
// Persisted-scope: base fs scope is $TMP/**; pre-seed an extra allow entry so
// the spike can prove a path outside $TMP is granted after a "restart".
// NOTE: the seed must complete BEFORE the plugin is constructed — the plugin
// loads the file in its constructor; a fire-and-forget write here races the
// load and loses on a cold start (file not yet there → scope not applied).
await tjs.writeFile(
  `${tjs.tmpDir}/ztron_persisted_scope.json`,
  new TextEncoder().encode(
    JSON.stringify({ allow: ["$HOME/ztron-persisted-spike/**"] }),
  ),
);

const persisted = persistedScopePlugin({
  file: `${tjs.tmpDir}/ztron_persisted_scope.json`,
  scope: { allow: ["$TMP/**"] },
});
const psScope = persisted.scope;
```

# 示例

前端验证持久化条目已加载、且 fs 能写在基线之外的路径。摘自
`examples/hello/frontend/src/main.ts`（锚点 `PERSISTED_SCOPE_OK` 为
其真实运行输出，注释保留、有删节）：

```ts
// 1g. persisted-scope: pre-seeded allow entry is loaded + grants a path
// outside the base scope ($HOME/...), and fs.write succeeds there.
const merged = await getPersistedScope();
const hasPersisted = merged.allow.some((a) =>
  a.includes("ztron-persisted-spike"),
);
await fs.makeDir("$HOME/ztron-persisted-spike", { recursive: true });
await fs.writeText("$HOME/ztron-persisted-spike/ok.txt", "persisted-ok");
const back = await fs.readText("$HOME/ztron-persisted-spike/ok.txt");
if (hasPersisted && back === "persisted-ok") {
  report("PERSISTED_SCOPE_OK");
}
```

`savePersistedScope()` 把当前合并 allowlist 写回 `file`（返回
`{ saved: true }`）；运行期新增条目走 fs 作用域的动态扩充接口
（`scope.addAllow`），再由 `save` 落盘。

# 命令一览

`plugin:persisted-scope|*` 共 **2 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `get` | `getPersistedScope()`（`{ allow: string[] }`） |
| `save` | `savePersistedScope()`（`{ saved: boolean }`） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/persisted-scope)。

适用版本：`ztron 0.3.1`
