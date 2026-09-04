---
title: 前置条件与安装
---

# 前置条件

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS | Apple Silicon（已验证） | Intel 机型未验证，可尝试但如遇问题请提 issue |
| Node.js | ≥ 20 | docs 工程与部分脚本以此为准 |
| pnpm | 9 | workspace 解析依赖 pnpm |
| Xcode Command Line Tools | 需要 | `scripts/build-native.sh` 编译原生链（tjs + ztron-host + webview 库）使用系统编译器 |

Windows/Linux 目前仅有 host 骨架（编译通过），尚不可用于开发或打包，也不承诺发布时间。

# 获取源码与安装依赖

```bash
git clone https://github.com/ZturnLibs/ztron.git
cd ztron
pnpm install
```

# 构建原生链

```bash
scripts/build-native.sh                 # builds tjs + ztron-host + webview lib (macOS)
```

首次构建耗时较长（需编译 txiki.js 与原生宿主）；之后仅在相关源码变更时才需重跑。

# 构建 workspace 包

```bash
pnpm build
```

该命令生成 `packages/*/dist`，之后 CLI 才可用（以 `node packages/cli/dist/index.js …` 形式调用）。

# 重要限制：目前需在 monorepo 内使用

`@zturnlibs/ztron-*` 系列包当前以 `workspace:` 协议解析，因此 `ztron init` 脚手架创建的新项目必须位于本 monorepo 内，才能正确解析依赖。发布管线已就绪（打 tag 触发 `publish.yml`，发布到 GitHub Packages）；解除此限制后本节将随之更新。

适用版本：`ztron 0.3.1`
