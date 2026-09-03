---
title: 移动端插件一览（mobile）
---

# 概述

本页合并说明五个**移动端方向**的插件：`barcode-scanner`（扫码）、
`biometric`（生物识别）、`geolocation`（定位）、`haptics`（触感反馈）、
`nfc`（近场通信）。它们对应的上游插件（ML Kit / VisionKit /
CoreMotion / NFC 等）是**移动端专属**；Ztron 按 GAP E3–E7（G12 移动
插件桩）把**命令面**移植到位，让 API 形态与上游对齐，但桌面运行时
上每条命令都**确定性地失败关闭（fail-closed）**：抛 `PluginUnavailable`
错误（消息形如
`plugin:<名>|<命令> is unavailable on this platform (mobile-only
upstream surface; ported for parity)`）。

这是刻意设计：调用者拿到的是**有文档、可断言的确定性拒绝**，而不是
静默的假成功。等移动端宿主落地（用户提供环境）后按同一命令面回填真
实现——各插件选项里已预留 `bridge` 字段作为未来移动宿主桥的挂点。
hello 示例未注册这五个插件，本页无 spike 锚点（如实说明）。

```ts
import { scanBarcode } from "@zturnlibs/ztron-api/barcode-scanner";
import { authenticate, biometricStatus } from "@zturnlibs/ztron-api/biometric";
import { getCurrentPosition, watchPosition, clearWatch } from "@zturnlibs/ztron-api/geolocation";
import { impactOccurred, notificationOccurred, selectionChanged } from "@zturnlibs/ztron-api/haptics";
import { nfcScan, nfcWrite, nfcStop } from "@zturnlibs/ztron-api/nfc";
```

# 权限与 Scope

五个插件各自随命令注册 `<插件>:allow-<命令>` 权限串，并聚合为
`<插件>:default` 集（描述统一为 "Command surface parity; fails
closed off-platform."）。没有 scope。注意：权限被授予只意味着命令
**可达**，命令体在桌面运行时依旧抛 `PluginUnavailable`——授权与平台
能力是两回事。另外 `biometric` 在 macOS 上以 LAContext 实现 Touch
ID 是 GAP E4 记录在案的可选升级，当前未实现。

# 示例

hello 未覆盖这五个模块，以下为签名级示例（与
`packages/api/src/*.ts` 逐字对齐），演示"命令面已就位、桌面端拒绝"
的实际形态：

```ts
import { scanBarcode } from "@zturnlibs/ztron-api/barcode-scanner";

try {
  const value = await scanBarcode(); // 桌面端：Promise reject（PluginUnavailable）
} catch (e) {
  // e.message: plugin:barcode-scanner|scan is unavailable on this platform
  //            (mobile-only upstream surface; ported for parity)
}

// 其余函数同形：args?: Record<string, unknown> 可选参数预留
await biometricStatus();        // → { available: boolean }（仅移动宿主上）
await getCurrentPosition();     // → { coords: { latitude, longitude, accuracy } }
const wid = await watchPosition(); // → watch id（字符串）
await clearWatch();             // 结束监听
await impactOccurred();         // 触感三连：碰撞 / 通知 / 选择变化
await nfcScan();                // → 标签内容（字符串）
```

# 命令一览

五个插件共 **12 条**命令，全部为桩状态（off-platform fail-closed）：

| 插件 | 命令 | API |
| --- | --- | --- |
| `barcode-scanner` | `scan` | `scanBarcode` |
| `biometric` | `authenticate` / `status` | `authenticate` / `biometricStatus` |
| `geolocation` | `get_current_position` / `watch_position` / `clear_watch` | `getCurrentPosition` / `watchPosition` / `clearWatch` |
| `haptics` | `impact_occurred` / `notification_occurred` / `selection_changed` | `impactOccurred` / `notificationOccurred` / `selectionChanged` |
| `nfc` | `scan` / `write` / `stop` | `nfcScan` / `nfcWrite` / `nfcStop` |

完整清单见[命令参考](/reference/commands)与各模块的
[API 符号参考](/reference/api)（barcode-scanner / biometric /
geolocation / haptics / nfc）。

适用版本：`ztron 0.3.0`
