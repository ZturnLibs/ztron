---
title: 调试与日志
---

本页汇总调试入口：DevTools 开关、结构化日志、`ztron check` 回归
运行器，以及几个常见坑。

## DevTools

命令是 `plugin:webview|toggle_devtools`（已含在 `core:default`）。前端
经 `@zturnlibs/ztron-api/webview` 调用：

```ts
import { Webview } from "@zturnlibs/ztron-api/webview";

const r = await Webview.getCurrent().toggleDevtools();
// { supported: boolean; platform: string; reason?: string }
```

macOS 上返回 `supported: false`——macOS WKWebView 没有公开的 devtools
开关（上游 Tauri 在 macOS 同样跳过 open_devtools），devtools 在 debug
构建中启用，宿主如实上报而不是静默失败（摘自
`packages/core/src/app.ts` 的 handler 注释，有删节）。

## 日志

log 插件（`plugin:log|*`，翻译自 `tauri-plugin-log`）有四类 target：
`stdout` / `stderr` / `file` / `webview`，按 `level` 过滤（缺省
`info`）。`file` target 落盘到平台日志目录（macOS
`~/Library/Logs/<identifier>/<identifier>.log`，与
`plugin:path|app_log_dir` 口径一致；`logDir` / `fileName` 可改），超过
`maxFileSize`（字节，缺省 100_000）即轮换：`keepAll` 生成带时间戳的
备份，`keepOne` 只留一个 `.old`。`webview` target 把每条记录经
`addPluginListener('log','log',…)` 推给前端，配合 `attachConsole()` 收。

前端 API（`@zturnlibs/ztron-api/log`）：`log` / `trace` / `debug` /
`info` / `warn` / `error`、`attachLogger`（本地 sink）、`attachConsole`。

摘自 `examples/hello/src/main.ts`（logPlugin 配置片段）：

```ts
logPlugin({
  level: "trace",
  targets: ["stdout", "file", "webview"],
  rotationStrategy: "keepOne",
  // Small cap so the spike's 12 pressure lines force several rotations.
  maxFileSize: 400,
}),
```

轮换契约的实证锚点：README P21 记录 `LOG_ROTATE_OK:420->242`（磁盘上
`.log.old` 420B > 当前 `.log` 242B，keepOne 契约）——hello 前端打 12
条压力日志后，经可信后端命令 `m3:log-rotation` 读取两个文件的大小
判定（日志目录按设计在 fs scope 之外，由 log 插件自己持有）。

## ztron check

`ztron check` 是回归运行器：走完整 dev 流程启动应用，解析其上报的
检查行——两种形态都认：hello 风格的
`[m3] frontend reported: "TAG:detail"` 与裸 `TAG_OK` / `X_FAIL` 行；
出现 `*_FAIL` / `ERROR` 或 native crash 行即记失败。**exit 0 的条件：
应用自身打出 `SPIKE_RESULT: FULL_OK` 且 0 个 FAIL**（使用 `--expect`
指定必需 tag 时，以其满足为准，可替代 FULL_OK）；`--expect`
（逗号分隔）可钉住必须出现的 tag，`--timeout`（毫秒，缺省 120000）
限定总时长。harness 的判定覆盖子进程自身的退出码。

在 hello 上（命令为真实用法，输出摘自 README P30 记录）：

```bash
ztron check --entry src/main.ts
# …
# [ztron check] 86 checks passed (FULL_OK)    # exit 0
```

多窗口示例用 `--expect` 钉住必过 tag（README P30：multiwin `--expect`
4/4，exit 0；错 tag / 超时路径 exit 1）：

```bash
ztron check --expect SECOND_WINDOW_OK,STRESS_OK
```

## 常见问题

- **通知权限在 dev 下是 false**：终端直启的裸二进制没有 bundle，通知
  走降级路径（检查锚点 `NOTIF_PERM_OK:false`，P22）；打包成 `.app`
  后才有真实的 UNUserNotificationCenter。详见[通知](/plugins/notification)。
- **改了前端没反应？** dev 优先起 Vite dev server（完整模块级 HMR）；
  无 `frontend/index.html` 或 dev server 不可用时回退 build+watch
  （near-HMR）：监听 `.ts` / `.html` / `.css` 变更 → 重建 IIFE → 写
  reload 信号文件 → 后端轮询并对页面 `eval("location.reload()")`。
- **日志文件在哪**：macOS 默认
  `~/Library/Logs/<identifier>/<identifier>.log`（hello 即
  `~/Library/Logs/com.ztron.hello/com.ztron.hello.log`），轮换备份在
  同目录。详见[日志](/plugins/log)。

适用版本：`ztron 0.3.0`
