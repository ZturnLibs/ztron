# GAP.md — Tauri v2 ↔ Ztron 全量能力对照与补齐台账

> **目标**：将 Tauri v2 全部功能与能力移植到 Ztron，不允许遗漏。
> 本文件是唯一权威缺口清单：每项一个稳定 ID，完成后更新状态并在 DESIGN.md 记录章节号。
> 平台不支持 ≠ 不移植：[移植] 表示现在就写代码（含 Win/Linux/移动面），[验证后置] 表示待用户提供目标环境后回归。

## 基线

- 对比日期：2026-08-27；Ztron 起点 commit `6c4db15`（P0–P30 完成，86 checks FULL_OK）
- 上游：`/Users/zyj/Zturn/tauri`（只读参考库）
  - JS API `packages/api` = **@tauri-apps/api 2.11.1**（12 模块全部导出已盘点）
  - Rust 侧 core 插件 **9 个 / 163 条命令**（`crates/tauri/build.rs` PLUGINS 为权威表）
  - 配置 schema `crates/tauri-utils/src/config.rs`（WindowConfig 63 字段、Bundle 全家）
  - bundler `crates/tauri-bundler` PackageType ×9；`tauri-driver` WebDriver intermediary
- 官方插件：`tauri-apps/plugins-workspace` v2 分支 **30 个目录（29 插件 + mirrors.txt）**
- 状态标记：☐ 待办 · ◐ 进行中 · ✓ 完成 · N/A-不适用（附理由）

## 执行规则（沿用仓库既有约定）

每完成一项：
1. 更新本表状态 + DESIGN.md 新增章节（§101 起）；
2. 若涉及新命令/API 导出 → **必须同步 `tests/helpers/manifest.ts`**（surface 测试要求精确匹配，否则失败）；
3. 每个新命令进 routing 单测或声明 INTEGRATION_ONLY（coverage 账本断言"无未覆盖命令"）；
4. macOS 可验项追加 spike 检查 tag 并过 `ztron check`；纯移植项至少过 CI 编译/单测矩阵。

---

# A. 架构级整块

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| A1 | **裸 Webview / 单窗多 webview**：窗口内创建裸 webview（create_webview 与 create_webview_window 分离）、webview 级 position/size getter、setAutoResize、reparent、webview 级 hide/show/setSize/setPosition/setFocus/setBackgroundColor、print、internal_toggle_devtools 程序化开关、getAllWebviews/getByLabel 真实化（现为 window 别名假象） | `crates/tauri/src/webview/plugin.rs` 18 条命令；`api/src/webview.ts` Webview 类 | host C + runtime + core + api | macOS 本机可验 | ◐ |
| A2 | **Menu 类体系**：IconMenuItem 类 + NativeIcon 枚举（56 系统图标）、Menu.default()/default app menu 自动生成、AboutMetadata（about 元数据）、setAsWindowMenu + setAsWindowsMenuForNSApp/setAsHelpMenuForNSApp、prepend/removeAt/items 实时结构化遍历、Submenu/CheckMenuItem/RadioMenuItem 独立类形态（现 children 数组近似）、menu set_icon 命令 | `api/src/menu.ts + menu/*.ts`；`crates/tauri/src/menu/plugin.rs` 22 条 | host C + runtime + core + api | macOS 本机可验 | ◐ |

