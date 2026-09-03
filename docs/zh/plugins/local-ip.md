---
title: 本机 IP（local-ip）
---

# 概述

`local-ip` 模块只做一件事：返回主接口的 IPv4 地址
`getLocalIpv4()`（`string | null`，未知/离线时为 `null`）。由单条
`plugin:local-ip|get` 命令支撑（对齐 `tauri-plugin-local-ip`）。它与
[network](/plugins/network) 的 `getLocalIpv4()` 能力重叠——local-ip 是
上游单功能插件的逐一移植，network 则把 v4/v6/公网三查询合并；按需取一
即可。

```ts
import { localIp, getLocalIpv4 } from "@zturnlibs/ztron-api/local-ip";
// 或从主入口：import { localIp, getLocalIpv4 } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`local-ip:allow-get`，权限集 **`local-ip:default`**。无 scope
约束——插件零参构造。摘自 `examples/hello/src/main.ts`：

```ts
.plugin(localIpPlugin())
```

摘自 `examples/hello/capabilities/main.json`：

```json
"local-ip:default"
```

# 示例

摘自 `examples/hello/frontend/src/main.ts`（锚点 `LOCAL_IP_OK` 为其真实
运行输出；用 IPv4 形状的正则做确定性断言）：

```ts
// 1e. local-ip (primary IPv4)
const localIp = await getLocalIpv4();
if (localIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(localIp)) {
  report("LOCAL_IP_OK:" + localIp);
}
```

返回 `null` 而非抛错：离线或无法确定主接口时调用方拿到 `null`，按可缺省
信息处理。

# 命令一览

`plugin:local-ip|*` 共 **1 条**：

| 命令 | API |
| --- | --- |
| `get` | `getLocalIpv4()` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/local-ip)。

适用版本：`ztron 0.3.0`
