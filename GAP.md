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
| A1 ◐ | **裸 Webview/单窗多 webview——已裁决为平台边界**(DESIGN §115):vendored C API 1:1 创建期绑定,同窗多 webview/reparent/autoResize 需改库本体;能力探针 plugin:webview\|capabilities 诚实上报;Ztron 等价物=多窗口 per-window webview(跨窗控制/事件/destroy 已真实)|
| A2 ✓ | Menu 类体系全量（G4+G18 两批）：NativeIcon×56、IconMenuItem/MenuItem/CheckMenuItem/RadioMenuItem/PredefinedMenuItem（12 工厂）/Submenu 运行时挂载、Menu.default、items/removeAt、窗口与 NSApp 角色挂载、AboutMetadata 类型面；config 接口更名 MenuItemOptions|

# B. core 命令面（逐条对齐 build.rs PLUGINS）

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| B1 ✓ | 事件族补齐：WINDOW/WEBVIEW_CREATED 建窗广播（core createWindow，upstream app-wide 语义）；SUSPENDED/RESUMED 命名面+路由映射（macOS 桌面不触发，移动生命周期对齐）；api 增 TauriEvent 16 常量枚举——G17 实现|
| B2 ✓ | cursor_position 无窗全局回退本就内建（无 wnd 直接 mouse_screen）；api 新增零参 standalone cursorPosition() 导出
| B3 ✓ | app 级 show/hide（NSApp hide:/unhideWithoutActivation+activate；G2 批次，DESIGN §102） | core:app app_show/app_hide | host C + core + api | macOS 可验（multiwin APP_LIFECYCLE_OK ✓） | ✓ |
| B4 ✓ | setDockVisibility（activationPolicy Regular/Accessory，与 skip_taskbar 同机制独立 API；G2 批次） | core:app set_dock_visibility | host C + core + api | macOS 可验（multiwin ✓） | ✓ |
| B5 ✓ | default_window_icon 命令+api（null=未设，Option 语义；dock 图标走 conf/Info.plist）——G15|
| B6 ✓ | bundle_type 查询 + BundleType 枚举（exe 路径判定 .app/Nsis/Msi/AppImage；安装器标记待 F3 接入；G2 批次） | core:app bundle_type | core + api | 本机可验 | ✓ |
| B7 ✓ | supports_multiple_windows 查询（桌面恒 true；G2 批次） | core:app supports_multiple_windows | core + api | 本机可验 | ✓ |
| B8 ✓ | getIdentifier 独立函数 + plugin:app\|identifier 命令（G2 批次） | core:app identifier | core + api | 本机可验 | ✓ |
| B9 ◐ | Tray 多实例+事件：主体 G5 已落（多实例/富化 click）；G19 增 enter/leave/move（NSTrackingArea+每托盘独立 hover owner，无 swizzle）；**hover 执行验证待环境恢复**（syspolicyd/trustd 楔死，DESIGN §121）；剩 MouseDown/Up 分相（并入 click payload，NSStatusBarButton 未子类化）|
| B10 ✓ | menu 22 条核对：命令面等价映射已显式登记于 F9 NAME_MAP（类方法↔命令面/查询经 item_info 三合一/set_accelerator=set_item_accel）；无语义缺口——G16 审计|
| B11 ✓ | Image 读回全量：宿主注册期真解码（TIFF→NSBitmapImageRep→CGImage→CGBitmapContext RGBA），image_rgba_query/dims_query 回链 + core 回退（fromRGBA 信封优先）；menuprobe IMG_READBACK_OK:1024x1024 真机验证——G17 实现|
| B12 ✓ | path resolve_directory：api resolveBaseDirectory（23 目录 getter）+baseline_dir 承担其角色，NAME_MAP 记录命名分歧；BaseDirectory 枚举已导出——G16 审计|
| B13 ✓ | core:resources\|close 命令落地（rid→image 注册表路由；menu/tray 走各自 destroy），Resource.close 基类不再指向空命令——G16 实现|
| B14 ✓ | inner_position 独立精确值：host contentLayoutRect→convertBaseToScreen 新查询 op + core 命令 + api 切换；menuprobe INNER_POS_OK:1070,934 真机验证——G16 实现|
| B15 ✓ | ActivityName(Android)/sceneIdentifier(iOS)：get→null + set 文档化 no-op 四命令 + api Window 四方法——G12 | window/plugin.rs | core+api | 桌面已验 | ✓ |

