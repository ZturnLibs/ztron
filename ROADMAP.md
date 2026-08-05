# Ztron ROADMAP — 能力差距与翻译路径

> Ztron 已完成 M0–M4(运行时/IPC/事件/插件/能力层/前端/打包最小闭环)。
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

- [ ] **P0.1 窗口状态 + 事件**(进行中):min/max/fullscreen/alwaysOnTop/center/focus/visible;resize/move/focus/blur/close → `tauri://*` 事件
- [ ] **P0.2 Tray**:host NSStatusItem/Shell_NotifyIcon → `plugin:tray|*`
- [ ] **P0.3 Menu**:host 菜单栏 → api `menu.ts`
- [ ] **P0.4 Dialog**:NSOpenPanel/NSSavePanel → `plugin:dialog|open/save`

### P1 最小权限模型(纯 TS)

- [ ] **P1.1 Capabilities/ACL**:Capability(窗口匹配+权限集合)、Permission(default/allow-<cmd>/deny-<cmd>)、IpcHub 分发前校验
- [ ] **P1.2 CLI capabilities.json** + `ztron.conf.json` zod schema
- [ ] **P1.3 http scope**:tjs fetch + URL allowlist

### P2 自定义协议 + HMR(C 层)

- [ ] **P2.1** host 注册 `ztron://` scheme,资产走自定义协议
- [ ] **P2.2** dev 切 vite dev server + `ztron://` 反代 → HMR
- [ ] **P2.3** devtools 开关、`asset://` convertFileSrc

### P3 插件生态(每个 = core 命令 + api + 权限)

- [ ] store(kv) · http · shell · os · log · notification · clipboard
- [ ] positioner · window-state · autostart · sql(tjs:sqlite 包装)

### P4 开发者体验

- [ ] 命令 codegen(扫描命令 → 前端 TS 类型绑定,替代 tauri-codegen)
- [ ] 测试:mock RuntimeAdapter + 命令单测 + WebDriver

### P5 分发与平台

- [ ] Windows(NSIS/MSI)+ Linux(AppImage/deb)打包
- [ ] updater(轮询+签名校验)、图标/签名/公证
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
