---
title: 打开器（opener）
---

# 概述

`opener` 模块用**系统默认应用**打开 URL 或路径、在文件管理器中
**定位显示**某个条目——`@tauri-apps/plugin-opener` JS 绑定的移植
（`shell.open` 的后继者），镜像 `plugin:opener|*`。三个函数：

- `openUrl(url, openWith?)`：默认（或指定）应用打开 URL；
- `openPath(path, openWith?)`：默认（或指定）应用打开文件/目录；
- `revealItemInDir(path)`：文件管理器中显示该条目并选中
  （macOS `open -R`、Windows `explorer /select,`；Linux `xdg-open`
  无法选中，退化为打开所在目录）。

平台启动器：macOS `open`、Windows `cmd /c start`、Linux
`xdg-open`。

```ts
import { openUrl, openPath, revealItemInDir } from "@zturnlibs/ztron-api/opener";
```

# 权限与 Scope

插件由 `openerPlugin(options)` 构造，唯一选项 `urlSchemes`：
`open_url` 允许的 scheme 白名单（缺省 `["http", "https", "mailto"]`，
大小写不敏感）；URL 的 scheme 不在名单内即抛
`opener: URL scheme not allowed: <url>`。`open_path` 要求**绝对
路径**（`/...` 或 `C:\...`），否则拒绝。成功时命令返回
`{ opened: true }` / `{ revealed: true }`。

权限串四条：`opener:allow-open-url` /
`opener:allow-open-path` / `opener:allow-reveal-item-in-dir`，
外加一条反向的 `opener:deny-open-url`（拒绝 open_url，用于在
继承集里显式收窄）；前三者聚合为 `opener:default` 集。hello 示例
**未**注册此插件（其"打开 URL"场景由 `shell.open` 覆盖并验证），
这里如实说明：无 hello spike 锚点。

# 示例

hello 未覆盖此模块，以下为签名级示例（与
`packages/api/src/opener.ts` 逐字对齐）：

```ts
await openUrl("https://tauri.app");                 // 缺省 scheme 白名单内
await openUrl("mailto:hi@example.com");             // mailto 同样放行
await openPath("/Users/me/report.pdf");             // 默认应用打开
await openPath("/Users/me/report.pdf", "Preview");  // 指定应用（macOS: open -a）
await revealItemInDir("/Users/me/report.pdf");      // Finder 中选中
await openUrl("file:///etc/hosts");                 // 拒绝：file 不在缺省白名单
```

`shell.open`（[命令执行 shell](/plugins/shell)）只验证 http(s) 且
拒绝 `file://`；opener 则把 scheme 白名单做成构造选项、并提供
路径打开与 reveal——两者互补而非重复。

# 命令一览

`plugin:opener|*` 共 **3 条**：

| 命令 | API |
| --- | --- |
| `open_url` | `openUrl` |
| `open_path` | `openPath` |
| `reveal_item_in_dir` | `revealItemInDir` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/opener)。

适用版本：`ztron 0.3.1`
