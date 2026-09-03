---
title: 安全模型
---

Ztron 沿用 Tauri v2 的 ACL（访问控制列表）模型：**默认全拒**，前端能
调用的每个命令、能访问的每条路径/URL 都必须在 capability 中显式授权。

## Capability 文件

`capabilities/*.json` 在应用启动时自动加载（默认目录
`./capabilities`）。摘自 `examples/hello/capabilities/main.json` 头部：

```json
{
  "identifier": "main",
  "description": "Main window: core + path + fs + http + os + store + log + shell.",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "path:default",
    "fs:write-default",
    "fs:allow-copy",
    "fs:allow-rename",
    "fs:allow-stat",
    "fs:allow-make-dir",
    "http:default",
    "os:default",
    "store:write",
    "log:default",
    "shell:default",
    "updater:default",
    "sql:default",
    "autostart:default",
    "window-state:write",
    "single-instance:default",
    "websocket:default",
    "local-ip:default",
    "network:default",
    "upload:default",
    "persisted-scope:default",
    "fs:allow-watch",
    "fs:allow-read-file",
    "fs:allow-write-file"
  ]
}
```

`identifier` 是 capability 的名字，`windows` 声明它授权给哪些窗口
label，`permissions` 是权限串列表。

## 权限串格式

权限串统一为 `plugin:permission` 两段式——插件（或 `core`）名 + 具体
权限。例如 `fs:allow-read-file` 只授权 fs 插件的 readFile 命令；
`core:default` 是 core 命令的默认集合。未列出的命令调用会被后端拒绝，
即使该插件的 handler 已注册（验证锚点 `ACL_DENY_OK`）。

## Scope：三种约束模型

权限之外，涉及文件/网络的插件还有 scope 约束，均摘自 hello 的
`src/main.ts`：

- **PathScope**（fs/store/sql 等）：路径通配模式。
  `fsPlugin({ scope: psScope })`，其中持久化基线 `scope: { allow: ["$TMP/**"] }`
  ——只允许临时目录及子树。
- **HttpScope**（http/updater）：URL 模式。
  `httpPlugin({ scope: { allow: [{ url: "https://api.github.com/*" }, { url: "http://localhost:*/*" }] } })`。
  越界 URL 直接拒绝（验证锚点 `HTTP_SCOPE_DENY_OK`）。
- **store scope**：store 插件自身也有路径白名单。
  `storePlugin({ scope: { allow: ["$TMP/**"] } })`。

## CSP

生产 CSP 通过 `app.security.csp` 配置，由框架注入页面；开发环境可用
`devCsp` 单独配置，避免开发服务器的宽松策略进入生产。旧顶层 `csp`
键仍可用，但建议迁移到 `app.security.csp`。

适用版本：`ztron 0.3.0`