# C. @tauri-apps/api 包层（v2.11.1 逐导出对齐）

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| C1 ✓ | **CloseRequestedEvent 类 + preventDefault/isPreventDefault**：onCloseRequested(handler) 语义改为「执行 handler→未 prevent 则 destroy()」动态决策（G1 批次落地，2026-08-27，DESIGN §101） | api/src/window.ts CloseRequestedEvent + onCloseRequested | api（host 无关） | 本机可验 | ✓ |
| C2 ✓ | CursorIcon 常量表（35 联合成员含 resize 族；as-const 对象+派生类型）
| C3 ✓ | ProgressBarStatus 枚举贯通：api 状态对象归一化→wire -3 哨兵→host 不确定态旋转条分支（setContentView+startAnimation）；None 清除
| C4 ✓ | request_user_attention 修正真实 AppKit raw 值 Critical=10/Info=0（原误发 1），enum 贯通保留
| C5 ✓ | dpi Size/Position 包装器（源自适应 Logical/Physical 判别，to* 双向换算 + toJSON 带判别键）
| C6 ✓ | EventTarget 语义收口：窗口事件按 label 定向（C1 修复）；App-kind=广播的设计正当性入注（两进程模型无进程内监听器，与上游 app.emit 到达所有窗口一致）——G17|
| C7 ✓ | BaseDirectory 枚举（23 值 as-const）+ resolveBaseDirectory + v1 fs 函数可选 options.baseDir（相对路径拼接，绝对路径直通）——G9 批次 |
| C8 ✓ | mocks.ts 四件套：mockIPC（内存 invoke）/mockWindows（currentWindow·currentWebview·label 三形 metadata）/mockConvertFileSrc/clearMocks（全量还原）——G14 |
| C9 ✓ | inject `metadata.currentWindow.label/currentWebview.label`：loadHtml 路径烘焙真实 label；URL 路径经 `#ztron-window=` hash 标记由注入脚本解析（G1 批次落地，DESIGN §101） | global.d.ts internals 契约 | core app.ts + inject build.ts | 本机可验 | ✓ |
| C10 ✓ | withGlobalTauri 等价：inject buildInitScript 新增开关，开启时附 `window.__ZTRON__ = __ZTRON_INTERNALS__`；conf app.withGlobalTauri → createWindow bootstrap 贯通——G10 |
| C11 ✓ | api 子路径 exports 全量（./app…./window 12 条，upstream 同构）；tsc 逐文件产物天然满足——G16 实现|
| C12 ✓ | EffectState 协议核对：Follows=-1 跳过显式 setState/Active=0/Inactive=1 与 NSVisualEffectState 映射正确，无需改动——G16 审计|
| C13 ✓ | dpi toJSON 判别键契约 G8 已验（补翻状态行）|

# D. 已实现插件深度差距

