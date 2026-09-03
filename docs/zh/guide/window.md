---
title: 窗口
---

Ztron 支持两种创建窗口的方式：声明式（配置驱动，应用启动时由
`AppBuilder.fromConfig` 应用启动状态）与运行时（通过 `WebviewWindow`
编程创建/销毁）。

## 声明式：ztron.conf.json 的 windows[]

摘自 `examples/hello/ztron.conf.json` 的双窗配置——main 窗通过
`url: "frontend"` 占位符加载 Vite 前端，conf-second 窗直接内联 HTML：

```json
{
  "windows": [
    {
      "label": "main",
      "title": "Ztron M3",
      "width": 900,
      "height": 640,
      "minWidth": 400,
      "minHeight": 300,
      "url": "frontend",
      "titleBarStyle": "visible",
      "resizable": true
    },
    {
      "label": "conf-second",
      "title": "From Config",
      "width": 360,
      "height": 240,
      "html": "<p style=\"font-family:system-ui\">declared in ztron.conf.json</p>",
      "resizable": false,
      "alwaysOnTop": true,
      "x": 120,
      "y": 120
    }
  ]
}
```

字段与 Tauri 的 `WindowConfig` 启动状态对齐；`url: "frontend"` 在 dev
流程解析为开发服务器/构建产物，其他字符串按绝对 URL 加载，省略时回落
到内联 HTML。验证锚点：`CONF_WINDOW_OK:From Config`（P14）。

## 运行时：WebviewWindow

`@zturnlibs/ztron-api` 提供 `WebviewWindow` 类，可在应用运行中创建与销毁
窗口（multiwin 示例以此做 10 次创建/销毁压力测试）。runtime 创建的
窗口同样进入 host 的 webview 注册表，具备 label 路由、per-window 事件
与关闭时的注册表清理。验证锚点：

- `SECOND_WINDOW_OK label=second` —— hello 示例在运行中真实创建并销毁
  了一个 runtime 窗口（P9）
- `MULTI_WINDOW_OK`（P6）—— 多窗架构：host webview 注册表 + label 路由
  + `WebviewWindow`

## 窗口能力一览

窗口状态（尺寸/位置/最小尺寸约束/可最小化等）、透明度、透明、装饰、
`titleBarStyle`、dock 进度/角标、`setTheme`、监视器查询
（`availableMonitors` 等）与全部 13 个窗口事件均已可用（见
[事件与 Channel](/guide/events)）；关键验证锚点：`WIN_STATE_OK`、
`WIN_EVENT_OK`、`WIN_V2_EXTRAS_OK`、`MONITORS_OK`。

## 平台边界注记

运行时多窗创建在 macOS 已解锁，但 webview 库在运行循环（run loop）中
对第二个 webview 的创建有过阻塞历史，修复过程（含引擎析构 UAF 的 lib
补丁）记录在 `DESIGN.md` §75。

适用版本：`ztron 0.3.0`
