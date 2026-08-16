# Ztron ROADMAP — 能力差距与翻译路径

> Ztron 已完成 M0–M4 + P0–P23 全部可在本机验证的项(spike 81 项确定性 FULL_OK/EXIT 0,
> 另有 WIN_EVENT_OK/WIN_QUERY2_OK 尽力而为检查)。剩余项均需目标平台或属深水区。
> 本文件规划 Tauri v2 其余能力的翻译顺序与方式。参考源:`tauri-apps/tauri`。

## 1. 能力差距矩阵

| 维度              | Tauri v2                                                                   | Ztron 现状                          | 差距 | 翻译来源           | 改动层       |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------- | ---- | ------------------ | ------------ |
| 窗口状态          | minimize/maximize/fullscreen/always-on-top/decorations/opacity/drag-region | 全能力 + is*/outer* 查询            | ~无  | tao                | C(host)      |
| 窗口事件          | resize/move/focus/blur/close/destroyed/scale-change                        | resize/move/focus/blur/close        | ~无  | event/mod.rs       | C+core       |
| 多窗口/多 webview | WebviewWindow × N                                                          | ✅ 运行时多窗口落地(per-window 事件/close) | ~无  | wry                | C            |
| 系统集成          | tray/menu/dialog/clipboard/notification/global-shortcut                    | 全部实现                            | ~无  | 各插件 + tao       | C            |
| 自定义协议        | `tauri://` 资产服务 + 隔离                                                 | `ztron://` + convertFileSrc + HMR   | ~无  | wry scheme handler | C            |
| ACL/权限          | capabilities/permissions/scope                                             | ACL + PathScope + HttpScope + CSP   | 小   | tauri ACL crates   | core TS      |
| IPC               | invoke+channel+MessagePack+ipc-scope                                       | invoke+channel(JSON)                | 小   | ipc/mod.rs         | core TS      |
| 命令              | 宏+Result+State注入+类型生成                                               | 手动注册 + codegen                  | 小   | macros/codegen     | CLI(codegen) |
| 前端 API          | @tauri-apps/api 全量                                                       | invoke/event/channel/window/fs/path | 中   | packages/api       | api TS       |
| 插件生态          | ~30 官方插件                                                               | 25 插件                             | 小   | plugins/*          | core+api TS  |
| 配置              | tauri.conf.json schema + CSP + capabilities                                | 手写 TS                             | 中   | tauri-utils        | CLI          |
| 打包              | 7 格式+签名+updater+图标                                                   | macOS .app+签名+updater+图标        | 大   | tauri-bundler      | CLI+平台脚本 |
| 测试              | tauri-driver/WebDriver + mock runtime                                      | MockRuntime + 三层覆盖率            | 中   | tauri-driver       | CLI+core     |
| 平台              | Win/Linux/Android/iOS                                                      | macOS                               | 很大 | -                  | C+core       |

## 2. 关键架构决策

- **D1 原生窗口能力**:`webview/webview` C API 只到 get_native_handle。窗口状态/tray/menu 由 **host 直接调平台 API**(经 native handle:NSWindow / HWND / GTKWindow),本质是"自己写最小 tao"。**已落地**。
- **D2 多窗口**:host 自管理多 WKWebView/WebView2 实例。**已全部落地**(host 注册表 + label 路由 + WebviewWindow api + 运行时建窗;原"卡 GUI"实为 label 时序 bug,见 DESIGN.md §75)。
- **D3 自定义协议**:host 注册 `ztron://` scheme → 解锁生产资产隔离 + dev HMR(替代 file://)。**已落地**。

## 3. 分阶段路径

### P0 让它像桌面应用(C 层攻坚)

- [x] **P0.1 窗口状态 + 事件**:min/max/fullscreen/alwaysOnTop/center/focus/visible/opacity/transparent/decorations;resize/move/focus/blur/close → `tauri://*`(`WIN_STATE_OK` + `WIN_EVENT_OK` + `OPACITY_OK`/`TRANSPARENT_OK`/`DECORATIONS_OK`)
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
- [ ] Windows/Linux 编译验证 + NSIS/AppImage 打包(需目标平台)
- [ ] 移动端(Android WebView / iOS WKWebView)远期

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
| 7      | IPC MessagePack           | 低优先              |
| 8      | 多平台/移动端             | 需目标平台          |

## 5. 现状对比(2026-08)与补全计划

> 完整对比结论见 `tests/README.md` 与 §「对比」。
> 概括:**macOS 桌面可验证面基本翻译完成**(核心 API + 25 插件 + 窗口全能力 + 安全 + 打包 + 三层测试 + 自定义协议/HMR + 多窗口架构);剩余为深水区/平台绑定/偏门子集。

### 5.1 已对齐(✅)

| 维度     | 覆盖                                                                                                                                                                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core api | invoke/transformCallback/Channel/Resource/event/process/app/os/path/window/webview/clipboard/http/shell/dialog/tray/updater/menu/WebviewWindow                                                                                                                         |
| 插件(25) | store·fs·http·shell(+stream+Command 类)·os·log·sql·clipboard·positioner·window-state·notification·global-shortcut·single-instance·deep-link·updater·autostart·websocket·local-ip·network·upload·persisted-scope·menu·tray·dialog·app/process                   |
| 窗口     | min/max/fullscreen/alwaysOnTop/alwaysOnBottom/decorations/isDecorated/opacity/transparent/drag/resize-drag/position/size/min-max-size+constraints/focus/isFocused/visible/resizable/cursor/ignore-cursor/theme/scaleFactor/title/close/center/preventClose/destroy/setBounds/setShadow/zoom/enabled/minimizable/maximizable/closable+is*/skipTaskbar/contentProtected/requestUserAttention/progress-bar/badge/background-color/titlebar-style + 事件 + is*/outer* 查询 |
| 安全     | ACL capabilities/deny/覆盖 · PathScope/HttpScope · CSP · IPC key                                                                                                                                                                                               |
| 打包     | macOS .app · ad-hoc 签名 · 图标 · updater · versioned dylib · 完整 HMR(Vite dev server)                                                                                                                                                                        |
| 协议     | ztron:// 自定义 scheme · convertFileSrc · 资产隔离                                                                                                                                                                                                             |
| 多窗口   | host webview 注册表 + GUI 线程 label 重解析 · WebviewWindow api · 运行时建窗/ops/destroy · per-window 事件+preventClose                                                                                                                                               |
| 测试     | 三层框架(65 单测 + 81 spike,100% 覆盖账本)                                                                                                                                                                                                                     |