| ID | 缺口 | 上游参照 | 层 | 平台 | 状态 |
|----|------|----------|----|------|------|
| D1 ✓ | **updater 安全链**：minisign 兼容签名校验（纯 TS ed25519/sha512/blake2b，与 jedisct1/minisign 线格式对齐；pubkey 配置即 fail-closed 门禁）、SemVer 2.0.0 precedence、downloadAndInstall 进度事件（Started/Progress/Finished 经 Channel）——G3 批次落地，DESIGN §103；install modes(passive/basicUi) 待 GUI 层后续 | plugins-workspace/updater v2 | core + api + CLI signer | 本机可验（单测互操作全绿 + CLI 冒烟） | ✓ |
| D2 ✓ | **store 资源化**：Store 实例语义（load/save/saveTo/reset/close/setAutoSave + onChange Channel 推 set/delete/reset）、v1 path 命令面零破坏、权限集 read/write/default 重组（hello capability 的 store:write 保持）——G9 批次 |
| D3 ◐ | **fs 高级面**：handle 式 IO（open/read/seek/write/flush/close，游标+flush-on-close，命令面与上游对齐；大文件流式待真实 tjs.open 绑定）、lstat/readLink/truncate/chmod（运行时 feature-detect，stub 全语义单测）、watch recursive 明示不支持（libuv fs_event 无可移植递归）、scope 路径模型维持（上游本就无大小上限，台账原项系误记已删）——G9 批次 |
| D4 ◐ | **http 类型完整**：body 扩展（Uint8Array/ArrayBuffer→b64 信封、普通对象自动 JSON+隐式 content-type）、responseType json（解析失败得 null 与上游一致）/binary（Raw 信封）；FormData/请求体流式/proxy-connectivity 为 tjs fetch 能力外，留明示不支持语义——G9 批次 |
| D5 ✓ | cli 声明式 schema（G18）：clap 形态 args/subcommands（short/long/inline=/takesValue/multiple/required/conflicts/index/default/嵌套子命令）+ CliArgDef/CliSchema 类型导出；旧扁平 {subcommands,booleans} 兼容自动合成；6 组新单测——实现|
| D6 ◐ | log：attachLogger/detachLogger 客户端多路 sink（上游 webview-target 语义对齐）——G9 批次；format 函数注入/timeStrategy 待续 |
| D7 ✓ | dialog 选项：filters（allowedFileTypes CSV）/maxFiles（多选+JSON 数组回执，api 返回 string\|string[]\|null）/canCreateDirectories 全链接入；modal 交互本机不自动测（注册级已测）——G16 实现|
| D8 ✓ | shell：Command cwd/env 选项已在（G 早期）；program/args scope 匹配（matchScope+正则 args）已在；审计通过——G16|
| D9 ◐ | 插件选项级核对：GS 批量(G1)/dialog(D7)/shell(D8)/store/http/fs/log(G9)/menu(B10)/tray(B9)/image(B11)/path(B12)已逐项落账；余 websocket/upload/persisted-scope/deep-link/window-state/sql/os/autostart/single-instance/opener/notification/clipboard 的 README 级 option 差异清单（多数为 tauri 特有重试/回调选项，语义已由现有面覆盖或属平台绑定）——降级为低优先核对，不阻塞主线|

# E. 官方插件缺失（29 官方 − 23 已实现）

| ID | 插件 | 说明 | 层 | 平台 | 状态 |
|----|------|------|-----|------|------|
| E1 ✓ | **localhost**：`tjs.serve` fetch-handler 服文件（PathScope 根锚定+扩展名 MIME 表+403/404 语义），start/stop/status 命令 + api localhost/start·stopLocalhost；menuprobe LOCALHOST_OK（真 tjs.serve 临时端口往返）——G11 批次 | plugins-workspace/localhost | core+api | macOS 本机可验 | ✓ |
| E2 ✓ | **stronghold（TS 重写方案落地）**：纯 TS 密码学族（sha256/hmac/pbkdf2/scrypt/chacha20-poly1305，全部对 node:crypto/RFC 向量对拍）+ ZTSH1 快照格式（salt+参数+nonce+AEAD 密文+tag）+ 12 命令插件（load/get/set/has/remove/keys/clear/save/save_to/close/reload）+ api Stronghold 类；错密码/密文篡改 fail-closed 实测——G20/DESIGN §122|
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
| F4 ✓ | CLI 子命令 7/7：signer（含 **scrypt 加密 secret key**：kdf_alg"Sc" 格式字节对齐 minisign/libsodium 默认参数 N=2^14,r=8，--password/ZTRON_SIGNER_PASSWORD；错密码在 blake2b 校验门拒，往返+签名验证实测）/icon/info/add/migrate——G20 收官；真·minisign 工具互测仍列 VERIFY-LATER|
| F5 ◐ | **macSignAndNotarize**：codesign(entitlements+runtime options)→ditto 压缩→notarytool submit --wait→stapler 全链；凭证缺失时输出完整命令计划(plan)；ZTRON_SIGN_IDENTITY/NOTARY_* 环境变量驱动。真凭证链验证待用户提供——G13 |
| F6 ✓ | **updater 工件**：packUpdaterArtifacts 产 latest.json(version/notes/pub_date/platforms.url+sha256+signature)+独立 .minisig，G3 minisign 验签闭环测试（含篡改拒绝）；ZTRON_UPDATER_KEYS 环境变量接 cli build——G13 |
| F7 ◐ | @zturnlibs/ztron-driver 包骨架：W3C /status 与 new-session 握手、平台 remote 表（linux WebKitWebDriver/win32 msedgedriver/darwin 显式无 remote 同上游）、spawn 派发与 CLI 入口；请求级转发留待目标平台验证（端口 4444/4445 同上游默认）——G14 |
| F8 ◐ | isolation pattern 评估结论（DESIGN §112）：上游该能力已废弃（pattern 模块移除、文档下线），按"移植上游现行面"原则 Ztron 不实现，仅冻结原型留作开关件——G14 |
| F9 ✓ | ACL 对拍测试（tests/unit/acl-parity.test.ts）：上游 9 插件命令表→Ztron 权限面映射完整性断言；NAME_MAP 显式登记 30+ 命名分歧（window 前缀/menu 类方法/webview 驼峰等）、KNOWN_GAPS 8 项审计白名单（default_window_icon/dataStore/autoResize/reparent 等）；deny `!cmd` 语法纳入校验；App.permissionSnapshot() 只读暴露——G14 |
| F10 ◐ | capability remote 字段已入 schema（解析+携带，注释注明 IPC 无 origin 信息故暂不 enforcement——ztron:// 单源模型）；真正 enforcement 待远程前端出现时随 origin 追踪落地——G16|



