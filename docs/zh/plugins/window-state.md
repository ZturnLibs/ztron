---
title: 窗口状态（window-state）
---

# 概述

`window-state` 模块把**当前窗口的几何状态**持久化到 JSON 并在启动时
恢复：位置（x/y）、大小（width/height）与最大化/全屏/置顶三个布尔
标志。它是 Tauri 的 `tauri-plugin-window-state` 的翻译版，由
`plugin:window-state|*` 命令支撑。三条命令：`get`（读持久化状态，
没有则 null）、`save`（快照当前几何并返回）、`restore`（恢复持久化
状态，没有时不作为）。

```ts
import { getWindowState, saveWindowState, restoreWindowState, windowState } from "@zturnlibs/ztron-api/window-state";
```

# 权限与 Scope

window-state 是**独立插件**，两级权限集：

| 权限集 | 授予内容 |
| --- | --- |
| `window-state:default` | `allow-get` + `allow-restore`（读 + 启动恢复） |
| `window-state:write` | default + `allow-save`（写快照） |

摘自 `examples/hello/capabilities/main.json`：
`"window-state:write"`。

构造参数：`windowStatePlugin({ file?, restoreOnStartup? })`——`file`
是状态 JSON 的绝对路径（默认 `$TMP/ztron-window-state.json`）；
`restoreOnStartup` 默认 true（插件 setup 后延迟一个 tick 自动恢复），
hello spike 里显式关掉以便手动验证。摘自
`examples/hello/src/main.ts`：

```ts
.plugin(
  windowStatePlugin({
    file: `${tjs.tmpDir}/ztron_window_state_test.json`,
    restoreOnStartup: false,
  }),
)
```

恢复顺序有讲究（DESIGN §30）：webview 库每次 `set_size` 都会重新
居中窗口，所以宿主**先应用大小、后应用位置**，再按需补
maximized/fullscreen/alwaysOnTop。

# 示例

save → 移动 → restore 的往返验证。摘自
`examples/hello/frontend/src/main.ts`（锚点
`WINDOW_STATE_PLUGIN_OK` 为其真实运行输出）：

```ts
// 6c. window-state plugin (save -> move -> restore -> verify)
const savedState = await saveWindowState();
await setPosition(savedState.x + 40, savedState.y + 40);
await restoreWindowState();
const restoredPos = await getPosition();
if (
  restoredPos &&
  Math.abs(restoredPos.x - savedState.x) <= 3 &&
  Math.abs(restoredPos.y - savedState.y) <= 3
) {
  report("WINDOW_STATE_PLUGIN_OK:" + savedState.x + "," + savedState.y);
}
```

`WindowState` 形状：`{ x, y, width, height, maximized, fullscreen,
alwaysOnTop }`；`getWindowState()` / `restoreWindowState()` 在没有
状态文件时返回 `null`。三个函数都接受 `{ file }` 覆盖默认路径。

# 命令一览

`plugin:window-state|*` 共 **3 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `get` | `getWindowState(options?)` |
| `save` | `saveWindowState(options?)` |
| `restore` | `restoreWindowState(options?)` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/window-state)。

适用版本：`ztron 0.3.0`