### 5.2 部分完成(🟡)与补全计划(本机可做)

| 项                 | 差距                                                                               | 状态                                                             |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| path 目录 getter   | 缺 appDataDir/appCacheDir/documentDir/downloadDir/desktopDir/resourceDir 等 ~20 个 | [x] 已完成                                                       |
| os type/family/eol | 缺 3 个查询                                                                        | [x] 已完成                                                       |
| window 高级        | setShadow/setZoom/setEnabled/startResizeDragging/setBounds                         | [x] 已完成                                                       |
| window v2 批次2    | size 约束/minimizable/closable/maximizable+is*/isDecorated/isFocused/skipTaskbar/alwaysOnBottom/contentProtected/requestUserAttention/进度条/badge/背景色/titlebar 风格 | [x] 已完成(`WIN_BUTTONS_OK`+`WIN_V2_EXTRAS_OK`+`DOCK_V2_OK`，isFocused 为 bonus) |
| menu 结构          | Submenu/CheckMenuItem/RadioMenuItem/preventClose                                   | [x] 已完成(Submenu + check + radio + preventClose)               |
| shell Command 类   | Command/事件流(已有 executeStream 等价)                                            | [x] 已完成                                                       |
| IPC MessagePack    | JSON → MessagePack                                                                 | [ ] 低优先                                                       |
| Image 模块         | transformImage                                                                     | [x] 已完成(fromBytes/fromPath/fromRGBA + `transformImage`/`ImageLike` + tray 集成;修复 icon-by-rid 被丢弃) |

### 5.3 缺失(❌ 深水区/平台/移动端)

| 项                                                                                        | 原因                                     |
| ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| Win/Linux 编译 + NSIS/AppImage/dmg                                                        | 需目标平台                               |
| 移动端 + 移动/硬件插件(barcode/biometric/haptics/nfc/bluetooth/authenticator/geolocation) | 整个构建链未启动                         |
| stronghold / fps / server 插件                                                            | 需原生绑定/偏门                          |
| tauri-driver/WebDriver 集成测试                                                           | 未实现(用 MockRuntime+spike 替代)        |
| IPC MessagePack                                                                           | 低优先                                   |