> **A2 进度注（G4，DESIGN §104）**：功能面已落地——NativeIcon×56 表、IconMenuItem 创建期 icon 字段、setItemIcon 运行时换图、Menu.default()（create_default 五组建制 App/Edit/View/Window）、items() 结构化快照、removeAt(tombstone)、setAsWindowMenu/setAsWindowsMenuForNSApp/setAsHelpMenuForNSApp；api 补 NativeIcon/AboutMetadata/IconMenuItemOptions 类型与 Menu.default/new/snapshot/removeAt/窗口挂载方法。**剩余尾项**：真·上游式 rid 资源类（Submenu/CheckMenuItem/RadioMenuItem/PredefinedMenuItem/IconMenuItem 独立实例类）、AboutMetadata 点击面板 options、Legacy "Ed"(non-prehashed) 摘要模式默认关闭仅显式开启。
> **环境注**：本机 darwin 25.2 上 multiwin 的 destroy-flood 段出现 libwebview 消息处理 lambda 的 PAC SIGSEGV（§98 UAF 家族表现，G2 时同一链路尚稳）——menuprobe 因此从多窗洪泛中剥离独立成例；hello maximize 卡死同属该批环境漂移，两项均在待外部回归清单。


> **B9 进度注（G5，DESIGN §105）**：已落地——TrayRec×8 注册表（旧无-id 协议默认落 main 记录，线格式零破坏）、tray_create 携带 label=id、get_by_id（query 回链）/remove_by_id/set_show_menu_on_left_click（false 即摘除 setMenu 挂载，注册保留可 popup）；点击事件富化：宿主按 sender 归属 trayId、clickCount≥2 判 doubleClick、左右键判定、全局屏幕坐标（ZtPoint 帮手）。api 层 TrayIcon.getById/removeById statics、setShowMenuOnLeftClick(id)/onDetailedClick。**尾项**：move/enter/leave 事件族（需 NSTrackingArea 挂 button）、setTempDirPath（上游仅 Windows 有意义）、MouseDown/MouseUp 分相事件。
> **互操作验证**：menuprobe `TRAY_V2_OK`（create→exists=true→toggle 双向→remove→exists=false 全闭环于真 NSStatusItem 实例）。


