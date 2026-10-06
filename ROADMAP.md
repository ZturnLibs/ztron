# Ztron ROADMAP — 能力差距与翻译路径

> Ztron 已完成 M0–M4 + P0–P30 全部可在本机验证的项(spike 86 项确定性 + FULL_OK 哨兵/EXIT 0,
> 另有 WIN_EVENT_OK/WIN_QUERY2_OK 尽力而为检查)。剩余项均需目标平台或属深水区。
> 本文件规划 Tauri v2 其余能力的翻译顺序与方式。参考源:`tauri-apps/tauri`。

## 1. 能力差距矩阵

| 维度              | Tauri v2                                                                   | Ztron 现状                          | 差距 | 翻译来源           | 改动层       |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------- | ---- | ------------------ | ------------ |
| 窗口状态          | minimize/maximize/fullscreen/always-on-top/decorations/opacity/drag-region | 全能力 + is*/outer* 查询            | ~无  | tao                | C(host)      |
| 窗口事件          | resize/move/focus/blur/close/destroyed/scale-change                        | resize/move/focus/blur/close        | ~无  | event/mod.rs       | C+core       |
| 多窗口/多 webview | WebviewWindow × N                                                          | ✅ 运行时多窗口落地(per-window 事件/close) | ~无  | wry                | C            |
| 系统集成          | tray/menu/dialog/clipboard/notification/global-shortcut                    | 全部实现                            | ~无  | 各插件 + tao       | C            |
| 自定义协议        | `ztron://` 资产服务 + 隔离                                                 | `ztron://` + convertFileSrc + HMR   | ~无  | wry scheme handler | C            |
| ACL/权限          | capabilities/permissions/scope                                             | ACL + PathScope + HttpScope + CSP   | 小   | tauri ACL crates   | core TS      |
| IPC               | invoke+channel+MessagePack+ipc-scope                                       | invoke+channel(JSON)                | 小   | ipc/mod.rs         | core TS      |
| 命令              | 宏+Result+State注入+类型生成                                               | 手动注册 + codegen                  | 小   | macros/codegen     | CLI(codegen) |
| 前端 API          | @tauri-apps/api 全量                                                       | invoke/event/channel/window/fs/path | 中   | packages/api       | api TS       |
| 插件生态          | ~30 官方插件                                                               | 25 插件                             | 小   | plugins/*          | core+api TS  |
| 配置              | tauri.conf.json schema + CSP + capabilities                                | 手写 TS                             | 中   | tauri-utils        | CLI          |
| 打包              | 7 格式+签名+updater+图标                                                   | macOS .app/.dmg/签名/公证/updater/图标;Windows 目录+NSIS+updater;Linux 骨架 | 中   | tauri-bundler      | CLI+平台脚本 |
| 测试              | tauri-driver/WebDriver + mock runtime                                      | MockRuntime + 三层覆盖率 + ztron-driver（tauri-driver 平价，v0.3.12 已发布；Windows msedgedriver 真机双腿） | 小   | tauri-driver       | CLI+core     |
| 平台              | Win/Linux/Android/iOS                                                      | macOS 完整;Windows 全能力(平台审计 22 项收官:效果/拖放/深链/权限/主题/通知/菜单/托盘事件族/badge/grab/背景色/single-instance)+NSIS/MSI 打包+Authenticode 签名;Linux 骨架 CI 编译过(runtimes 待真机);移动=P-M0 起步 | 大   | -                  | C+core       |

## 2. 关键架构决策

- **D1 原生窗口能力**:`webview/webview` C API 只到 get_native_handle。窗口状态/tray/menu 由 **host 直接调平台 API**(经 native handle:NSWindow / HWND / GTKWindow),本质是"自己写最小 tao"。**已落地**。
- **D2 多窗口**:host 自管理多 WKWebView/WebView2 实例。**已全部落地**(host 注册表 + label 路由 + WebviewWindow api + 运行时建窗;原"卡 GUI"实为 label 时序 bug,见 DESIGN.md §75)。
- **D3 自定义协议**:host 注册 `ztron://` scheme → 解锁生产资产隔离 + dev HMR(替代 file://)。**已落地**。

## 3. 分阶段路径

### P0 让它像桌面应用(C 层攻坚)

- [x] **P0.1 窗口状态 + 事件**:min/max/fullscreen/alwaysOnTop/center/focus/visible/opacity/transparent/decorations;resize/move/focus/blur/close → `ztron://*`(`WIN_STATE_OK` + `WIN_EVENT_OK` + `OPACITY_OK`/`TRANSPARENT_OK`/`DECORATIONS_OK`)
- [x] **P0.2 Tray**:host NSStatusItem/Shell_NotifyIcon → `plugin:tray|*`(`TRAY_OK`)
- [x] **P0.3 Menu**:host 菜单栏 → api `menu.ts`(`MENU_OK`)
- [x] **P0.4 Dialog**:NSOpenPanel/NSSavePanel/NSAlert → `plugin:dialog|open/save/message`(`DIALOG_REG_OK`)

### P1 最小权限模型(纯 TS)

- [x] **P1.1 Capabilities/ACL**:Capability/Permission/Set + IpcHub 门禁(`ACL_DENY_OK`)
- [x] **P1.2 CLI capabilities 自动加载**(`loadCapabilities` + `for await` 迭代器)
- [x] **P1.3 http scope**:tjs fetch + HttpScope URL allowlist(`HTTP_SCOPE_DENY_OK`)
- [x] **P1.4 CSP 注入**:build 时注入默认 CSP meta,`ztron.conf.json.csp` 可覆盖

### P2 自定义协议 + HMR(C 层)

- [x] **P2.1** ztron:// scheme:`webview_set_scheme_handler` API 链 + WKURLSchemeHandler 动态类 + 注册时机修复(详见 DESIGN.md §28)
- [x] **P2.2** dev 升级为 Vite dev server(`hmr:true`)→ 完整模块级 HMR(hot-accept 就地更新,否则整页 reload);无 index.html 的内联 app 回退 near-HMR
- [x] **P2.3** devtools 已默认启用(debug=1);convertFileSrc 经 `ztron://host/asset/…` 落地(`CONVERT_FILE_SRC_OK`)

### P3 插件生态(每个 = core 命令 + api + 权限)

- [x] store(kv) · http · shell · os · log (FULL_OK, 17 checks pass)
- [x] sql(tjs:sqlite)· autostart(`SQL_OK` + `AUTOSTART_OK`)
- [x] clipboard(`CLIPBOARD_OK`,host 三平台 NSPasteboard/Win32/GTK)
- [x] positioner · window-state · notification(`POSITIONER_OK`/`WINDOW_STATE_PLUGIN_OK`/`NOTIFICATION_OK`)
- [x] global-shortcut · single-instance(`SHORTCUT_OK`/`SINGLE_INSTANCE_OK`)
- [x] deep-link(macOS kAEGetURL + CFBundleURLTypes;dev 管线 `DEEP_LINK_OK`,打包版可 `open ztron://`)
- [x] websocket · local-ip · network · upload · persisted-scope(25 插件全部落地)
- [ ] 更偏门插件(按需)

### P4 开发者体验

- [x] 命令 codegen(`ztron codegen` → 类型化 invoke)+ MockRuntime 测试
- [x] 三层测试框架(surface + unit + integration,100% 覆盖账本)

### P5 分发与平台

- [x] updater 插件(manifest + sha256,`UPDATER_OK`)
- [x] macOS ad-hoc 签名 + versioned dylib 打包修复 + 图标
- [x] host 跨平台重构(core + host_platform.{macos,windows,linux})已交付
- [x] Windows 编译验证(0.3.8:vcpkg libffi 工具链;hello/multiwin/menuprobe spike 本机全绿 `FULL_OK`/`MENU_V2_OK`/`TRAY_V2_OK`)
- [x] Windows NSIS 打包 + CI 矩阵接入(0.3.8/0.3.9:NSIS 整目录安装器 + bundle.icon 的 .ico 贯通安装向导/快捷方式/卸载列表 + launcher 编译 + flat 目录本机端到端;CI windows-spike 全链门禁含 packaged e2e(dispatch 触发);后续收官:MSI(WiX 完整实现,确定性 UpgradeCode)+ Authenticode 签名(ZTRON_SIGN_PFX/THUMBPRINT/TS_URL))
- [ ] Linux 编译验证 + AppImage 打包(需目标平台;打包骨架已在 bundler.ts)
- [ ] 移动端(Android WebView / iOS WKWebView)——**方案已定**(docs/superpowers/specs/2026-10-03-mobile-platform-design.md):iOS 先行,分 P-M0 尖峰(tjs 交叉编译/单进程嵌入)→P-M1 iOS 纵切→P-M2 iOS CLI→P-M3/4 Android→P-M5 插件激活→P-M6 收尾;ztron 优势=TS 后端命令面零改动跨端,硬骨头=tjs 移动编译(FFI!)与 webview C API 移动 shim

### P6 多窗口(✅ 全部落地)

- [x] **P6.1** host webview 注册表 + label 路由 + `ipc_cb` 带 label(`MULTI_WINDOW_OK` 经 api 路径)
- [x] **P6.2** backend `plugin:webview|create` + api `WebviewWindow`(extends Window)
- [x] **P6.3** 运行时第二窗口创建(`examples/multiwin` 端到端 + hello 真实跨窗操作/destroy;三连修复:GUI 线程 label 重解析 + 命令层按 label 路由 + delegate 链式转发 + 引擎析构 UAF 库补丁,详见 DESIGN.md §75/§76)

## 4. 优先级(投入产出比)

| 优先级 | 项                        | 理由                |
| ------ | ------------------------- | ------------------- |
| 1      | P0.1 窗口状态+事件        | ✅ 完成             |
| 2      | P1 ACL 权限模型           | ✅ 完成             |
| 3      | P2 自定义 scheme + HMR    | ✅ 完成             |
| 4      | P3 store/http/dialog 插件 | ✅ 完成(25 插件)    |
| 5      | P5 打包扩展 + 测试        | ✅ 完成(本机面)     |
| 6      | 多窗口运行时解锁          | ✅ 完成(P6.3)       |
| 7      | IPC 二进制通道            | ✅ 完成(纠偏:详见 §5.2 / DESIGN §91) |
| 8      | 多平台/移动端             | 需目标平台          |

## 5. 现状对比(2026-08)与补全计划

> 完整对比结论见 `tests/README.md` 与 §「对比」。
> 概括:**macOS 桌面可验证面基本翻译完成**(核心 API + 31 插件 + 窗口全能力 + 安全 + 打包 + 三层测试 + 自定义协议/HMR + 多窗口架构);剩余为深水区/平台绑定/偏门子集。

### 5.1 已对齐(✅)

| 维度     | 覆盖                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core api | invoke/transformCallback/Channel/Resource/event/process/app/os/path/window/webview/clipboard/http/shell/dialog/tray/updater/menu/WebviewWindow                                                                                                                         |
| 插件(31,含 5 个移动端 fail-closed 占位 + crypto/minisign/semver 工具库) | store·fs·http·shell(+stream+Command 类)·os·log·sql·clipboard·positioner·window-state·notification·global-shortcut·single-instance·deep-link·updater·autostart·websocket·local-ip·network·upload·persisted-scope·menu·tray·dialog·app/process                   |
| 窗口     | min/max/fullscreen/alwaysOnTop/alwaysOnBottom/decorations/isDecorated/opacity/transparent/drag/resize-drag/position/size/min-max-size+constraints/focus/isFocused/visible/resizable/cursor/ignore-cursor/theme/scaleFactor/title/close/center/preventClose/destroy/setBounds/setShadow/zoom/enabled/minimizable/maximizable/closable+is*/skipTaskbar/contentProtected/requestUserAttention/progress-bar/badge/background-color/titlebar-style + 事件 + is*/outer* 查询 |
| 安全     | ACL capabilities/deny/覆盖 · PathScope/HttpScope · CSP · IPC key                                                                                                                                                                                               |
| 打包     | macOS .app · ad-hoc 签名 · 图标 · updater · versioned dylib · 完整 HMR(Vite dev server)                                                                                                                                                                        |
| 协议     | ztron:// 自定义 scheme · convertFileSrc · 资产隔离                                                                                                                                                                                                             |
| 多窗口   | host webview 注册表 + GUI 线程 label 重解析 · WebviewWindow api · 运行时建窗/ops/destroy · per-window 事件+preventClose                                                                                                                                               |
| 测试     | 三层框架(217 项自动化测试 + 85 项 spike 端到端,`ztron check` 可退出码化回归,100% 覆盖账本)                                                                                                                                                                                                     |

