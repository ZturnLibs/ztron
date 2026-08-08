# Ztron ROADMAP — 能力差距与翻译路径

> Ztron 已完成 M0–M4 + P0–P5 全部可在本机验证的项(spike 30 项确定性 FULL_OK,
> 另有 WIN_EVENT_OK 尽力而为检查)。剩余项均需目标平台或属深水区。
> 本文件规划 Tauri v2 其余能力的翻译顺序与方式。参考源:`tauri-apps/tauri`。

## 1. 能力差距矩阵

| 维度              | Tauri v2                                                                   | Ztron 现状                          | 差距 | 翻译来源           | 改动层       |
| ----------------- | -------------------------------------------------------------------------- | ----------------------------------- | ---- | ------------------ | ------------ |
| 窗口状态          | minimize/maximize/fullscreen/always-on-top/decorations/opacity/drag-region | 仅 setTitle/setSize                 | 大   | tao                | C(host)      |
| 窗口事件          | resize/move/focus/blur/close/destroyed/scale-change                        | 无                                  | 中   | event/mod.rs       | C+core       |
| 多窗口/多 webview | WebviewWindow × N                                                          | 单窗口(库单例)                      | 很大 | wry                | C(需扩展)    |
| 系统集成          | tray/menu/dialog/clipboard/notification/global-shortcut                    | 无                                  | 很大 | 各插件 + tao       | C            |
| 自定义协议        | `tauri://` 资产服务 + 隔离                                                 | `file://`                           | 中   | wry scheme handler | C            |
| ACL/权限          | capabilities/permissions/scope                                             | PathScope(fs 仅)                    | 大   | tauri ACL crates   | core TS      |
| IPC               | invoke+channel+MessagePack+ipc-scope                                       | invoke+channel                      | 中   | ipc/mod.rs         | core TS      |
| 命令              | 宏+Result+State注入+类型生成                                               | 手动注册                            | 中   | macros/codegen     | CLI(codegen) |
| 前端 API          | @tauri-apps/api 全量                                                       | invoke/event/channel/window/fs/path | 中   | packages/api       | api TS       |
| 插件生态          | ~30 官方插件                                                               | fs、path                            | 大   | plugins/*          | core+api TS  |
| 配置              | tauri.conf.json schema + CSP + capabilities                                | 手写 TS                             | 中   | tauri-utils        | CLI          |
| 打包              | 7 格式+签名+updater+图标                                                   | macOS .app                          | 大   | tauri-bundler      | CLI+平台脚本 |
| 测试              | tauri-driver/WebDriver + mock runtime                                      | 无                                  | 中   | tauri-driver       | CLI+core     |
| 平台              | Win/Linux/Android/iOS                                                      | macOS                               | 很大 | -                  | C+core       |

## 2. 关键架构决策

- **D1 原生窗口能力**:`webview/webview` C API 只到 get_native_handle。窗口状态/tray/menu 由 **host 直接调平台 API**(经 native handle:NSWindow / HWND / GTKWindow),本质是"自己写最小 tao"。**推荐**。
- **D2 多窗口**:webview 库单实例限制 → host 自管理多 WKWebView/WebView2 实例。最深,延后。
- **D3 自定义协议**:host 注册 `ztron://` scheme → 解锁生产资产隔离 + dev HMR(替代 file://)。

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

- [~] **P2.1** ztron:// scheme:技术蓝图已定(§28),ObjC 动态类高风险,暂缓
- [x] **P2.2** dev 自动刷新(near-HMR,`page reloaded`);模块级 HMR 待 ztron://
- [~] **P2.3** devtools 已默认启用(debug=1);convertFileSrc asset:// 待 ztron://

### P3 插件生态(每个 = core 命令 + api + 权限)

- [x] store(kv) · http · shell · os · log (FULL_OK, 17 checks pass)
- [x] sql(tjs:sqlite)· autostart(`SQL_OK` + `AUTOSTART_OK`)
- [x] clipboard(`CLIPBOARD_OK`,host 三平台 NSPasteboard/Win32/GTK)
- [x] positioner · window-state · notification(`POSITIONER_OK`/`WINDOW_STATE_PLUGIN_OK`/`NOTIFICATION_OK`)
- [x] global-shortcut · single-instance(`SHORTCUT_OK`/`SINGLE_INSTANCE_OK`;spike 27 项)
- [x] deep-link(macOS kAEGetURL + CFBundleURLTypes;dev 管线 `DEEP_LINK_OK`,打包版可 `open ztron://`)
- [ ] 更偏门插件(按需)

### P4 开发者体验

- [x] 命令 codegen(`ztron codegen` → 类型化 invoke)+ MockRuntime 测试(3/3 通过)

### P5 分发与平台

- [x] updater 插件(manifest + sha256,`UPDATER_OK`)
- [x] macOS ad-hoc 签名 + Win/Linux host 骨架(架构交付)
- [x] host 跨平台重构(core + host_platform.{macos,windows,linux})已交付
- [ ] Windows/Linux 编译验证 + NSIS/AppImage 打包(需目标平台)
- [ ] 移动端(Android WebView / iOS WKWebView)远期

## 4. 优先级(投入产出比)

| 优先级 | 项                        | 理由                        |
| ------ | ------------------------- | --------------------------- |
| 1      | P0.1 窗口状态+事件        | 桌面应用基本盘,当前进行中   |
| 2      | P1 ACL 权限模型           | Tauri 安全卖点,纯 TS 低成本 |
| 3      | P2 自定义 scheme + HMR    | 前端体验解锁                |
| 4      | P3 store/http/dialog 插件 | 开箱即用                    |
| 5      | P5 打包扩展 + 测试        | 分发与质量                  |
| 6      | 多窗口/多平台/移动端      | 最深,延后                   |

## 5. 现状对比(2026-08)与补全计划

> 完整对比结论见 `tests/README.md` 与 §「对比」。
> 概括:**macOS 桌面可验证面基本翻译完成**(核心 API + 25 插件 + 窗口全能力 + 安全 + 打包 + 三层测试);剩余为深水区/平台绑定/偏门子集。

### 5.1 已对齐(✅)

| 维度     | 覆盖                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| core api | invoke/transformCallback/Channel/Resource/event/process/app/os/path/window/clipboard/http/shell/dialog/tray/updater/menu                                                                                                          |
| 插件(25) | store·fs·http·shell(+stream)·os·log·sql·clipboard·positioner·window-state·notification·global-shortcut·single-instance·deep-link·updater·autostart·websocket·local-ip·network·upload·persisted-scope·menu·tray·dialog·app/process |
| 窗口     | min/max/fullscreen/alwaysOnTop/decorations/opacity/transparent/drag/position/size/focus/visible/resizable/cursor/ignore-cursor/theme/scaleFactor/title/close/center + 事件 + is*/outer* 查询                                      |
| 安全     | ACL capabilities/deny/覆盖 · PathScope/HttpScope · CSP · IPC key                                                                                                                                                                  |
| 打包     | macOS .app · ad-hoc 签名 · 图标 · updater · near-HMR                                                                                                                                                                              |
| 测试     | 三层框架(50 单测 + 51 spike,100% 覆盖账本)                                                                                                                                                                                        |

