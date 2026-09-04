---
title: 系统通知（notification）
---

# 概述

`notification` 模块发送**系统级通知**并管理通知授权。它是 Tauri 的
`tauri-plugin-notification` 的移植，由内建的
`plugin:notification|*` 命令支撑。macOS 侧走 UNUserNotificationCenter
（P22 重写：macOS 11 移除了 NSUserNotificationCenter，旧路径发送是
静默无操作），权限询问是**带结果**的 C block 调用。

```ts
import { sendNotification, isPermissionGranted, requestPermission, notification } from "@zturnlibs/ztron-api/notification";
```

# 权限与 Scope

notification 属于**框架内建命令**：`plugin:notification|send`、
`is_permission_granted`、`request_permission` 随内建命令注册进权限表，
由 `core:default` 集统一授予。不需要插件构造、没有 scope。注意
**OS 层授权**与 capability 授权是两回事：即便 capability 放行，首次
`requestPermission()` 仍会触发系统的授权弹窗。

# 示例

发送即 resolve（投递本身由 OS 决定）。摘自
`examples/hello/frontend/src/main.ts`（锚点 `NOTIFICATION_OK` 为其真实
运行输出）：

```ts
// 6d. notification (send resolves; delivery is OS-level)
await sendNotification({ title: "Ztron", body: "hello-notification" });
report("NOTIFICATION_OK");
```

权限流（摘自同文件）：先查授权，未授予则请求；权限完成回调在 WebKit
队列上到达，所以 spike 用超时兜底，避免 dev 裸二进制里一个无人应答的
系统弹窗卡住整个流程（锚点 `NOTIF_PERM_OK:<bool>`）：

```ts
// Permission completions arrive on a WebKit queue; race with a timeout
// so a stuck UNUserNotificationCenter (e.g. an unanswered OS prompt in
// the dev binary) cannot hang the run.
const granted = await Promise.race([
  isPermissionGranted(),
  new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
]);
let permState = String(granted);
if (!granted) {
  permState = String(
    await Promise.race([
      requestPermission(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]),
  );
}
report("NOTIF_PERM_OK:" + permState);
```

P22 记录了 dev 裸二进制的降级行为：`NOTIF_PERM_OK:false`（无 bundle
身份时授权不可用）；打包成 .app 后才有真正的 UN 通知。

# 命令一览

`plugin:notification|*` 共 **3 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `send` | `sendNotification` |
| `is_permission_granted` | `isPermissionGranted` |
| `request_permission` | `requestPermission` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/notification)。

适用版本：`ztron 0.3.1`
