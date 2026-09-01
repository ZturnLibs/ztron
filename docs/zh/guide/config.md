---
title: 配置 ztron.conf.json
---

`ztron.conf.json` 是项目配置文件，由 CLI 在 dev/build 时做双层校验
（CLI fail-fast + core），经 `AppBuilder.fromConfig` 消费。hello 示例
的完整配置：

```json
{
  "entry": "src/main.ts",
  "frontend": "frontend",
  "identifier": "com.ztron.hello",
  "version": "0.1.0",
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

## 核心字段（P1 子集）

来源：`packages/core/src/app.ts` 的 `ProjectConfigFile` 接口。

| 字段 | 说明 |
| --- | --- |
| `entry` | 后端入口文件 |
| `frontend` | 前端目录 |
| `identifier` | 应用标识 |
| `productName` | `appName` 的别名（上游命名） |
| `appName` | 应用名 |
| `mainBinaryName` | 主二进制名 |
| `version` | 版本号 |
| `csp` | 旧顶层 CSP，建议改用 `app.security.csp`（两者均可） |
| `capabilities` | 旧顶层 capability 列表，建议改用 `app.security.capabilities` |
| `build.{devUrl,frontendDist,beforeDevCommand,beforeBuildCommand,beforeBundleCommand}` | 构建钩子与前端产物目录 |
| `app.{withGlobalTauri,macOSPrivateApi}` | 全局 API 注入开关、macOS 私有 API |
| `app.security.csp` / `devCsp` | 生产/开发 CSP（见[安全模型](/guide/security)） |
| `app.security.capabilities` | capability 列表（`string[] \| string`） |
| `app.security.assetProtocol.{scope,requireLiteralLeadingDot}` | 资产协议 scope |
| `app.security.freezePrototype` | 冻结原型，防篡改 |
| `bundle.{active,targets,icon,resources,category,publisher,homepage,shortDescription,longDescription,copyright,license}` | 打包元信息 |
| `plugins` | 插件配置（`Record<string, unknown>`） |
| `windows[]` | 声明式窗口启动状态（见[窗口](/guide/window)） |

## 校验行为

`validateProjectConfig`（`packages/core/src/app.ts`）：**未知顶层键告警**
（保留原值并提示 `unknown top-level key "..." (kept as-is)`）；
**类型/结构违规抛错**——例如 `build` 不是对象、`build.devUrl` 不是
字符串、`app.withGlobalTauri` 不是布尔值等均直接抛 `ztron.conf.json:
...` 错误终止。

Windows/Linux 打包目标尚未提供，本页字段均以 macOS 行为为准。

## 后续

P2 计划从 `ProjectConfigFile` 类型自动生成全量配置参考，届时本页字段
表将由生成器维护。

适用版本：`ztron 0.1.0`
