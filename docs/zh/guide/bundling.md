---
title: 打包与分发
---

`ztron build` 把应用产成可分发的产物：macOS 上是 `.app` 与 `.dmg`，
其余平台目标是真实工具链消费的控制文件/清单骨架。本页以
`packages/cli/src/index.ts` 的 `buildApp` 实际流程为准。

## ztron build 做了什么

按顺序执行四步（摘自 `packages/cli/src/index.ts` 的 `buildApp`/
`packMacApp`）：

1. **前端构建**：vite 以 `base: "./"`、IIFE 输出构建 `frontend/` 到
   `dist/`，并把 `<script type="module">` 改写为 classic script
   （`file://` 下 module 脚本因 null origin 触发 CORS 失败）；随后按
   配置注入 CSP `<meta>`（缺省内置 DEFAULT_CSP）。invoke key 经
   ztron vite 插件烘焙进页面。
2. **后端打包**：esbuild 把入口（缺省 `src/main.ts`）bundle 为
   `.ztron/app.mjs`（externalize `tjs:*`，内联 sourcemap）。
3. **编译后端**：`tjs compile` 产出独立可执行文件 `ztron-backend`。
4. **组装 .app**：写 `Contents/Info.plist`、拷贝 host 与 webview
   dylib、现场编译 Mach-O launcher、拷贝前端产物与图标，然后
   codesign（见下）。

macOS 之外（Linux/Windows）当前只做目录布局：Linux 为 `dist/<appName>/`，
Windows 分支目前硬编码 `dist/ZtronApp/`（不随 `appName` 变化）；目录下放
`ztron-host` + webview 库 + `frontend/`。

## .app 结构

```text
ZtronApp.app/
  Contents/
    Info.plist            CFBundleExecutable = ztron（launcher）
    MacOS/                ztron（Mach-O launcher）、ztron-host、libwebview*.dylib
    Resources/            ztron-backend、frontend/、AppIcon.icns
```

两处刻意安排摘自 `packages/cli/src/index.ts`（P17 签名链修复）：

> NOTE: it goes to RESOURCES, not MacOS — tjs-compiled binaries fail
> codesign strict validation, and a nested resource binary stays outside
> the app's main signature chain (the launcher spawns it from there).

即 `ztron-backend` 放在 `Resources/` 而非 `MacOS/`：tjs 编译产物过不了
codesign strict 校验，作为资源文件即可置身主签名链之外。主执行档是由
`native/host/launcher_macos.c` 现场编译的 Mach-O launcher（内嵌
invoke key）——shell 脚本当 CFBundleExecutable 无法通过签名。launcher
依次拉起 `ztron-host`（读取其 `PORT=`）与 `Resources/ztron-backend`。

## DMG

`.app` 完成后默认产出 `dist/<appName>.dmg`（`ZTRON_NO_DMG=1` 可关）：
staging 目录放入 `.app` 与指向 `/Applications` 的符号链接（经典拖拽
安装布局），再以 `hdiutil create -format UDZO`（zlib 压缩）制成镜像，
卷名即应用名。

## bundle.* 配置

全字段表见[配置参考](/reference/config)。与 build 行为直接相关的：

| 字段 | 作用 |
| --- | --- |
| `bundle.active` | 是否启用打包步骤（声明性字段；当前 build 流程未读取该开关，总是执行打包） |
| `bundle.targets` | 额外打包目标：`"all"` 或 `nsis/msi/appimage/deb/rpm`（数组或逗号分隔字符串） |
| `bundle.icon` | PNG 路径，供 portable packers 使用（`.app` 的 AppIcon.icns 当前取 CLI 自带的 `assets/app-icon.png`） |
| `bundle.resources` | 随包分发的附加资源 |

`targets` 的 Windows/Linux 目标由各 packer 生成真实工具链消费的控制
文件/脚本（`.nsi`、`.wxs`、AppDir、`DEBIAN/`、`.spec`）；本机没有对应
工具链时报告 `built:false` 与确切原因，而不是静默失败。注意 hello
示例的 `ztron.conf.json` 目前没有 `bundle` 段——不配置时 build 照常
产出 `.app` + `.dmg`，`targets` 只影响附加产物。`.app` 名取 `appName`
（缺省 `ZtronApp`，去除空白与非常规字符）；packers 的 productName 取
`productName ?? appName`。

## 签名现状

- **ad-hoc 签名：已自动。** `ZTRON_SIGN_IDENTITY` 未设置时以 `-` 为
  identity：先签 `MacOS/ztron-host`，再签整个 bundle——产物在本机可
  直接运行，无 Gatekeeper 弹窗。
- **Developer ID 签名与公证：未完成。** 代码路径（`macSignAndNotarize`，
  环境变量 `ZTRON_SIGN_IDENTITY` / `ZTRON_NOTARY_APPLE_ID` /
  `ZTRON_NOTARY_TEAM_ID`）已写，但尚未在真实 Apple 开发者身份下验证；
  仓库 README 的 Remaining 一节如实列有 "Developer ID signing /
  notarization"（见 <https://github.com/ZturnLibs/ztron#readme>）。
  分发到其他机器仍需自行完成 Developer ID 签名与公证。

适用版本：`ztron 0.3.1`
