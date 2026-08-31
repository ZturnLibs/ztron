# VERIFY-LATER.md — 待环境验证清单

> 本会话（G1–G15 批次）按"平台不支持也先移植，待用户提供环境后验证"的约定完成的对齐工作交付面。
> 三类：**A. 待目标平台**（代码全量就绪）/ **B. 待凭证或账号** / **C. 本机环境漂移**（已归因为存量/上游问题，需在健康环境复跑）。
> 每项给出：验证所需环境 + 验证命令/方法 + 判定标准。

## A. 待目标平台（代码 100% 就绪，产物/运行待真机）

### A1. Windows / Linux 原生宿主全链
- **就绪内容**：host_windows.c（MSVC -W4 -WX 过）、host_linux.c（gtk+webkit2gtk 全链接过，CI 已修六类真错误）、CI 矩阵曾三平台绿
- **所需环境**：Windows 10/11 + WebView2 SDK + MSVC；Ubuntu + `libgtk-3-dev webkit2gtk-4.1`
- **验证方法**：`bash scripts/build-native.sh`（Linux）或 MSVC 构 host.c+host_windows.c；跑任一 example `ztron check`
- **判定**：窗口/托盘/菜单/对话框/spike 检查在真机过

### A2. 安装器产物（F3）
- **就绪内容**：`packages/cli/src/bundler.ts` 五 packer——nsis（完整 MUI2 脚本）/msi（WiX .wxs）/appimage（AppDir 布局）/deb（DEBIAN/control）/rpm（spec）；单测断言控制文件内容
- **所需环境**：Windows（makensis / WiX candle+light）；Linux（appimagetool / dpkg-deb / rpmbuild）
- **验证方法**：目标机上 `ztron build`（conf `bundle.targets: ["nsis","msi"]` 等）后安装产物实跑
- **判定**：安装→启动→卸载全流程

### A3. 移动插件桩（E3–E7）
- **就绪内容**：barcode-scanner/biometric/geolocation/haptics/nfc 命令面+api+权限集；桌面 fail-closed（PluginUnavailable，测试已验）
- **所需环境**：Android/iOS 宿主桥（未来 mobile host）
- **验证方法**：真机调用五插件命令
- **判定**：各命令返回真机数据

### A4. ztron-driver 转发（F7）
- **就绪内容**：`packages/driver`——W3C /status、new-session→平台 remote 表（Linux WebKitWebDriver/Windows msedgedriver/darwin 无 remote 同上游）、spawn 派发
- **所需环境**：Linux 或 Windows + 对应 WebDriver remote
- **验证方法**：`ztron-driver` 起服务后用 WebDriver 客户端建会话
- **判定**：会话建立并转发命令

## B. 待凭证 / 账号

### B1. Developer ID 签名 + 公证（F5）
- **就绪内容**：`macSignAndNotarize`（codesign entitlements+runtime→ditto→notarytool --wait→stapler）；无凭证时输出完整命令计划
- **所需**：Apple Developer 账号 + "Developer ID Application" 证书 + App 专用密码（`ZTRON_NOTARY_APPLE_ID/TEAM_ID`）
- **验证方法**：设 `ZTRON_SIGN_IDENTITY` 为真身份跑 `ztron build`
- **判定**：`spctl -a -vv` 通过 + Gatekeeper 首启免拦

### B2. 真·minisign 工具互测（G3 尾注）
- **就绪内容**：线格式按 jedisct1 源码逐字段对齐 + node:crypto 双向互操作全绿
- **所需**：`brew install minisign`
- **验证方法**：`minisign -G` 生成 key → Ztron verify；Ztron signer 签名 → `minisign -V`
- **判定**：双向 verify 通过

### B3. GitHub Packages 重发布
- **就绪内容**：publish.yml 五包拓扑序流水线（0.1.0 已发成功过）；本会话新增 driver 包待入 publish 清单
- **所需**：GitHub Actions 额度恢复
- **验证方法**：打 tag `v*` 触发
- **判定**：`@zturnlibs/driver@0.1.0` 出现在 Packages

## C. 本机环境漂移（已归因存量，健康环境复跑即应绿）

### C1. hello 全链 maximize 卡死
- **现象**：MULTI_WINDOW_OK 后 `win.maximize()` 处挂起（53 checks 超时）
- **归因**：stash 全部改动后干净基线同样卡死 → darwin 25.2 窗管行为漂移，非任何批次回归（DESIGN §102 记录）

### C2. multiwin destroy-flood 段 SIGSEGV
- **现象**：10 轮建/毁窗洪泛后 host 崩（PAC failure in libwebview message handler lambda）→ EPIPE 连锁
- **归因**：§98 论证的 vendored-webview UAF 投递路径（同家族曾三 PR 上游）；G2 时同链路尚稳 → 系统更新显形；崩溃栈已存 `~/Library/Logs/DiagnosticReports/ztron-host-*.ips`
- **当前门禁替代**：menuprobe/multiwin 其余探针独立验证全绿；hello FULL_OK 待此两项修复后自然恢复

### C3. macOS Actions 全链 job
- **归因**：macos runner 10×计费烧穿免费额度（DESIGN §100），已降 workflow_dispatch
- **验证**：额度恢复后手动触发即应绿

---

## 附：本会话验收快照（2026-08-31）

- 单测 **110 tests / 109 pass / 1 skip**（Node 下需真 tjs 的 PathScope 用例）
- typecheck 全仓 0 错误；原生 `-Wall -Werror` 干净
- menuprobe 探针 `MENU_V2_OK / TRAY_V2_OK / LOCALHOST_OK` exit 0（真宿主）
- multiwin `SECOND_WINDOW_OK / SECOND_OPS_OK / APP_LIFECYCLE_OK` exit 0
- 提交序列：`69d6e8c..27c2a76` 共 16 个（G1–G15 + 台账）
- GAP.md 消号 55 项；余项三类化：待环境（本清单）/ 远期深水（stronghold、同窗 webview、自研容器层）/ 平台边界（已文档化探针）
