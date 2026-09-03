---
title: 开机自启（autostart）
---

# 概述

`autostart` 模块让应用**随系统登录自启**，译自 `tauri-plugin-autostart`
（简化版）。API 极小：`enableAutostart` / `disableAutostart` /
`isAutostartEnabled` 三个函数 + `autostart` 命名空间
（`enable`/`disable`/`isEnabled`）。平台实现：

- **macOS**：写 `~/Library/LaunchAgents/<id>.plist`（`RunAtLoad`）；
- **Linux**：写 `~/.config/autostart/<id>.desktop`；
- **Windows**：经 `reg.exe` 写 `HKCU\...\CurrentVersion\Run`。

```ts
import { autostart, enableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api/autostart";
```

# 权限与 Scope

插件由 `autostartPlugin(options)` 构造，选项：

| 选项 | 缺省 | 说明 |
| --- | --- | --- |
| `id` | `"ztron"` | 启动文件/注册表键名（建议用反域标识符） |
| `exec` | 当前可执行路径（`tjs.exePath`） | 登录时要启动的命令；打包后的 `.app`/二进制建议显式指定 |

权限串三条 `autostart:allow-enable` / `autostart:allow-disable` /
`autostart:allow-is-enabled`，聚合为 `autostart:default` 集；hello
示例声明 `autostart:default`。无 scope 概念（写的是固定的平台
自启位置）。

# 示例

后端注册。摘自 `examples/hello/src/main.ts`（注释保留）：

```ts
.plugin(autostartPlugin({ id: "com.ztron.hello" }))
```

前端完整往返：查状态 → 启用 → 复查 → 关闭。摘自
`examples/hello/frontend/src/main.ts`（锚点 `AUTOSTART_OK` 为其真实
运行输出，注释保留、有删节）：

```ts
// 5i. autostart
const wasEnabled = await isAutostartEnabled();
await enableAutostart();
const nowEnabled = await isAutostartEnabled();
await disableAutostart();
if (nowEnabled && !wasEnabled) {
  report("AUTOSTART_OK");
}
```

# 命令一览

`plugin:autostart|*` 共 **3 条**：

| 命令 | API |
| --- | --- |
| `enable` | `enableAutostart`（`autostart.enable`） |
| `disable` | `disableAutostart`（`autostart.disable`） |
| `is_enabled` | `isAutostartEnabled`（`autostart.isEnabled`） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/autostart)。

适用版本：`ztron 0.3.0`
