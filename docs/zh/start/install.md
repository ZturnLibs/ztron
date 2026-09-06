---
title: 前置条件与安装
---

# 前置条件

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS | Apple Silicon（已验证） | Intel 未验证，可尝试；Windows/Linux 仅有 host 骨架，暂不可用 |
| Node.js | ≥ 20 | |

# 第 1 步：安装 CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

安装时会自动带上与你的平台匹配的**预编译原生链**（`tjs` 运行时 + `ztron-host`
原生窗口宿主 + webview 动态库，约 2MB）——无需 clone 仓库，无需编译，无需配置
环境变量。

> 包同时发布在 GitHub Packages。若 npmjs 不可用，可在 `~/.npmrc` 写入
> `@zturnlibs:registry=https://npm.pkg.github.com` 与
> `//npm.pkg.github.com/:_authToken=<你的 GitHub PAT>` 后再安装。

# 第 2 步：体检

```bash
ztron doctor
```

五行全 PASS、输出 `doctor: OK` 即装好。任何 FAIL 都带修复提示。

**下一步：[快速开始](/start/quick-start)**

# 附：从源码构建原生链（贡献者 / 备用）

仅当你要修改原生层，或预编译包不可用时才需要。额外前置：pnpm 9、
Xcode Command Line Tools（编译 txiki.js + ztron-host + webview 库）。

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # 产出 native/libs/{tjs,ztron-host,libwebview.dylib}
```

让 CLI 使用它，二选一：

- 项目放在 ztron clone 目录之内（CLI 会向上自动找到 `native/libs/`）；或
- 把下面三行写进 `~/.zshrc`（路径按你的 clone 位置调整）：

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```