# B. core 命令面（逐条对齐 build.rs PLUGINS）

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| B1 | 事件缺 WINDOW_SUSPENDED/RESUMED/WINDOW_CREATED/WEBVIEW_CREATED（native 仅映射 11 种） | event/mod.rs 16 个 TauriEvent | host C + core | macOS 可验 | ☐ |
| B2 ✓ | cursor_position 无窗全局回退本就内建（无 wnd 直接 mouse_screen）；api 新增零参 standalone cursorPosition() 导出
| B3 ✓ | app 级 show/hide（NSApp hide:/unhideWithoutActivation+activate；G2 批次，DESIGN §102） | core:app app_show/app_hide | host C + core + api | macOS 可验（multiwin APP_LIFECYCLE_OK ✓） | ✓ |
| B4 ✓ | setDockVisibility（activationPolicy Regular/Accessory，与 skip_taskbar 同机制独立 API；G2 批次） | core:app set_dock_visibility | host C + core + api | macOS 可验（multiwin ✓） | ✓ |
| B5 ✓ | default_window_icon 命令+api（null=未设，Option 语义；dock 图标走 conf/Info.plist）——G15|
| B6 ✓ | bundle_type 查询 + BundleType 枚举（exe 路径判定 .app/Nsis/Msi/AppImage；安装器标记待 F3 接入；G2 批次） | core:app bundle_type | core + api | 本机可验 | ✓ |
| B7 ✓ | supports_multiple_windows 查询（桌面恒 true；G2 批次） | core:app supports_multiple_windows | core + api | 本机可验 | ✓ |
| B8 ✓ | getIdentifier 独立函数 + plugin:app\|identifier 命令（G2 批次） | core:app identifier | core + api | 本机可验 | ✓ |
| B9 | Tray 多实例 id 体系：getById/removeById；setTempDirPath；setIconWithAsTemplate；setShowMenuOnLeftClick；TrayIconEvent 富化（坐标/左右键 MouseDown/MouseUp/click/doubleClick/move/enter/leave + MouseButton/ButtonState 类型；现仅裸 click） | core:tray 12 条；api/src/tray.ts TrayIconOptions/event 类型 | host C + runtime + core + api | macOS 可验（除 tempDir 部分） | ◐ |
| B10 | menu 对齐 22 条核对：set_accelerator 命令名、is_checked 查询形态（Ztron 是 set_item_checked 双向？核对 item_info）、text/is_enabled 查询命令独立性 | menu/plugin.rs | core 核对 | 本机可验 | ☐ |
| B11 | Image 对齐 5 条：rgba()/size() 读回 + static new()(RGBA)；**已完成 fromRGBA 链路读回（core 侧 dims/像素登记）+ `Image.new` 别名；PNG/path 载入的图像读回待 C 层 decode（NSImage→RGBA 落地后开放 rgba()/size() 完整语义）** | core:image new/from_bytes/from_path/rgba/size | core + api | 本机可验 | ◐ |
| B12 | path 对齐 8 条：resolve_directory（BaseDirectory 解析）;Ztron 用 baseline_dir 近似——对齐命令名/语义；BaseDirectory 枚举进 path 插件协议 | path/plugin.rs | core + api | 本机可验 | ☐ |
| B13 | resources close 走独立 core:resources\|close 权限面核对（Ztron Resource.close 路径验证） | resources/plugin.rs | core 核对 | 本机可验 | ☐ |
| B14 | window 查询粒度补齐：inner_position 独立准确值（现为 outer 近似）、outer_size 独立于 get_frame 快照语义核对 | window/plugin.rs | host C | macOS 可验 | ☐ |
| B15 ✓ | ActivityName(Android)/sceneIdentifier(iOS)：get→null + set 文档化 no-op 四命令 + api Window 四方法——G12 | window/plugin.rs | core+api | 桌面已验 | ✓ |

