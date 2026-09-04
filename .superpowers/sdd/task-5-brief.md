### Task 5: docs start/ — `intro.md` 与 `install.md` 重写（zh/en）

**Files:**
- Modify: `docs/zh/start/intro.md`, `docs/en/start/intro.md`, `docs/zh/start/install.md`, `docs/en/start/install.md`

**Interfaces:**
- Produces: 页面结构（intro 链向 install；install 链向 quick-start）；install 提供的 export 块与 quick-start 教程引用的路径写法一致（`<repo>/native/libs/…`）
- 事实源：命令与包名以 packages/cli 实际为准（`ztron init/dev/build/check/codegen/doctor`；`@zturnlibs/ztron-cli`）

- [ ] **Step 1: 重写 `docs/zh/start/intro.md`**

````markdown
---
title: 简介
---

# Ztron 是什么

Ztron 是一个 **Tauri 式跨平台桌面框架，用纯 TypeScript 重写**：~2MB 的
[txiki.js](https://txikijs.org) 运行时 + 系统 WebView。原生窗口、托盘、菜单、
对话框与 25 个官方插件，全部通过你熟悉的 Tauri 兼容 API 使用。

架构一句话：极小的原生 host（C，负责 WebView 与 GUI）+ 异步 TypeScript 后端
（txiki.js，负责 IPC / 插件 / ACL），前端就是普通 Vite 页面。

熟悉 Tauri？API 直接对齐——`invoke` / `listen` / `fs` / `window` 全在
[`@zturnlibs/ztron-api`](/start/quick-start)，差异清单见
[从 Tauri 迁移](/guide/tauri-migration)。

**下一步：[前置条件与安装](/start/install)**
````

- [ ] **Step 2: 重写 `docs/zh/start/install.md`**

````markdown
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
````

- [ ] **Step 3: 写 `docs/en/start/intro.md` 与 `docs/en/start/install.md`（英文镜像）**

结构、标题层级、代码块与 zh 逐段对应（文案英译；命令/包名/路径不译）。en intro 结尾链接 `/start/install`，install 结尾链接 `/start/quick-start`；表内平台行：`macOS | Apple Silicon (verified)`；doctor 输出示例写 `doctor: OK`。

- [ ] **Step 4: 双语门禁 + 构建**

Run: `pnpm --dir docs run check:locales:deploy && pnpm --dir docs run build 2>&1 | tail -2`
Expected: `OK — zh/en trees match`；构建成功

- [ ] **Step 5: Commit**

```bash
git add docs/zh/start/intro.md docs/zh/start/install.md docs/en/start/intro.md docs/en/start/install.md
git commit -m "docs(start): tauri-style intro + prerequisites/install journey (zh/en)"
```

---