### 5.2 部分完成(🟡)与补全计划(本机可做)

| 项                 | 差距                                                                               | 状态       |
| ------------------ | ---------------------------------------------------------------------------------- | ---------- |
| path 目录 getter   | 缺 appDataDir/appCacheDir/documentDir/downloadDir/desktopDir/resourceDir 等 ~20 个 | [ ] 计划中 |
| os type/family/eol | 缺 3 个查询                                                                        | [ ] 计划中 |
| window 高级        | setShadow/setZoom/setEnabled/isEnabled/startResizeDragging/setBounds               | [ ] 计划中 |
| menu 结构          | Submenu/CheckMenuItem/RadioMenuItem/preventClose                                   | [ ] 计划中 |
| shell Command 类   | Command/事件流(已有 executeStream 等价)                                            | [ ] 低优先 |
| IPC MessagePack    | JSON → MessagePack                                                                 | [ ] 低优先 |

### 5.3 缺失(❌ 深水区/平台/移动端)

| 项                                                                                        | 原因                              |
| ----------------------------------------------------------------------------------------- | --------------------------------- |
| 多窗口/WebviewWindow/getByLabel/webview 模块/dpi 类型                                     | host 单 webview 实例,需重写       |
| ztron:// scheme(→convertFileSrc/HMR/资产隔离)                                             | ObjC 动态类高风险,蓝图已备        |
| Win/Linux 编译 + NSIS/AppImage/dmg                                                        | 需目标平台                        |
| 移动端 + 移动/硬件插件(barcode/biometric/haptics/nfc/bluetooth/authenticator/geolocation) | 整个构建链未启动                  |
| stronghold / fps / server 插件                                                            | 需原生绑定/偏门                   |
| tauri-driver/WebDriver 集成测试                                                           | 未实现(用 MockRuntime+spike 替代) |
| Image 模块(transformImage)                                                                | 需原生图像处理                    |
