# Ztron 移动平台设计（对齐 Tauri v2 移动能力）

> 状态：设计稿（待评审后拆 P-M0 实施计划）· 分支 feat/mobile-platform-plan · 2026-10-03
> 事实源：tauri 2.12.1（`/Users/zyj/Zturn/tauri` 只读调研，wry 0.57/cargo-mobile2 0.22）+ ztron 本仓原生依赖核查

## 0. 结论先行

移动端是可行的，且 ztron 有一项 Tauri 没有的结构性优势：**后端是 TypeScript**。
Tauri 每个插件的移动面都要写 Kotlin + Swift 双实现（PluginManager + 注解反射框架，
`crates/tauri/mobile/android`、`mobile/ios-api`）；ztron 的命令走 JSON 线协议，
后端命令面（packages/core 的 31 个插件）**零改动跨端**——移动原生侧只需要：① 一个
WebView 宿主 + IPC 桥，② 渐进实现的原生能力命令。代价集中在三块硬骨头：
tjs 移动交叉编译、WebView 宿主层（webview C API 的移动 shim）、CLI 工程生成与编排。

## 1. 可行性事实（已核实）

| 事实 | 证据 | 影响 |
|---|---|---|
| txiki.js 官方 CI 交叉编译 Android（arm64-v8a/x86_64，NDK，API 28+） | `native/txiki.js/.github/workflows/ci.yml:180-205` | Android 编译路径有上游先例 |
| **tjs 的 Android CI 明确 `-DBUILD_WITH_FFI=OFF`（"NDK ships no libffi"）** | 同上注释 | ztron 硬依赖 tjs:ffi（build-native.sh 注释："an ffi-less tjs kills every app"）→ 必须自编 libffi for Android（libffi 支持 android target，vcpkg 亦有 port）|
| txiki.js 无 iOS CI/构建先例（本 checkout 内） | workflows 全量核查 | iOS 交叉编译是**最大技术风险**，P-M0 必须先行尖峰；QuickJS 纯解释器无 JIT，iOS 合规面有利（App Store 已有 QuickJS 应用先例）|
| vendored webview 库只有 3 个桌面后端（cocoa/gtk/win32），无移动后端 | `native/webview/core/include/webview/detail/backends/` | 移动宿主层需 ztron 自建（见 §3 D2）|
| ztron host 平台层已抽象（host.c 共享 586 行 + 平台文件 521-3709 行 + HostPlatformOps vtable） | `native/host/` | 移动平台 = 新增 host_ios / host_android，共享协议/分发不动 |
| ztron 桥是 postMessage 式（`webview_bind("__ZTRON_IPC__")` + 注入 bootstrap） | runtime-ffi/inject | 与移动 WebView 的标准通道同构（Tauri 报告：Android 因读不到自定义协议 POST body 全量走注入对象）|
| 桌面是两进程模型（ztron-host GUI 进程 + tjs 后端进程，TCP/stdio） | CLI dev 流程 | 移动必须**单进程**：libtjs 以静态库嵌入 host，通道改进程内（见 §3 D3）|
| ztron 已有 5 个移动插件 API 面（barcode/biometric/geolocation/haptics/nfc，桌面 fail-closed） | packages/core/src/plugins/ | 移动插件激活有现成挂点，且 api 文档/前端面已就绪 |

## 2. Tauri 移动架构 → Ztron 映射