> **A1 进度注（G6，DESIGN §107）**：已落地——print（wry 同款：页面 window.print() 经 eval 通道）、toggleDevtools（macOS 诚实桩：WKWebView 无公开开关，debug 构建常开；返回 supported:false + 原因而非静默失败）、Webview 级 setBackgroundColor（复用 handle 已有能力）、position()/size()（单 webview 时代与宿主窗口同余，G7 拆分前置条件注明）、getByLabel/getCurrentWebview 导出。**G7 依赖尾项**：窗口内多 webview 创建、reparent、setAutoResize、webview 级独立 hide/show/setSize/setPosition/setFocus、getAllWebviews 与窗口注册表解耦。
> **G16 审计批注（DESIGN §118）**：核对类十项收口——真缺口四项已实现（C11 exports 子路径 / B13 resources\|close / B14 inner_position 精确值 / D7 dialog filters·maxFiles·canCreateDirectories）；六项核对通过零改动或仅文档（B10/B12/C12/C13/D8 + F10 schema 半步）；D9 剩余插件选项级核对仍开放。

---

# H. Windows ↔ macOS 平台内差距（2026-10-03 全量盘点，基线 @efd42a5）

> GAP A–G 记 Tauri↔Ztron 对齐；本表记 **Ztron 自身平台实现之间**的差距。方法：`host_macos.c`（3697 行/133 op）↔ `host_windows.c`（1874 行/115 op）dispatch op 全集对照 + `runtime-ffi/src/host.ts` 事件路由核查。平台不支持 ≠ 不移植：Windows 有等价 Win32/WebView2 API 的一律列为待移植项。

## P0 — bug 级（功能失效/挂起）

| ID | 缺口 | 证据 | 状态 |
|----|------|------|------|
| H1 | **dialog_ask/dialog_confirm 未处理** → `dialog.ask()`/`confirm()` Promise 永久挂起（host.c 静默丢弃，query_result 永不返回） | runtime-ffi `host.ts:760/766` 无条件发送；`host_windows.c` 无对应分支 | ✓ `dialog_confirm_like`（MB_OKCANCEL/MB_YESNO + kind→icon，JSON true/false 回执对齐 mac）——DESIGN §125 |
| H2 | **窗口事件误路由**：move/resize/close/focus/blur 发成 `tray_event` → `Window.onMoved/onResized/onFocusChanged/onCloseRequested` 永不触发；托盘监听器收无 trayId 垃圾事件 | `host_windows.c:628-638` vs mac `emit_window_event_labeled`（:1260） | ✓ `emit_window_event`（window_event+label 线格式同 mac），WM_ACTIVATE/MOVE/SIZE/CLOSE 全改路由——DESIGN §125 |
| H3 | **prevent_close 无效**：`set_prevent_close` stub，WM_CLOSE 放行 → `preventDefault()` 阻不住关闭。mac 语义：prevent 开启时拦截 + 发 close 事件 + 不关闭，由 backend 决定 destroy | `host_windows.c:636/1414` vs mac `zt_should_close`（:1339） | ✓ WM_CLOSE 查 WinState 拦截/放行 + relaunch 改 webview_terminate 防自吞——DESIGN §125 |
| H4 | **多窗口裸奔**：`attach_webview=NULL`，仅主窗口被 subclass → 第二窗口无事件/min-max size 是全局量（g_min_w）/无 close 处理 | `host_windows.c:1874/119` vs mac attach_webview 完整 | ✓ `WinState[16]`（hwnd 键 min/max/prevent_close）+ attach_webview SetWindowSubclass + WM_DESTROY 摘表——DESIGN §125 |

## P1 — 功能级缺失