# C. @tauri-apps/api 包层（v2.11.1 逐导出对齐）

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| C1 ✓ | **CloseRequestedEvent 类 + preventDefault/isPreventDefault**：onCloseRequested(handler) 语义改为「执行 handler→未 prevent 则 destroy()」动态决策（G1 批次落地，2026-08-27，DESIGN §101） | api/src/window.ts CloseRequestedEvent + onCloseRequested | api（host 无关） | 本机可验 | ✓ |
| C2 ✓ | CursorIcon 常量表（35 联合成员含 resize 族；as-const 对象+派生类型）
| C3 ✓ | ProgressBarStatus 枚举贯通：api 状态对象归一化→wire -3 哨兵→host 不确定态旋转条分支（setContentView+startAnimation）；None 清除
| C4 ✓ | request_user_attention 修正真实 AppKit raw 值 Critical=10/Info=0（原误发 1），enum 贯通保留
| C5 ✓ | dpi Size/Position 包装器（源自适应 Logical/Physical 判别，to* 双向换算 + toJSON 带判别键）
| C6 | EventTarget.App 语义：app 目标路由到 app 级监听而非等同 Any 全局广播；windows/webviews 分组语义核对 | api event.ts EventTarget kind ×5 | core eventManager | 本机可验 | ☐ |
| C7 ✓ | BaseDirectory 枚举（23 值 as-const）+ resolveBaseDirectory + v1 fs 函数可选 options.baseDir（相对路径拼接，绝对路径直通）——G9 批次 |
| C8 ✓ | mocks.ts 四件套：mockIPC（内存 invoke）/mockWindows（currentWindow·currentWebview·label 三形 metadata）/mockConvertFileSrc/clearMocks（全量还原）——G14 |
| C9 ✓ | inject `metadata.currentWindow.label/currentWebview.label`：loadHtml 路径烘焙真实 label；URL 路径经 `#ztron-window=` hash 标记由注入脚本解析（G1 批次落地，DESIGN §101） | global.d.ts internals 契约 | core app.ts + inject build.ts | 本机可验 | ✓ |
| C10 ✓ | withGlobalTauri 等价：inject buildInitScript 新增开关，开启时附 `window.__ZTRON__ = __TAURI_INTERNALS__`；conf app.withGlobalTauri → createWindow bootstrap 贯通——G10 |
| C11 | @zturnlibs/api 子路径 exports 结构核对（./index,./app,…./window 每模块独立 entry） | package.json exports | api 打包 | 本机可验 | ☐ |
| C12 | effect EffectState 跟随态（FollowsWindowActiveState/Active/Inactive 贯穿 setEffects 协议核对） | api window.ts | 核对 | 本机可验 | ☐ |
| C13 |dpi Physical/Logical 序列化 [SERIALIZE_TO_IPC_FN]/toJSON 契约核对（invoke 传输尺寸参数兼容上游写法） | api dpi.ts | api 核对 | 本机可验 | ☐ |

# D. 已实现插件深度差距

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| D1 ✓ | **updater 安全链**：minisign 兼容签名校验（纯 TS ed25519/sha512/blake2b，与 jedisct1/minisign 线格式对齐；pubkey 配置即 fail-closed 门禁）、SemVer 2.0.0 precedence、downloadAndInstall 进度事件（Started/Progress/Finished 经 Channel）——G3 批次落地，DESIGN §103；install modes(passive/basicUi) 待 GUI 层后续 | plugins-workspace/updater v2 | core + api + CLI signer | 本机可验（单测互操作全绿 + CLI 冒烟） | ✓ |
| D2 ✓ | **store 资源化**：Store 实例语义（load/save/saveTo/reset/close/setAutoSave + onChange Channel 推 set/delete/reset）、v1 path 命令面零破坏、权限集 read/write/default 重组（hello capability 的 store:write 保持）——G9 批次 |
| D3 ◐ | **fs 高级面**：handle 式 IO（open/read/seek/write/flush/close，游标+flush-on-close，命令面与上游对齐；大文件流式待真实 tjs.open 绑定）、lstat/readLink/truncate/chmod（运行时 feature-detect，stub 全语义单测）、watch recursive 明示不支持（libuv fs_event 无可移植递归）、scope 路径模型维持（上游本就无大小上限，台账原项系误记已删）——G9 批次 |
| D4 ◐ | **http 类型完整**：body 扩展（Uint8Array/ArrayBuffer→b64 信封、普通对象自动 JSON+隐式 content-type）、responseType json（解析失败得 null 与上游一致）/binary（Raw 信封）；FormData/请求体流式/proxy-connectivity 为 tjs fetch 能力外，留明示不支持语义——G9 批次 |
| D5 | **cli 插件声明式 schema**：config 内 args/subcommands clap 形态（description/takes_value/index/required/defaultValue conflicts matches 返回结构） | plugins-workspace/cli v2 | core + conf | 本机可验 | ☐ |
| D6 ◐ | log：attachLogger/detachLogger 客户端多路 sink（上游 webview-target 语义对齐）——G9 批次；format 函数注入/timeStrategy 待续 |
| D7 | dialog 选项级核对：filters/maxFiles/canCreateDirectories/ directory、消息 kinds、响应对象形态 | plugins-workspace/dialog v2 | 核对+补 | 本机可验 | ☐ |
| D8 | shell：Command cwd/env/encoding 选项、validator scope（shell open 权限正则进 ACL）、spawn 三事件流核对 | plugins-workspace/shell v2 | core 核对 | 本机可验 | ☐ |
| D9 ◐ | websocket/upload/persisted-scope/deep-link/window-state/sql/os/autostart/single-instance/opener/notification/clipboard/global-shortcut 批量选项级核对——**GS registerAll/unregisterAll 已落地**（core 侧登记表驱动，DESIGN §101）；其余插件的选项级核对仍待办 | 各官方插件 v2 README/command 表 | core 核对 | 本机可验 | ◐ |

