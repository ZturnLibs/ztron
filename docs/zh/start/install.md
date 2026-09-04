---
title: 前置条件与安装
---

# 前置条件

| 依赖 | 要求 | 说明 |
| --- | --- | --- |
| macOS | Apple Silicon（已验证） | Intel 未验证，可尝试；Windows/Linux 仅有 host 骨架，暂不可用 |
| Node.js | ≥ 20 | |
| pnpm | 9 | 构建原生链与示例使用 |
| Xcode Command Line Tools | 需要 | 编译原生链（txiki.js + ztron-host + webview 库） |

# 第 1 步：安装 CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

> 包同时发布在 GitHub Packages。若 npmjs 不可用，可在 `~/.npmrc` 写入
> `@zturnlibs:registry=https://npm.pkg.github.com` 与
> `//npm.pkg.github.com/:_authToken=<你的 GitHub PAT>` 后再安装。

# 第 2 步：获取原生链（一次性）

原生链 = `tjs` 运行时 + `ztron-host`（原生窗口宿主）+ webview 动态库，
当前需从源码编译一次（约几分钟，仅首次与上游变更后需要）：

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # 产出 native/libs/{tjs,ztron-host,libwebview.dylib}
```

# 第 3 步：指向原生链

把下面三行写进 `~/.zshrc`（路径按你的 clone 位置调整）：

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```

# 第 4 步：体检

```bash
ztron doctor
```

五行全 PASS、输出 `doctor: OK` 即装好。任何 FAIL 都带修复提示。

**下一步：[快速开始](/start/quick-start)**
