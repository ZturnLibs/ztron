---
title: 网络信息（network）
---

# 概述

`network` 模块查询本机网络出口：`getLocalIpv4()`（主接口 IPv4）、
`getLocalIpv6()`（主接口 IPv6）、`getPublicIp()`（公网 IPv4，离线或服务
不可达时为 `null`）。三条查询都是纯命令调用，由 `plugin:network|*` 支撑
（对齐 `tauri-plugin-network`）。

```ts
import { network } from "@zturnlibs/ztron-api/network";
// 或从主入口：import { network, getNetworkIpv4, getLocalIpv6, getPublicIp } from "@zturnlibs/ztron-api";
```

> 主入口把 `network.getLocalIpv4` 以 **`getNetworkIpv4`** 的名字再导出，
> 避免与 `local-ip` 模块的同名 `getLocalIpv4` 冲突；子路径
> `@zturnlibs/ztron-api/network` 下保持原名。

# 权限与 Scope

权限：`network:allow-get-local-ipv4`、`network:allow-get-local-ipv6`、
`network:allow-get-public-ip`，权限集 **`network:default`**。无 scope
约束——插件零参构造。摘自 `examples/hello/src/main.ts`：

```ts
.plugin(networkPlugin())
```

capability 中对应条目为 `"network:default"`。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（锚点 `NETWORK_OK` 为其真实
运行输出；IPv4 是确定性断言，IPv6/公网仅作信息记录）：

```ts
// 1e2. network (ipv4 deterministic; ipv6/public best-effort info)
const net4 = await getNetworkIpv4();
const net6 = await getLocalIpv6();
const pub = await getPublicIp();
if (net4) {
  report(
    "NETWORK_OK:" + net4 + ":" + (net6 ?? "none") + ":" + (pub ?? "none"),
  );
}
```

三个函数都 resolve `string | null`——不抛网络异常，拿不到就给 `null`，
调用方按可缺省信息处理即可。

# 命令一览

`plugin:network|*` 共 **3 条**：

| 命令 | API |
| --- | --- |
| `get_local_ipv4` | `getLocalIpv4()` |
| `get_local_ipv6` | `getLocalIpv6()` |
| `get_public_ip` | `getPublicIp()` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/network)。

适用版本：`ztron 0.3.0`