# E. 官方插件缺失（29 官方 − 23 已实现）

| ID | 插件 | 说明 | 层 | 平台 | 状态 |
|----|------|------|-----|------|------|
| E1 ✓ | **localhost**：`tjs.serve` fetch-handler 服文件（PathScope 根锚定+扩展名 MIME 表+403/404 语义），start/stop/status 命令 + api localhost/start·stopLocalhost；menuprobe LOCALHOST_OK（真 tjs.serve 临时端口往返）——G11 批次 | plugins-workspace/localhost | core+api | macOS 本机可验 | ✓ |
| E2 | **stronghold** | 加密存储（Rust stronghold；TS 重写方案：libsodium 存档引擎——先做 argon2/xchacha20 兼容面） | core + native 绑定 | macOS 可验（重） | ☐ |
| E3 ✓ | barcode-scanner：scan 命令面移植，off-platform 抛 PluginUnavailable（序列化形态测试断言）——G12 | barcode-scanner v2 | core 桩+api | 桌面拒错已验；真机待环境 | ✓ |
| E4 ✓ | biometric：authenticate/status 命令面移植（同上）；macOS Touch ID 真实现留作可选升级（LAContext）——G12 | biometric v2 | core 桩+api | 桌面拒错已验 | ✓ |
| E5 ✓ | geolocation：getCurrentPosition/watchPosition/clearWatch 命令面移植——G12 | geolocation v2 | core 桩+api | 桌面拒错已验 | ✓ |
| E6 ✓ | haptics：impactOccurred/notificationOccurred/selectionChanged 命令面移植——G12 | haptics v2 | core 桩+api | 桌面拒错已验 | ✓ |
| E7 ✓ | nfc：scan/write/stop 命令面移植——G12 | nfc v2 | core 桩+api | 桌面拒错已验 | ✓ |

> 已实现 23：fs/http/shell/dialog/clipboard-manager/sql/store/updater/deep-link/cli/os/log/notification/opener/global-shortcut/autostart/single-instance/persisted-scope/positioner/process/upload/websocket/window-state