### 5.2 部分完成(🟡)与补全计划(本机可做)

| 项                 | 差距                                                                               | 状态                                                             |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| path 目录 getter   | 缺 appDataDir/appCacheDir/documentDir/downloadDir/desktopDir/resourceDir 等 ~20 个 | [x] 已完成                                                       |
| os type/family/eol | 缺 3 个查询                                                                        | [x] 已完成                                                       |
| window 高级        | setShadow/setZoom/setEnabled/startResizeDragging/setBounds                         | [x] 已完成                                                       |
| window v2 批次2    | size 约束/minimizable/closable/maximizable+is*/isDecorated/isFocused/skipTaskbar/alwaysOnBottom/contentProtected/requestUserAttention/进度条/badge/背景色/titlebar 风格 | [x] 已完成(`WIN_BUTTONS_OK`+`WIN_V2_EXTRAS_OK`+`DOCK_V2_OK`，isFocused 为 bonus) |
| menu 结构          | Submenu/CheckMenuItem/RadioMenuItem/preventClose                                   | [x] 已完成(Submenu + check + radio + preventClose)               |
| shell Command 类   | Command/事件流(已有 executeStream 等价)                                            | [x] 已完成                                                       |
| IPC 二进制通道    | 原记"MessagePack"系误判:Tauri v2 桌面无 msgpack,真目标是 InvokeBody/InvokeResponseBody::Raw;已对齐 Raw 语义(任何命令可回二进制,前端 invoke 直接拿 Uint8Array) | [x] 已完成(DESIGN §91;wire 上 base64-in-JSON 与 Tauri Android 官方建议同构) |
| Image 模块         | transformImage                                                                     | [x] 已完成(fromBytes/fromPath/fromRGBA + `transformImage`/`ImageLike` + tray 集成;修复 icon-by-rid 被丢弃) |

