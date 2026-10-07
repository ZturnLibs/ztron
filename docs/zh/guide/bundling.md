---
title: 打包与分发
---

`ztron build` 把应用产成可分发的产物：macOS 上是 `.app` 与 `.dmg`；
Windows 上是扁平应用目录 + NSIS 与 MSI 安装包（支持 Authenticode 签名）。
本页以 `packages/cli/src/index.ts` 的 `buildApp` 实际流程为准。

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

macOS 之外，Windows 分支（`packWindowsApp`）组装扁平的 `dist/<appName>/`
目录：`ztron-launcher.exe`（MSVC 编译的 GUI 子系统可执行文件；无 MSVC 时
回退 `ztron-launcher.cmd`）、`ztron-host.exe`、WebView2 加载器库、
`ffi-8.dll`、tjs 编译的 `ztron-backend.exe`、`frontend/` 与暂存的
conf/capabilities——全部并排存放，因为 host 从自身目录解析
`webview.dll`、后端从自身目录解析 `ffi-8.dll`。Linux 目前仍只产出
`dist/<appName>/` 目录布局。

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

## Windows 安装包（NSIS / MSI）

`bundle.targets` 含 `nsis` 和/或 `msi` 时，`packWindowsApp` 把扁平目录
交给对应 packer：

- **NSIS**（`packNsisDir`）：产出完整 `.nsi`（per-user 安装、开始菜单与
  桌面快捷方式指向 launcher、卸载器、带 bundle 图标的"添加/删除程序"
  条目），并在找到 `makensis` 时直接运行（`ZTRON_MAKENSIS` 可覆盖；会
  探测 `where makensis` 与标准 `Program Files` 位置）。脚本以带 BOM 的
  UTF-8 写出，CJK 产品名不会乱码。
- **MSI**（`packMsiDir`）：产出完整 `.wxs`（per-user 安装到
  `%LOCALAPPDATA%`、递归组件树、快捷方式、HKCU"添加/删除程序"条目），
  并在找到 `candle + light` 时直接运行（`ZTRON_WIX` 指向 WiX v3
  binaries 目录；WiX v4 的单一 `wix build` 命令不在此列）。UpgradeCode
  由 bundle identifier 确定性派生，跨版本升级原位替换文件，无需额外
  配置。

本机没有对应工具链时，packer 仍会写出可直接运行的脚本/定义并报告
`built:false` 与确切原因，而不是静默失败。

## bundle.* 配置

全字段表见[配置参考](/reference/config)。与 build 行为直接相关的：

| 字段 | 作用 |
| --- | --- |
| `bundle.active` | 是否启用打包步骤（声明性字段；当前 build 流程未读取该开关，总是执行打包） |
| `bundle.targets` | 额外打包目标：`"all"` 或 `nsis/msi/appimage/deb/rpm`（数组或逗号分隔字符串） |
| `bundle.icon` | PNG 路径，供 portable packers 使用（`.app` 的 AppIcon.icns 当前取 CLI 自带的 `assets/app-icon.png`；Windows 上 `.ico` 条目供 NSIS/MSI 安装包图标使用） |
| `bundle.resources` | 随包分发的附加资源 |

`targets` 的 Linux 目标由各 packer 生成真实工具链消费的控制文件/脚本
（AppDir、`DEBIAN/`、`.spec`）；Windows 的 `nsis`/`msi` packer 在工具链
存在时直接运行真实工具链（如上所述）。注意 hello 示例的
`ztron.conf.json` 目前没有 `bundle` 段——不配置时 build 照常产出
`.app` + `.dmg`（macOS）或扁平目录（Windows），`targets` 只影响附加
产物。`.app` 名取 `appName`（缺省 `ZtronApp`，去除空白与非常规字符）；
packers 的 productName 取 `productName ?? appName`。

## 签名现状

- **macOS ad-hoc 签名：已自动。** `ZTRON_SIGN_IDENTITY` 未设置时以 `-`
  为 identity：先签 `MacOS/ztron-host`，再签整个 bundle——产物在本机可
  直接运行，无 Gatekeeper 弹窗。
- **Developer ID 签名与公证：未完成。** 代码路径（`macSignAndNotarize`，
  环境变量 `ZTRON_SIGN_IDENTITY` / `ZTRON_NOTARY_APPLE_ID` /
  `ZTRON_NOTARY_TEAM_ID`）已写，但尚未在真实 Apple 开发者身份下验证。
  分发到其他机器仍需自行完成 Developer ID 签名与公证。
- **Windows Authenticode：已支持。** NSIS/MSI 打包完成后，
  `signWinArtifact` 在配置了证书时用 `signtool` 签名安装包：
  `ZTRON_SIGN_PFX`（+ `ZTRON_SIGN_PASSWORD`）或证书库 SHA1 指纹
  `ZTRON_SIGN_THUMBPRINT`；`ZTRON_SIGN_TS_URL` 附加 RFC3161 时间戳。
  `signtool` 经 `ZTRON_SIGNTOOL`、`where signtool` 或 Windows Kits 目录
  定位。未配置证书时产物不签名并报告确切原因。

适用版本：`ztron 0.3.13`