# F. 配置 / CLI / 打包 / 测试基建 / 安全

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| F1 ◐ | **tauri.conf.json 顶层 schema 全量**：ProjectConfigFile 扩展 $schema/productName/mainBinaryName/build{五命令}/app{withGlobalTauri,macOSPrivateApi,security{csp,devCsp,capabilities,assetProtocol,freezePrototype}}/bundle(11 键)/plugins{}；旧顶层 csp/capabilities 兼容直通；校验器类型检查+未知键 onWarn；fromConfig 结构化入 AppConfig——G10。剩余：build/bundle 值真正驱动 CLI 管线（G13 接线）|
| F2 ◐ | **WindowConfig 创建期扩展**：新增 shadow/focus/dragDropEnabled 三字段进 #applyStartupWindowState（applier 移入 createWindow 单路径）；DECLARED_UNSUPPORTED_WINDOW_FIELDS 13 键（userAgent/incognito/proxyUrl/parent 等）schema 接受+onWarn 文档化保留；UPSTREAM_WINDOW_FIELDS 全集导出——G10。剩余：新键对应宿主实现随平台批（F2 尾项=13 键的 host 实现）|
| F3 ◐ | **bundler 产物器全集**：cli/src/bundler.ts 六 packer（nsis 完整 .nsi 安装脚本/msi WiX .wxs/appimage AppDir 布局/deb DEBIAN+control+rpm spec）——确定性控制文件全量生成+工具缺失时 built:false 带明示 reason（脚本就绪可跑）；app/dmg 沿用既有 macOS 实现。真机产物验证待目标平台——G13 |
| F4 ◐ | **CLI 子命令**：**signer 已落地**（generate/sign/verify，无密码 secret key；scrypt 加密 key 待续）——G3 批次；icon/info/add/migrate 仍待办 | tauri-cli crates + js cli | cli | icon/info 本机可验；add/migrate 适配 Ztron 语境 | ◐ |
| F5 ◐ | **macSignAndNotarize**：codesign(entitlements+runtime options)→ditto 压缩→notarytool submit --wait→stapler 全链；凭证缺失时输出完整命令计划(plan)；ZTRON_SIGN_IDENTITY/NOTARY_* 环境变量驱动。真凭证链验证待用户提供——G13 |
| F6 ✓ | **updater 工件**：packUpdaterArtifacts 产 latest.json(version/notes/pub_date/platforms.url+sha256+signature)+独立 .minisig，G3 minisign 验签闭环测试（含篡改拒绝）；ZTRON_UPDATER_KEYS 环境变量接 cli build——G13 |
| F7 ◐ | @zturnlibs/driver 包骨架：W3C /status 与 new-session 握手、平台 remote 表（linux WebKitWebDriver/win32 msedgedriver/darwin 显式无 remote 同上游）、spawn 派发与 CLI 入口；请求级转发留待目标平台验证（端口 4444/4445 同上游默认）——G14 |
| F8 ◐ | isolation pattern 评估结论（DESIGN §112）：上游该能力已废弃（pattern 模块移除、文档下线），按"移植上游现行面"原则 Ztron 不实现，仅冻结原型留作开关件——G14 |
| F9 ✓ | ACL 对拍测试（tests/unit/acl-parity.test.ts）：上游 9 插件命令表→Ztron 权限面映射完整性断言；NAME_MAP 显式登记 30+ 命名分歧（window 前缀/menu 类方法/webview 驼峰等）、KNOWN_GAPS 8 项审计白名单（default_window_icon/dataStore/autoResize/reparent 等）；deny `!cmd` 语法纳入校验；App.permissionSnapshot() 只读暴露——G14 |
| F10 | IPC 增强：ipc origin/远程域 capability 条件（remote url 匹配）核对 | acl capability remote | core 核对 | 本机可验 | ☐ |



> **A2 进度注（G4，DESIGN §104）**：功能面已落地——NativeIcon×56 表、IconMenuItem 创建期 icon 字段、setItemIcon 运行时换图、Menu.default()（create_default 五组建制 App/Edit/View/Window）、items() 结构化快照、removeAt(tombstone)、setAsWindowMenu/setAsWindowsMenuForNSApp/setAsHelpMenuForNSApp；api 补 NativeIcon/AboutMetadata/IconMenuItemOptions 类型与 Menu.default/new/snapshot/removeAt/窗口挂载方法。**剩余尾项**：真·上游式 rid 资源类（Submenu/CheckMenuItem/RadioMenuItem/PredefinedMenuItem/IconMenuItem 独立实例类）、AboutMetadata 点击面板 options、Legacy "Ed"(non-prehashed) 摘要模式默认关闭仅显式开启。
> **环境注**：本机 darwin 25.2 上 multiwin 的 destroy-flood 段出现 libwebview 消息处理 lambda 的 PAC SIGSEGV（§98 UAF 家族表现，G2 时同一链路尚稳）——menuprobe 因此从多窗洪泛中剥离独立成例；hello maximize 卡死同属该批环境漂移，两项均在待外部回归清单。