| Tauri（已调研） | Ztron 移动等价物 | 备注 |
|---|---|---|
| Rust core：Android cdylib(.so)+JNI 宏 / iOS staticlib(libapp.a)+`start_app` C 符号 | **libtjs + ztron-host 合体静态库/动态库**：iOS 静态库（arm64 device+sim），Android .so（JNI） | tjs 嵌入 API 天然存在（txiki 本身是 C 库）；无需宏/绑定生成器 |
| TauriActivity(WryActivity) + WebView / XcodeGen 工程 + main.mm | `ZtronActivity`(Kotlin) + android.webkit.WebView；iOS WKWebView 宿主（host_ios 直接 ObjC） | ztron 不需要 tao/wry 级别的窗口库——移动端只有一个全屏 webview |
| PluginManager(Kotlin/Swift)+注解反射+Invoke/Channel 类型系 | **不需要**：ztron 命令本就走 JSON 线协议，宿主只做通用转发 | 结构性简化；原生命令按 ztron Msg 协议直接实现 |
| ipc://localhost fetch + window.ipc 注入双通道 | ztron 现有 bind 桥 → iOS WKScriptMessageHandler / Android addJavascriptInterface | shim 层职责（D2）|
| gen/android（Gradle+buildSrc RustPlugin+BuildTask 回调）/ gen/apple（project.yml+preBuildScript） | `ztron ios/android init` 生成**最小**工程模板（对齐产物清单见附录 A，首期裁剪）| |
| options server（jsonrpsee WS，IDE↔CLI 配置传递） | **首期偏差**：不建 WS server；dev 配置经生成的构建脚本入参/环境文件直传 | 记录为后续项（IDE 双向协作是二阶段需求）|
| dev：局域网 IP 改写 + adb reverse + tauri:// 反代 dev server | 同策略：模拟器 adb reverse；真机局域网 IP；首期 WebView 直接加载 devUrl（无反代），ztron:// 资产协议二阶段 | |
| 插件移动面（Kotlin Gradle 子工程/SwiftPM + Cargo links 注入 + manifest/plist 幂等改写） | 移动插件=host 侧新命令分支 + AndroidManifest/Info.plist 模板直写（首期无编译期注入框架）| 5 个现成 fail-closed 插件逐个激活 |
| bundle>android/ios 配置段（minSdk/versionCode/developmentTeam/infoPlist…） | ztron.conf.json 新增 `bundle.ios`/`bundle.android` 同形字段 | 语义对齐，字段按首期需要裁剪 |

## 3. 关键架构决策

- **D1 目标顺序：iOS 先行**。理由：ztron 原生代码已是 Cocoa 系（host_macos 3709 行的 objc 模式可大量复用到 host_ios）；WKWebView 与 macOS 同引擎；XcodeGen 工程生成比 Android Gradle 生态简单；本机（macOS 26 + Xcode）可直接跑 iOS 模拟器闭环。Android 随后（JNI/Gradle 复杂度更高且 FFI 有前置项）。
- **D2 WebView 宿主层 = "webview C API 移动 shim"**。runtime-ffi（TS）只依赖 webview C API（create/bind/return/navigate/eval/set_size/set_html/get_native_handle/set_scheme_handler/dispatch/destroy…）。桌面由 vendored webview 库提供；移动由 ztron 自写 `webview_shim_ios`（ObjC，WKWebView+WKScriptMessageHandler+WKURLSchemeHandler 实现 ztron://）与 `webview_shim_android`（JNI + WebView + addJavascriptInterface + shouldInterceptRequest）满足**同一 C API**。TS 层零改动，hello spike 的 check 哨兵体系可直接复用为移动验收（`IOS_OK`/`ANDROID_OK`）。
- **D3 单进程模型**。libtjs 静态链接进移动 host；desktop 的两进程 TCP 通道抽象为 transport 接口（进程内 ring/队列或 Unix domain socket），backend.ts 由嵌入式 tjs 解释器执行（tjs-compiled bundle 已有先例：打包链把 backend 编成 ztron-backend）。host.c 的行协议（Msg JSON）不动。
- **D4 移动宿主语言**：iOS 纯 ObjC（与 host_macos.c 同模式，无 SwiftPM 依赖）；Android 最小 Kotlin Activity（模板生成）+ C 宿主（JNI）。避免 Tauri 的双语言注解框架。
- **D5 验收体系**：沿用 spike 哨兵模式——移动端 hello 跑 `ztron check` 子集（PORT→backend connected→frontend reported 标签），CI 逐步接模拟器（iOS: macos runner xcodebuild test；Android: ubuntu runner gradle connectedAndroidTest 可后置）。

## 4. 分阶段路线图（每阶段独立可验证）

### P-M0 可行性尖峰（1 轮，本机完成，无设备依赖）
- **S1 iOS 交叉编译**：xcodebuild/cmake 交叉编译 libtjs（arm64 iphoneos + arm64 simulator）静态库；BUILD_WITH_FFI=ON 需 libffi iOS 交叉（its configure 支持；备选：iOS 首期若无 libffi，评估把 webview shim 改为 tjs 扩展模块而非 ffi —— 决策点，尖峰产出）。验收：两个 .a 产物 + 符号表含 tjs 入口。
- **S2 Android 交叉编译**：NDK 自编 libffi → libtjs + host.c+host_android stub 链接为 .so。验收：.so 产物 + `Java_..._ZtronMain` JNI 符号。
- **S3 单进程嵌入尖峰**：host 进程内调 libtjs 跑最小 backend.ts（echo 命令回环），验证 transport 抽象。验收：桌面进程内先验证（不需要移动设备）。

