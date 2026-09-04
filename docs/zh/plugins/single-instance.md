---
title: 单实例（single-instance）
---

# 概述

`single-instance` 模块**保证每个应用同时只有一个运行实例**
（`tauri-plugin-single-instance` 的移植），镜像
`plugin:single-instance|*`。第二个实例启动时不会各自为政：主实例
收到通知并把窗口带到前台，副实例则能查询到"我不是主实例"。

实现机制：主实例绑定一个由标识符确定性派生的回环 TCP 端口
（FNV-1a 哈希映射进 20000–60000）；副实例绑定失败，向主实例发一个
HTTP 信号，主实例随即发出 `ztron://single-instance` 事件（负载
`{ argv: string[]; cwd: string }`，argv 当前恒为空数组——源码注释
如实声明）并聚焦其 `main` 窗口。

```ts
import { singleInstance, isPrimaryInstance, onSecondInstance } from "@zturnlibs/ztron-api/single-instance";
```

# 权限与 Scope

插件由 `singleInstancePlugin(options)` 构造，唯一选项
`identifier`（反域标识符，须与 `AppBuilder(runtime, identifier)` 一致
，否则两个"不同应用"会争抢同一端口段；缺省
`"com.ztron.app"`）。无 scope。

权限串一条 `single-instance:allow-is-primary`（查询命令），聚合为
`single-instance:default` 集；hello 示例声明 `single-instance:default`
。注意 `onSecondInstance` 走事件面（`ztron://single-instance`），
事件监听属于 `core:default` 的 event 命令。

# 示例

后端注册（标识符与应用一致）。摘自
`examples/hello/src/main.ts`（注释保留）：

```ts
.plugin(singleInstancePlugin({ identifier: "com.ztron.hello" }))
```

前端查询主实例身份。摘自
`examples/hello/frontend/src/main.ts`（锚点 `SINGLE_INSTANCE_OK` 为
其真实运行输出，注释保留、有删节）：

```ts
// 11. single-instance (this process holds the lock)
const primary = await isPrimaryInstance();
if (primary) report("SINGLE_INSTANCE_OK");
```

副实例分支 + 二次启动通知（签名级示例，hello 单进程 spike 未覆盖
副实例侧；事件负载见上文）：

```ts
if (!(await isPrimaryInstance())) {
  // 我是副实例：这里通常直接退出，把控制权交给已运行的主实例。
}
await onSecondInstance(({ argv, cwd }) => {
  // 仅主实例收到；把已有窗口带到前台或处理 argv（当前恒为 []）。
  console.log("second instance:", argv, cwd);
});
```

# 命令一览

`plugin:single-instance|*` 共 **1 条**：

| 命令 | API |
| --- | --- |
| `is_primary` | `isPrimaryInstance`（`singleInstance.isPrimary`） |

事件面：`ztron://single-instance` ← `onSecondInstance`
（`singleInstance.onSecondInstance`）。

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/single-instance)。

适用版本：`ztron 0.3.1`