| ID | 缺口 | Windows 可接 API | 状态 |
|----|------|------------------|------|
| H5 | `ztron://` scheme handler 无实现（内容走 file://，ACL 单源 origin 模型不可用） | WebView2 `WebResourceRequested`（wry 同构） | ✓ 同步 `CreateWebResourceResponse` + `EnvironmentOptions4::SetCustomSchemeRegistrations`（Chromium 在资源管线之前拦未注册 scheme）+ options 进程级单例（同 UDF 二次创建异 options → ERROR_INVALID_STATE）——DESIGN §126 |
| H6 | WebView2 权限桥缺失：`onPermissionRequest` no-op（PR #39 仅 mac 实现，win 无 `PermissionRequested` 接线） | `ICoreWebView2::add_PermissionRequested` | ✓ lib 级 permission handler API（仅 camera/mic，mac parity）+ `GetDeferral` 挂起 + 决策 0/1/2 与 `PERMISSION_STATE` 逐值对齐；host init/attach 双装桥（0ca12de 教训）；TS 侧零改动——DESIGN §127 |
| H7 | window effects 无视觉效果（round-trip only） | `DwmSetWindowAttribute` Mica/Acrylic/`DWM_SYSTEMBACKDROP_TYPE` | ✓ |
| H8 | 拖放事件族不存在：无 drag_enter/over/drop/leave 推送 + `set_file_drop_enabled` 缺失 → `onDragDropEvent` 不可用 | `IDropTarget`（wry 同构） | ✓ 手写 IDropTarget COM 对象（vtbl 七方法）落在 WebView2 子 HWND：EnumChildWindows + `OleDropTargetInterface` 属性定位 Chromium 原生 target → RevokeDragDrop + RegisterDragDrop 换成我们的；路径 CF_HDROP→DragQueryFileW→JSON 数组，坐标 POINTL→ScreenToClient（窗口本地物理像素，mac drop_emit 同构）；`drop_disabled` 门 + set_file_drop_enabled；dragdrop_simulate host-only 测试 op（内存 DROPFILES 走真实提取/发射链）；host.c 新增 `zt_json_raw`（数组值原样提取）——DESIGN §129 |
| H9 | deep-link 全链路不通：无 scheme 注册表写入、无 deep_link 事件推送 | HKCU`Software\Classes`+`WM_COPYDATA`/argv 转发 | ✓ `zt_deeplink_preinit`（main 最早期，先于 socket/webview/backend）：HKCU\Software\Classes\ztron 幂等注册（LSRegisterURL 同构，后写者赢）+ argv 扫 ztron:// URL → 有同 exe 活实例（EnumWindows+class `webview`+QueryFullProcessImageNameW 校验）则 WM_COPYDATA（magic 'ZDLK'）转发并退出（转发进程不 bind 不建窗）；无实例则存 pending 由 dispatch 首条 backend 消息补发（emit 时机=TS 已证明在听）；接收走 zt_proc WM_COPYDATA 分支 → deep_link 行与 mac ae_geturl_handler 逐字段同形——DESIGN §130 |
| H10 | `webview_clear_data` 缺失 → `clearBrowsingData()` 静默无效 | `ICoreWebView2_13::ClearBrowsingData` | ✓ 手写 vtbl 链（vendored header 止于 _10）：QI `ICoreWebView2_13`（IID f75f09a8…）→ get_Profile（flat slot 105，_13 唯一新增）→ QI `ICoreWebView2Profile2`（fa740d4b…）→ ClearBrowsingDataAll（slot 12，3 IUnknown+7 Profile 方法在前）；4 方法 COM CompletedHandler（QI/AddRef/Release/Invoke，WebView2 自持引用用后 Release）；语义对齐 mac defaultDataStore 全清（fire-and-forget）。探针证实对标准 http origin localStorage+cookie 双通道真清（fresh-renderer 读回 null）；平台事实：活文档 renderer 缓存跨清除存活、custom-scheme（ztron://）DOM storage 即使 success 也不清（Runtime 154）——DESIGN §131 |
| H11 | `set_theme` 缺失 + 无主题变更推送（查询读注册表✓，但 `onThemeChanged` 不触发） | `AppsUseLightTheme`+`WM_SETTINGCHANGE` | ✓ `set_theme` app-wide（NSApp.appearance 同构）：双钩子落地——DWMWA_USE_IMMERSIVE_DARK_MODE(20) 标题栏 + `Profile2::put_PreferredColorScheme` slot 9 内容色（dark/light override，"" 跟随系统 g_theme_override）；推送=zt_proc WM_SETTINGCHANGE("ImmersiveColorSet") → 跟随时重 apply 全窗 + emit theme_change（线形=mac emit_theme_change_all：main 先行+注册表遍历，theme=effective）；window_get_theme 改 effective 语义（对齐 effectiveAppearance）——**Profile 独立层级：从 ICoreWebView2 直接 QI Profile2 是 E_NOINTERFACE，必须 _13::get_Profile 再 QI**——DESIGN §132 |
| H12 | 通知降级为托盘气球（依赖托盘存在，无托盘时静默失败）+ is_granted/request_permission 缺失 | WinRT `ToastNotification` | ✓ 纯 C vtbl 全链（SDK um/ 无 WinRT C ABI 头）：IID 从本机 .NET WinRT 投影提取（`[Type]::GetType(...).GUID`）——ManagerStatics/ToastNotifier/ToastNotification/ToastNotificationFactory/XmlDocumentIO；**槽位必须以 .NET 投影方法序为准**（GetTemplateContent=8、CreateToastNotifierWithId=7、get_Setting=8——按猜测布局把无参 `CreateToastNotifier()` 当 `GetTemplateContent` 调 = 单 out 参数写进 RDX=0 → NULL 写 → host 崩）；**WinRT activation 要求 MTA——dispatch/UI 线程已被 WebView2 占成 STA（RPC_E_CHANGED_MODE），toast 链跑在每次调用新起的 MTA 线程上同步等待**（低频操作，线程创建成本可忽略）；AUMID="ztron-host" 裸语义（Tauri/wry 同款，无 Start-menu 身份也能建 notifier+Show=S_OK，get_Setting 报 ELEMENT_NOT_FOUND 但值槽=默认 Enabled——真实接受性以 Show HRESULT 为准）；notification_send = toast 优先/托盘气球回退；is_granted=get_Setting==0、request_permission=报当前可接受性（Windows 无 per-app 授权 API，Tauri 同款恒 true 语义）；每跳 HRESULT 经 notification_diag 读回（链接 runtimeobject.lib）——DESIGN §133 |

