---
title: Showcase 演示应用
---

# Showcase：在交互式演示里认识 Ztron

前置：完成[安装](/start/install)（`ztron doctor` 全绿）。

Showcase 是一个可直接运行的桌面应用，把 Ztron 的能力做成 **34 张可交互卡片**：
每张卡的按钮都会真实调用对应 API——打开原生对话框、读写剪贴板、创建第二个窗口、
切换应用主题、无边框化窗口……结果就地显示，卡片上同时给出该功能的最小代码片段
和跳转文档站的直达按钮。它对标 Electron API Demos，是「玩中学」的第一入口。

## 运行

在仓库根目录（需已完成[安装](/start/install)的原生链构建）：

```bash
git clone https://github.com/ZturnLibs/ztron.git && cd ztron  # 已 clone 可跳过
pnpm install
pnpm --filter @zturnlibs/ztron-example-showcase dev
```

原生窗口出现「Ztron Showcase」即成功。前端改动即时热重载；打包发布用 `ztron build`。

## 界面导览

- **左侧栏**：8 个分类（核心、窗口、文件、网络、对话框与通知、菜单与托盘、数据、
  系统集成），点击分类切换到对应卡片；
- **卡片三区**：
  1. **交互区**——按钮与输入框，点击即真实执行；
  2. **结果输出区**——成功绿色、失败红色；权限被 ACL 拒绝、网络不可达等错误会
     原样显示（这本身就是排错教学）；
  3. **代码区**——该功能的最小用法，右上角「复制」按钮用的是 Ztron 自己的
     剪贴板 API；
- **「文档」按钮**——每张卡右上角，直达本站对应文档页。

## 34 张卡片一览

| 分类 | 卡片数 | 看点 |
| --- | --- | --- |
| 核心 | 4 | invoke（含 codegen 类型绑定）、事件、Channel 流式 |
| 窗口 | 5 | 窗口控制、多窗口、显示器与事件、**主题切换与跟随系统**、**无边框窗口** |
| 文件 | 3 | 文本/二进制读写、目录与系统路径、fs.watch |
| 网络 | 3 | http.fetch、流式下载 fetchStream、WebSocket |
| 对话框与通知 | 4 | open/save、message/ask/confirm、系统通知、剪贴板 |
| 菜单与托盘 | 3 | 应用菜单、托盘 TrayIcon、全局快捷键 |
| 数据 | 3 | Store 键值、SQLite、结构化日志 |
| 系统集成 | 9 | 应用/系统信息、shell、opener、单实例、deep-link、自启、窗口状态、网络、更新器 |

## 建议先玩的两张卡

- **窗口 → 主题切换与跟随系统**：点「浅色」整个界面即时切换配色；点「跟随系统」
  后去 系统设置 → 外观 切换深浅，页面会实时跟随——对应 `Window.setTheme()` 与
  CSS `prefers-color-scheme` 两层机制；
- **窗口 → 无边框窗口**：标题栏消失、红绿灯移位、点击穿透、拖动区……每个效果
  几秒后自动恢复，放心点。

## 作为项目模板

showcase 本身就是一个标准 ztron 应用：`ztron.conf.json`（声明式窗口）、
`capabilities/default.json`（ACL 权限清单）、`src/commands.ts` + `ztron codegen`
（类型安全命令绑定）。它与 `ztron init` 生成的骨架同构，新项目可直接参照。
源码：[`examples/showcase/`](https://github.com/ZturnLibs/ztron/tree/main/examples/showcase)。

## 回归门禁

```bash
cd examples/showcase && ztron check --expect SHOWCASE_OK
```

以「34 张卡全部渲染 + 上报」作为冒烟检查（exit 0），可用于 CI。

**深入：[快速开始](/start/quick-start) · [示例源码目录](/start/examples) · [IPC](/guide/ipc) · [安全 ACL](/guide/security)**