### P-M1 iOS 纵切（首个端到端）
- host_ios.m + webview_shim_ios：WKWebView 全屏 + IPC 桥 + ztron:// 资产协议；hello app 前端 + invoke/event/channel 回环。验收：模拟器上 `IOS_OK` 哨兵（check 子集）。
- 含：权限桥移动面（camera/mic 在 iOS 的 WKUIDelegate 同款方法——本仓 macOS 权限实现的同族 API）。

### P-M2 iOS CLI（`ztron ios init/dev/build/run`）
- init：XcodeGen project.yml 最小模板（附录 A 裁剪版）；dev：simctl 启模拟器 + 局域网 devUrl + 日志管道；build：xcodebuild → .app/.ipa（签名沿用用户证书，无证书给模拟器包）；run：simctl install+launch。验收：真机/模拟器一键 `ztron ios dev`。

### P-M3 Android 纵切
- webview_shim_android（JNI）+ ZtronActivity 模板 + ANDROID_OK 哨章。

### P-M4 Android CLI（`ztron android init/dev/build/run`）
- Gradle 最小模板 + adb 编排（reverse/安装/日志）。

### P-M5 移动插件激活（5 个 fail-closed → live）
- 顺序按用户价值：geolocation → haptics → biometric → barcode-scanner → nfc；每个 = host 命令分支 + 权限进 manifest/plist + spike 标签。

### P-M6 对齐收尾
- bundle.ios/android 配置段、移动权限 API 汇入、docs/ROADMAP/api-zh、CI 矩阵（ios 模拟器 job；android 后置）。

## 5. 风险与开放问题

| # | 风险/问题 | 等级 | 缓解 |
|---|---|---|---|
| R1 | tjs iOS 交叉编译无先例（含 libffi iOS） | 高 | P-M0 S1 尖峰先行；备选路线：无 FFI 时 webview 走 tjs 原生扩展模块（改变 D2 实现层但不改架构）|
| R2 | Android libffi/FFI 链 | 中 | libffi 官方支持 android；ztron build-native.sh 已有 vcpkg libffi 先例（Windows）|
| R3 | webview C API shim 的 surface 膨胀 | 中 | 按 hello spike 命令集渐进；shim 内未实现项显式报错而非静默 |
| R4 | 单进程对 host.c/CLI 的重构范围 | 中 | transport 接口先行（S3 桌面验证），桌面行为不回归 |
| R5 | iOS 签名/公证（用户侧条件） | 中 | 模拟器路径全绿后真机按用户证书；CI 用模拟器 |
| R6 | App Store 审核（嵌入式解释器） | 低 | QuickJS 无 JIT；有先例（QuickJS 系应用已上架）|
| R7 | dev 热更新体验（移动端无 HMR 直连反代） | 低 | 首期整页 reload；tauri:// 反代 dev server 记为后续 |

## 6. 与 Tauri 的刻意偏差（诚实清单）

1. 无 options server（IDE↔CLI WS）——首期配置直传；IDE 深度协作后置。
2. 无 Kotlin/Swift 插件注解框架——ztron 命令线协议天然跨端，原生侧按 Msg 协议直写。
3. 移动 dev 首期 WebView 直连 devUrl（无 tauri:// 反代层）。
4. Tauri 的 android env 自举（自动下载 SDK/NDK）后置——首期要求环境已装（doctor 检测）。
5. 模板产物远小于 Tauri（附录 A 列差异），首期"最小可用"而非"IDE 全功能"。

## 附录 A：模板产物对照（首期裁剪基准）

Tauri gen/android（≈20 文件含 buildSrc RustPlugin/BuildTask）→ ztron 首期：settings.gradle + app/build.gradle.kts（无 buildSrc，JNI 合库由 externalNativeBuild 或预置 .so）+ AndroidManifest + ZtronActivity.kt + res 图标。
Tauri gen/apple（project.yml+Podfile+main.mm+bindings+Assets+ExportOptions）→ ztron 首期：project.yml（无 Podfile，纯静态库链接）+ main.m（start_ztron()）+ Info.plist 模板 + Assets 占位。

## 附录 B：移动 IPC 桥要点（来自 Tauri 调研的坑）

- Android WebView 拦截自定义协议**读不到 fetch POST body** → 全量走注入对象（ztron 本就是注入桥 ✓）。
- iOS WKScriptMessageHandler 需在页面初始化脚本里显式 `window.webkit.messageHandlers.__ZTRON_IPC__.postMessage(...)` —— inject bootstrap 需要平台探测分支。
- dev 真机必须局域网 IP（iOS 尤甚）；模拟器用端口反向（adb reverse / simctl 无需）。