## P2 — 功能面缺口（op 级）

| ID | 缺口 | 状态 |
|----|------|------|
| H13 | `menu_popup` stub（仅托盘点击可弹）→ 程序化弹出菜单不可用 | ☐ |
| H14 | `menu_create_default`/`menu_set_item_icon`/`menu_set_window_menu` 缺失（无 Menu.default()、IconMenuItem 无 owner-draw、菜单栏全局单一挂载） | ☐ |
| H15 | `app_show`/`app_hide`/`app_set_dock_visibility` 三 op 缺失（Windows 等价：主窗口 ShowWindow/skip_taskbar） | ☐ |
| H16 | `set_background_color` 缺失 | WebView2 `put_DefaultBackgroundColor` | ☐ |
| H17 | 托盘单实例 + click 仅 WM_LBUTTONUP（无右键事件/doubleClick/move/enter/leave） | ☐ |
| H18 | `set_badge_count/label` round-trip only（需 GDI 文本→HICON overlay）、`set_cursor_grab`/`set_visible_on_all_workspaces` no-op | ☐ |
| H19 | `set_titlebar_style`/`set_traffic_light_position`/`tray_set_icon_template` — macOS 专属概念，标记 N/A（不改） | N/A |

## P3 — 打包/工具链

| ID | 缺口 | 状态 |
|----|------|------|
| H20 | msi 仅 WiX 骨架（candle+light 未接）；无 Authenticode 签名（mac 有 codesign+notarize 全链 F5） | ☐ |
| H21 | driver msedgedriver remote：spawn 表有，请求级转发待真机验证（VERIFY-LATER A1） | ☐ |
| H22 | single-instance argv 恒 `[]`（第二实例参数不转发，上游 Windows 走命名管道） | ☐ |

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

## 交付件

- **VERIFY-LATER.md** — 全部"移植完成、待环境验证"项的执行清单(A 待目标平台/B 待凭证/C 本机环境漂移),含每项所需环境+验证命令+判定标准;环境就位后按单执行即可闭环。

## 维护说明

- 每次迭代收尾把完成的 ID 行改 ✓ 并在 DESIGN.md 追加 §N 章节实录（教训/证据 tag 必记）。
- 发现新差异 → 新增 ID 追加对应维度表格，不并入既有行。
- 本台账不设完成终态；上游升级（如 api 2.x→3）时重新全量对比一次并翻新版本基线。
