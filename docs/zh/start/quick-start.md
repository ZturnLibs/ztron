---
title: 快速开始
---

# 跑通 hello（10 分钟）

前置：完成[前置条件与安装](/start/install)（原生链与 workspace 包均已构建）。

```bash
cd examples/hello
node ../../packages/cli/dist/index.js dev
```

`dev` 的行为：先用 Vite 构建前端，再拉起 `ztron-host`（原生窗口）并启动 tjs backend 连接；原生窗口出现即成功。

回归检查（解析应用上报的检查项，`FULL_OK` + 0 FAIL 才 exit 0）：

```bash
node ../../packages/cli/dist/index.js check
```

`check` 会输出全部检查项统计，hello 示例为 `86 checks passed (FULL_OK)`。也支持 `--expect TAGS` 钉住必需标签、`--timeout ms` 限定时长。

# 打包应用

```bash
node ../../packages/cli/dist/index.js build
```

产出独立可执行文件与 `.app`（ad-hoc 签名）。

# 创建自己的项目（monorepo 内）

```bash
node packages/cli/dist/index.js init my-app   # scaffolds src/main.ts + frontend/
cd my-app
node ../packages/cli/dist/index.js dev --entry src/main.ts
node ../packages/cli/dist/index.js codegen    # typed invoke bindings for your commands
```

`init` 脚手架生成 `src/main.ts` 与 `frontend/`；`codegen` 为你的命令生成类型化 invoke 绑定。注：目前新项目需位于 monorepo 内（`@zturnlibs/ztron-*` 以 `workspace:` 解析），详见[前置条件与安装](/start/install)。命令详解见 [CLI 参考](/reference/cli)。

适用版本：`ztron 0.3.0`
