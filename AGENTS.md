# AGENTS.md

Ztron 项目级约定，供 ZCode/agent 在每个会话自动加载。

## 参考代码（只读，绝对禁止修改）

- **路径**：`/Users/zyj/Zturn/tauri`
- **用途**：上游 Tauri v2 源码（`tauri-apps/tauri`），作为 Ztron 翻译/对齐
  Tauri 能力时的**只读参考**。
- **硬性约束（任何情况下都适用）**：
  - ❌ 绝不修改、删除、移动该目录下的任何文件。
  - ❌ 绝不在该目录内执行写入操作（`git commit`、`git checkout`、`git stash`、
    `git clean`、`touch`、重命名、生成文件等一律禁止）。
  - ❌ 绝不在该目录运行可能产生副作用的命令（构建、安装依赖、格式化写入等）。
  - ✅ 只允许**只读**操作：阅读、`grep`、`rg`、`find`、`git log/show/blame`、
    复制片段到剪贴板/到 Ztron 目录等。
- **理由**：该目录是干净的参考基准，污染它会破坏后续所有能力对齐工作。

> 简记：tauri 目录 = 只读字典，不是工作区。所有产出都写进 Ztron 自己的仓库。