### 5.3 缺失(❌ 深水区/平台/移动端)

| 项                                                                                        | 原因                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| Linux 编译 + AppImage/deb/rpm 验证                                                        | 需目标平台(打包骨架已就绪)              |
| ~~Windows msi(WiX 完整实现)+ Authenticode 签名~~                                          | ✅ 已完成(packMsiDir + signWinArtifact) |
| 移动端 + 移动/硬件插件运行时(barcode/biometric/haptics/nfc/geolocation 的 API 面与命令注册已就位,桌面 fail-closed) | 整个构建链未启动                         |
| fps / server 插件                                                                            | 需原生绑定/偏门                          |
| ~~tauri-driver/WebDriver 集成测试~~                                                       | ✅ 已完成(ztron-driver,tauri-driver 平价,v0.3.12 已发布) |
| IPC 二进制通道(原记 MessagePack)                                                         | ✅ 已纠偏并对齐(DESIGN §91)             |

## 6. Tauri 2.12 对齐状态(2026-10-03,基准 tauri 2.12.1 / 30da1fd6e)

已对齐(feat/align-tauri-2.12):

- [x] dev server Host/Origin 校验(DNS-rebinding 防护 + 跨站 ACAO 收紧,tauri cc9d522c6)
- [x] `ztron://` scheme handler 异步化(后台读 + 主队列投递 + stop 取消跟踪,tauri 127aa176b;Windows 侧与 wry 同构无需改)
- [x] Liquid Glass 窗口特效(`NSGlassEffectView`,macOS 26+,低版本回退普通材质;`Effects.color/interactive` 贯通,tauri 4a5065653)
- [x] `Window.setFullscreenOnMonitor`(macOS NSScreen 匹配+移窗+全屏;win/linux 暂降级普通全屏,tauri 6edc2f4d4)
- [x] `JsImage` 图标参数放宽(window setIcon/setOverlayIcon 接受路径/字节;tray 为路径协议不放宽,tauri 990f77eb2)