> **B9 进度注（G5，DESIGN §105）**：已落地——TrayRec×8 注册表（旧无-id 协议默认落 main 记录，线格式零破坏）、tray_create 携带 label=id、get_by_id（query 回链）/remove_by_id/set_show_menu_on_left_click（false 即摘除 setMenu 挂载，注册保留可 popup）；点击事件富化：宿主按 sender 归属 trayId、clickCount≥2 判 doubleClick、左右键判定、全局屏幕坐标（ZtPoint 帮手）。api 层 TrayIcon.getById/removeById statics、setShowMenuOnLeftClick(id)/onDetailedClick。**尾项**：move/enter/leave 事件族（需 NSTrackingArea 挂 button）、setTempDirPath（上游仅 Windows 有意义）、MouseDown/MouseUp 分相事件。
> **互操作验证**：menuprobe `TRAY_V2_OK`（create→exists=true→toggle 双向→remove→exists=false 全闭环于真 NSStatusItem 实例）。


> **A1 进度注（G6，DESIGN §107）**：已落地——print（wry 同款：页面 window.print() 经 eval 通道）、toggleDevtools（macOS 诚实桩：WKWebView 无公开开关，debug 构建常开；返回 supported:false + 原因而非静默失败）、Webview 级 setBackgroundColor（复用 handle 已有能力）、position()/size()（单 webview 时代与宿主窗口同余，G7 拆分前置条件注明）、getByLabel/getCurrentWebview 导出。**G7 依赖尾项**：窗口内多 webview 创建、reparent、setAutoResize、webview 级独立 hide/show/setSize/setPosition/setFocus、getAllWebviews 与窗口注册表解耦。
---

# 执行批次（Phase G 规划）

> 原则：安全项最先；同文件扎堆；每批次收口 = 测试全绿 + 设计文档章节记录。

| 批次 | 内容 | 消费项 |
|------|------|--------|
| G1 小而急（纯 TS/api 层为主） | C9 metadata label；C1 CloseRequestedEvent；B11 image 读回；D9 中 GS registerAll/unregisterAll | 4 项 |
| G2 应用生命周期 | B3/B4/B6/B7/B8 app show-hide/Dock/bundle_type/multiwin/identifier | 5 项 |
| G3 updater 安全链 | D1 + F4(signer) + F6 | 3 项 |
| G4 Menu 体系 | A2 全部 | 1 项 |
| G5 Tray 体系 | B9 | 1 项 |
| G6 webview/print/devtools/print | A1 除裸 multi-webview 拆分部分（print/toggle_devtools/backgroundcolor/getAllWebviews 真实化） | 6 项 |
| G7 裸 webview 拆分 | A1 核心（窗口内多 webview/reparent/autoresize）——最大改造 | 1 项 |
| G8 window 收尾 | B1/B2/B14/C2/C3/C4/C5/C12/C13 | 9 项 |
| G9 fs/http/store/log 深水 | D3/D4/D2/D6 + C7 | 5 项 |
| G10 conf/bundle schema | F1/F2/A1 触及的 conf 侧 | 2 项 |
| G11 新插件 | E1 localhost → E2 stronghold | 2 项 |
| G12 移动插件桩 | E3–E7 + B15（统一 adapter 桩规范） | 6 项 |
| G13 打包工具链移植 | F3/F5（win/linux 产物代码 + mac 公证链骨架） | 2 项 |
| G14 测试/治理基建 | F9 对拍脚本、F7 driver、C8 mocks、F8 isolation、F10 | 5 项 |

## 附：Ztron 反超项（无需处理，备忘）

opacity/transparent 运行时设置（上游 v2 仅 conf 层 shadow 侧保留）、setTrafficLightPosition 运行时版（上游仅 conf）、onFocused/onBlurred 便捷事件、setupDragRegion、Raw IPC 信封（base64-in-JSON，Tauri Android 同构建议）、fs.watch FSEvents 端到端、clipboard HTML flavor（上游无）、完整体键反注入 invokeKey。

## 维护说明

- 每次迭代收尾把完成的 ID 行改 ✓ 并在 DESIGN.md 追加 §N 章节实录（教训/证据 tag 必记）。
- 发现新差异 → 新增 ID 追加对应维度表格，不并入既有行。
- 本台账不设完成终态；上游升级（如 api 2.x→3）时重新全量对比一次并翻新版本基线。
