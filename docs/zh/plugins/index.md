---
title: 插件
---

# 插件

Ztron 的能力面由内建模块与插件构成，本节逐模块给出命令级参考：每个页面覆盖该模块的概述、权限与 Scope、可运行示例与命令清单，与[命令面参考](/reference/commands)互为对照。共 38 页，按功能分为五组：内建核心（窗口与应用骨架）、文件与网络（fs/http 等作用域约束的 IO）、桌面组件（托盘/菜单/对话框等原生 GUI）、数据与杂项（存储/日志/集成类插件），以及移动端功能桩（命令面对齐上游、桌面运行时上失败关闭）。

## 内建核心

| 插件 | 说明 |
| --- | --- |
| [窗口（window）](/plugins/window) | 原生窗口的控制与查询：`Window` 类、13 个窗口事件订阅、监视器查询与拖拽区辅助 |
| [WebView（webview）](/plugins/webview) | 窗口内嵌 Web 内容的 webview 层控制：打印、背景色、开发者工具、缩放、浏览数据清理等 |
| [运行时窗口（webview-window）](/plugins/webview-window) | 运行时创建原生窗口：`WebviewWindow` 继承 `Window`，新增 `create()` 在应用运行中真实创建第二个窗口 |
| [应用（app）](/plugins/app) | 应用元数据与整体生命周期：名称/版本/标识符查询、整应用显隐与 macOS Dock 图标开关 |
| [进程（process）](/plugins/process) | 两个进程级操作：退出应用与重启应用 |
| [事件（event）](/plugins/event) | 前后端双向事件系统的前端入口：监听后端命名事件、向前端/其他窗口定向发送 |
| [路径（path）](/plugins/path) | 路径工具：字符串运算、30 余个系统与应用目录 getter、打包资源解析与 `BaseDirectory` 名称表 |
| [图像（image）](/plugins/image) | 原生图像的注册与引用：注册后以 registry id（`rid`）供 `tray.setIcon`、`window.setIcon` 等使用 |
| [DPI 几何（dpi）](/plugins/dpi) | DPI 感知几何类型：逻辑像素随窗口 DPI 因子缩放，物理像素是真实设备像素 |
| [核心 IPC（core）](/plugins/core) | 前端传输层地基：`invoke` 调用后端命令、`Channel` 有序流式消息、`Resource` 资源句柄 |

## 文件与网络

| 插件 | 说明 |
| --- | --- |
| [文件系统（fs）](/plugins/fs) | 作用域约束的文件系统访问：每次读写按应用配置的 PathScope 校验路径，越界即拒绝 |
| [HTTP 客户端（http）](/plugins/http) | 作用域约束的 HTTP 客户端：请求前按 HttpScope 白名单匹配 URL，`fetch()` 与 `fetchStream()` 两个入口 |
| [命令执行（shell）](/plugins/shell) | 作用域约束的命令执行：`execute`/`executeStream`/`open` 与对齐 Tauri `Command` 类的命令构建器 |
| [WebSocket（websocket）](/plugins/websocket) | 后端代理的 WebSocket 连接：`connect`/`sendMessage`/`disconnect`，消息与状态经事件推送 |
| [网络信息（network）](/plugins/network) | 查询本机网络出口：主接口 IPv4/IPv6 与公网 IPv4 三个纯查询命令 |
| [本机 IP（local-ip）](/plugins/local-ip) | 返回主接口的 IPv4 地址（未知/离线时为 `null`），与 network 的同名查询按需取一 |
| [文件上传（upload）](/plugins/upload) | 把本地文件内容以原始 POST 上传到目标 URL，返回 `{ status, ok, body }` |
| [本地源服务（localhost）](/plugins/localhost) | 把目录以 `http://localhost:<port>` 源提供静态文件服务（`tjs.serve`），PathScope 门控 |
| [命令行参数（cli）](/plugins/cli) | 解析应用启动时的命令行参数：`getArgv()` 原始 argv、`getMatches()` 按 schema 解析 |

## 桌面组件

| 插件 | 说明 |
| --- | --- |
| [原生对话框（dialog）](/plugins/dialog) | 原生模态对话框：文件/目录选择、保存路径与消息三件套（`message`/`ask`/`confirm`） |
| [系统通知（notification）](/plugins/notification) | 发送系统级通知并管理通知授权（macOS 走 UNUserNotificationCenter） |
| [系统托盘（tray）](/plugins/tray) | 系统托盘（macOS 上是 NSStatusItem）：创建/销毁、标题与 tooltip、图标与菜单、可见性 |
| [应用菜单（menu）](/plugins/menu) | 原生菜单：应用/窗口菜单栏、托盘菜单、右键上下文菜单，及 check/radio/predefined 等条目类型 |
| [全局快捷键（global-shortcut）](/plugins/global-shortcut) | 注册应用未聚焦也能触发的全局热键（macOS 走 Carbon Register/UnregisterEventHotKey） |
| [剪贴板（clipboard）](/plugins/clipboard) | 读写系统剪贴板：纯文本、HTML flavor、PNG 图像与一键清空 |
| [应用更新（updater）](/plugins/updater) | 自更新：检查清单 → 下载 → 完整性校验 → 重启；SemVer 门槛 + sha256 + minisign 签名（失败关闭） |
| [持久化作用域（persisted-scope）](/plugins/persisted-scope) | 让 fs 的作用域允许列表跨重启存活：运行期授权的路径重启后依然有效 |
| [窗口状态（window-state）](/plugins/window-state) | 把当前窗口的几何状态（位置/大小/最大化等标志）持久化到 JSON 并在启动时恢复 |
| [窗口定位（positioner）](/plugins/positioner) | 读写当前窗口的位置与大小：`getPosition`/`setPosition`/`getFrame`/`getSize` |

## 数据与杂项

| 插件 | 说明 |
| --- | --- |
| [持久化键值存储（store）](/plugins/store) | 持久化键值存储：状态以 JSON 文件落盘，跨重启可用 |
| [结构化日志（log）](/plugins/log) | 五级结构化日志，分发到 stdout/stderr/file（带轮转）/webview 多目标 |
| [SQLite 数据库（sql）](/plugins/sql) | SQLite 访问（基于 `tjs:sqlite`）：`Database.load` 打开池化连接，`execute`/`select` 跑语句与查询 |
| [加密保险库（stronghold）](/plugins/stronghold) | 加密的持久化键值保险库：scrypt 派生密钥 + ChaCha20-Poly1305 AEAD 加密整份快照（纯 TS 重写） |
| [开机自启（autostart）](/plugins/autostart) | 让应用随系统登录自启：enable/disable/isEnabled 三个函数 |
| [单实例（single-instance）](/plugins/single-instance) | 保证每个应用同时只有一个运行实例：副实例启动时通知主实例并把窗口带到前台 |
| [深层链接（deep-link）](/plugins/deep-link) | 处理自定义 URL scheme 深链：外部以 `ztron://...` 打开应用时，运行中的页面能收到完整 URL |
| [打开器（opener）](/plugins/opener) | 用系统默认应用打开 URL 或路径、在文件管理器中定位显示条目 |

## 移动端（功能桩）

| 插件 | 说明 |
| --- | --- |
| [移动端插件一览（mobile）](/plugins/mobile) | 五个移动端方向插件（barcode-scanner/biometric/geolocation/haptics/nfc）：命令面对齐上游，桌面运行时每条命令确定性失败关闭（抛 `PluginUnavailable`） |

适用版本：`ztron 0.3.0`
