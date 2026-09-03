---
title: 结构化日志（log）
---

# 概述

`log` 模块提供**结构化日志**：trace/debug/info/warn/error 五级，由
后端 `logPlugin`（译自 `tauri-plugin-log`，P21 v2）分发到多个目标：
`stdout` / `stderr` / `file`（带轮转）/ `webview`。前端既可以直接发起
日志（`logger.*`），也可以用 `attachConsole` 订阅后端推来的记录
（webview 目标），或用 `attachLogger` 挂纯前端的 sink（只收本页面
发起的 `log*` 调用）。

```ts
import { logger, attachConsole, attachLogger } from "@zturnlibs/ztron-api/log";
import type { LogLevel, LogSink } from "@zturnlibs/ztron-api/log";
```

# 权限与 Scope

插件由 `logPlugin(options)` 构造，选项：

| 选项 | 缺省 | 说明 |
| --- | --- | --- |
| `level` | `"info"` | 最低发出级别（trace < debug < info < warn < error） |
| `targets` | `["stdout"]` | 输出目标；`file` 写 `<logDir>/<fileName>`，`webview` 把每条记录推给 `addPluginListener('log','log',…)` 订阅者 |
| `logDir` | 平台日志目录 | macOS 为 `~/Library/Logs/<identifier>`，与 `plugin:path|app_log_dir` 一致 |
| `fileName` | `<identifier>.log` | Tauri LogDir 语义 |
| `rotationStrategy` | `"keepAll"` | `keepAll` 时间戳备份 / `keepOne` 单个 `.old` |
| `maxFileSize` | `100_000` | 轮转阈值（字节）；达到即先轮转再追加 |

权限只有一个单条许可 `log:default`（覆盖全部 8 条命令），hello 示例
即声明它。注意命令名带 `|`（`plugin:log|__listener`）走
`addPluginListener` 契约而非命名事件——命名事件名不允许 `|`。

# 示例

后端注册：三目标 + keepOne 轮转 + 400 字节小上限（让 12 条压力行
触发多次轮转）。摘自 `examples/hello/src/main.ts`（注释保留、
有删节）：

```ts
.plugin(
  logPlugin({
    level: "trace",
    targets: ["stdout", "file", "webview"],
    rotationStrategy: "keepOne",
    // Small cap so the spike's 12 pressure lines force several rotations.
    maxFileSize: 400,
  }),
)
```

前端直接发日志 + `attachConsole` 订阅 webview 目标。摘自
`examples/hello/frontend/src/main.ts`（锚点 `LOG_OK`、`LOG_WEBVIEW_OK`
为其真实运行输出，注释保留、有删节）：

```ts
// 5e. log plugin
await logger.info("spike: log plugin test from frontend");
report("LOG_OK");

// 13. log plugin v2: webview target round trip via attachConsole, ...
let logEcho: string | null = null;
const unlistenLog = await attachConsole({
  logger: (m) => {
    if (m.includes("spike-log-webview")) logEcho = m;
  },
});
await invoke("plugin:log|info", { message: "spike-log-webview" });
```

轮转验证：日志文件在 fs scope 之外（log 插件自己拥有那个目录），
所以 hello 用受信后端命令 `m3:log-rotation` 读当前文件与 `.old`
备份的大小，`LOG_ROTATE_OK:420->242` 是真实运行输出（keepOne 只留
`.log` + `.log.old`；hello 启动时还会清掉上次运行的陈旧日志，保证
轮转断言确定性）。

# 命令一览

`plugin:log|*` 共 **8 条**：

| 命令 | API |
| --- | --- |
| `log` | `log(level, message)`（`logger.log`） |
| `trace` / `debug` / `info` / `warn` / `error` | 同名便捷函数（`logger.trace` … `logger.error`） |
| `__listener` | 内部：`addPluginListener` 注册（`attachConsole` 依赖） |
| `__unlistener` | 内部：注销上述监听 |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/log)。

适用版本：`ztron 0.3.0`
