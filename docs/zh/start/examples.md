---
title: 示例
---

仓库 `examples/` 目录下有三个可运行示例，均可用 pnpm filter 直接运行：

| 名称 | 包名 | 演示内容 | 运行命令 |
| --- | --- | --- | --- |
| hello | `@zturnlibs/ztron-example-hello` | invoke/事件/Channel/fs/path 等 API 全面演练（86 检查） | `pnpm --filter @zturnlibs/ztron-example-hello dev` |
| multiwin | `@zturnlibs/ztron-example-multiwin` | 多窗口：conf 声明 + 运行时 WebviewWindow 创建/销毁 | `pnpm --filter @zturnlibs/ztron-example-multiwin dev` |
| menuprobe | `@zturnlibs/ztron-example-menuprobe` | 菜单能力探测 | `pnpm --filter @zturnlibs/ztron-example-menuprobe dev` |

## hello

对 `@zturnlibs/ztron-api` 的 invoke、事件、Channel 流、fs/path/http/os 等 API 做全面演练，内置 86 项确定性检查；配合 `ztron check` 可作为整框架的回归基线（`FULL_OK`，exit 0）。其 `ztron.conf.json` 同时演示了声明式多窗口（`windows[]`，含 `url: "frontend"` 占位与内联 `html` 两种窗口来源）。源码：`examples/hello/`（配置 `ztron.conf.json`、主进程 `src/main.ts`、命令 `src/commands.ts`、前端 `frontend/src/main.ts`）。

## multiwin

演示多窗口两种方式：在 `ztron.conf.json` 的 `windows[]` 中静态声明，以及运行时通过 `WebviewWindow` 创建/销毁窗口（验证锚点 `MULTI_WINDOW_OK`，运行时创建的第二个窗口真实创建并销毁，`SECOND_WINDOW_OK label=second`）。源码：`examples/multiwin/`。

## menuprobe

菜单能力探测示例，覆盖菜单构建与动态操作等能力。源码：`examples/menuprobe/`。

各示例均依赖 monorepo 内的 workspace 包，需先完成[安装](/start/install)与原生链构建。

适用版本：`ztron 0.3.0`
