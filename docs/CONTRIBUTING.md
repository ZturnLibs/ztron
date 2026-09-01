# 文档贡献规范（docs/CONTRIBUTING.md）

Ztron 文档站的双语写作与内容规范。所有文档改动（新增页面、修订、翻译）都必须遵循本规范。

## 1. 双语流程

- **zh 为正典（canonical），en 为镜像**：先在 `zh/` 完成写作与事实校对，再同步到 `en/`。结构必须逐文件对应。
- 本地必过结构一致性检查：

  ```bash
  pnpm --dir docs run check:locales
  ```

- `--deploy` 为发布门禁（除结构一致外，还检测占位页）：

  ```bash
  pnpm --dir docs run check:locales:deploy
  ```

- 占位页约定：暂未翻译的 en 页面可在**正文首行**标记 `<!-- i18n:untranslated -->`（不会被 `check:locales` 普通模式拦截），但**发布前必须清零**——`--deploy` 模式下任何残留占位标记都会导致失败。

## 2. 术语表

中英对照统一使用下表（类型名 / 命令名等英文原文不译）：

| 中文 | 英文 | 备注 |
| --- | --- | --- |
| 命令 | command | `invoke` 不译 |
| 能力 | capability | ACL 语境 |
| 作用域 | scope | `PathScope`/`HttpScope` 类型名不译 |
| 窗口 | window | `WebviewWindow` 类型名不译 |
| 托盘 | tray | |
| 更新器 | updater | |
| 打包 | bundling / packaging | |
| 回归检查 | regression run | `ztron check` 语境 |
| 侧边栏 / 导航 | sidebar / navbar | |

## 3. 代码示例规则

- 优先从 `examples/hello`、`examples/multiwin`（以及探查类示例 `examples/menuprobe`）摘取**可运行片段**，并在示例旁注明来源路径。
- 不得凭空编写示例代码；仓库中不存在的 API 用法不得出现在文档里。

## 4. 能力主张规则

- 任何"Ztron 已支持 X"的能力主张必须带**验证锚点**（如 `FS_WATCH_OK`）。
- 锚点语义以仓库根 `README.md` 的状态表为准；未通过验证的能力只能标注为规划中 / 实验性。

## 5. 版本标注

- 每个页面末行固定格式标注适用版本：

  ```
  适用版本：`ztron x.y.z`
  ```

- API 行为发生变更的 PR，必须在**同一 PR** 内更新受影响文档页面的版本标注与相关描述。

## 6. frontmatter

- 仅 `title` 必填；其他字段非必需，不要引入规范之外的字段。
