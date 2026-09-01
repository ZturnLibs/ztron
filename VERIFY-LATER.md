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

### ~~C1. hello 全链 maximize 卡死~~ —— 已修复（DESIGN §117）
- **真相**：两处自身回归被误判为环境漂移——①G1 窗口事件全局广播 + onCloseRequested 自动销毁兜底，别窗 close-requested 泄漏致 main 被毁；②G3 的 `Buffer.from` 在 tjs 无此全局直接抛错（单测跑在 Node 下有 Buffer，而唯一执行 tjs 的 hello spike 恒红，掩盖了 15 个批次）
- **修复**：窗口事件 emitTo 按 label 定向（上游语义）+ plugins/b64.ts 双运行时安全助手
- **验证**：hello 86 检查 FULL_OK 连续 3 轮；**ci.sh 全链 exit 0 首次达成**
### ~~C2. multiwin destroy-flood 段 SIGSEGV~~ —— 已修复（DESIGN §116）
- **根因**：vendored webview cocoa 后端的 script-message lambda 经 associated object 持有裸 `this`；窗口销毁（主队列延后的 webview_destroy）free 引擎后，WebKit IPC 管道中仍在途的 didPostMessage 稍后投递 → 虚调用读已释放内存 → SIGSEGV
- **修复**（webview-local.patch 内三重防护）：引擎存活注册表（构造注册/析构入口摘除）+ lambda 投递前 is_alive 校验（死指针→丢弃消息）+ 析构置空 associated 指针（兼防地址复用）
- **验证**：修复后 multiwin 连续 8 轮 5/5 检查全过（含 STRESS_OK）exit 0，.ips 崩溃计数零增长；此前该阶段几乎必崩

### C3. macOS Actions 全链 job
- **归因**：macos runner 10×计费烧穿免费额度（DESIGN §100），已降 workflow_dispatch
- **验证**：额度恢复后手动触发即应绿

---

## 附：验收快照（2026-09-01 更新，C 类隔离项清零）

- 单测 **110 tests / 109 pass / 1 skip**（Node 下需真 tjs 的 PathScope 用例）
- typecheck 全仓 0 错误；原生 `-Wall -Werror` 干净
- **ci.sh 全链 exit 0（首次）**：hello 86 FULL_OK ×3 + multiwin 5/5 ×2 + menuprobe 3/3
- 提交序列：`69d6e8c..27c2a76` 共 16 个（G1–G15 + 台账）
- GAP.md 消号 55 项；余项三类化：待环境（本清单）/ 远期深水（stronghold、同窗 webview、自研容器层）/ 平台边界（已文档化探针）