未对齐(按优先级):

- [x] webview 权限请求 API(`on_permission_request` + 15 种 PermissionKind,tauri 382dd6ccc)——2026-10-03 落地:core `onPermissionRequest`(App/AppOptions/AppBuilder)+ PermissionController(wire:permission_request/permission_response);macOS 经 `class_addMethod` 给引擎 UIDelegate 动态加媒体捕获方法(macOS 12+,摄像头/麦克风,kind 映射与 tauri Display 逐字),decisionHandler 经 Block ABI + webview_dispatch 回主线程;无 handler 自动回 "default"(≡未实现方法的官方语义);win/linux 协议就绪、后端接线待 WebView2/webkitgtk 事件桥(与 tauri 的 macOS 非 media-capture kinds 同样"平台后端未支持")
- [x] `appDirectoriesOverride` 配置(便携应用目录覆盖,tauri 7dbfc1fe5)——2026-10-03:ztron.conf.json `app > appDirectoriesOverride`(Root/per-dir + $VARIABLE 白名单),path 插件命令期解析(resolveAppDirs)
- [x] Resource `Symbol.asyncDispose` / `await using`(tauri be019795a)——2026-10-03 落地,Node 22+ 原生支持
- [x] `Image.fromAppIconResource`(Windows exe 资源 32512,tauri d203f74a2)与 `App.activateIgnoringOtherApps()`(macOS NSApp,tauri 21ec647cf;偏差:运行时方法替代 Builder 构建期选项)——2026-10-03 落地
- [ ] asset 协议 Range/`206 Partial Content`(tauri f9ed1a3fd)
- [ ] `tauri add --tag/--rev`、`remove`/`permission`/`capability` CLI 命令族
- [ ] ACL deny 按 capability 执行上下文作用域(tauri 0349b6fb8)——需对照自查 ztron ACL 语义
