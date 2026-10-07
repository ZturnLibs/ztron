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
- **✅ Windows 侧已闭环（2026-10-03，真机 Win11 + MSVC 2022 BuildTools）**：host 重编（含 P0 批 H1–H4，DESIGN §125）后 hello FULL_OK（85–87 检查多轮）+ multiwin 5/5 + menuprobe 5/5 + 新增 winevent-probe 4/4（窗口事件路由/prevent_close 拦截/存活/销毁退出）；`ztron check` 三例 + 探针均真窗口实跑。Linux 侧仍待环境
- **✅ showcase 门禁 Windows 绿（2026-10-07，真机 Win11）**：`cd examples/showcase && ztron check --expect SHOWCASE_OK` 两轮 exit 0——`SHOWCASE_OK:34`（34 卡全渲染 + 上报；doctor 7/7，Vite dev 链路真窗口实跑，host/tjs 用 native/libs 构件）。门禁为渲染级冒烟；34 卡按钮交互面仍属手工演示范围

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

### A4. ztron-driver 转发（F7）——Windows 腿已闭环（GAP H21）
- **已验证（Windows + msedgedriver 154）**：透明代理重写后真机双腿——Leg1 普通 Edge 会话（SESSION/NAV/TITLE/URL/DELETE 全 200）；Leg2 驱动打包 hello 应用（`tauri:options.application`=ztron-launcher，TITLE 读回应用真标题）。引擎侧配套修复：vendored win32_edge.hh 在自动化 env（WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS）存在时采纳 WEBVIEW2_USER_DATA_FOLDER 为 UDF（msedgedriver 的 scoped temp 目录，端口文件落 <UDF>\EBWebView\DevToolsActivePort）
- **剩余（Linux）**：WebKitWebDriver 腿同法验证（wire 契约单测已绿；中继逻辑平台无关）
- **验证方法**：`ztron-driver` 起服务后用 WebDriver 客户端建会话（客户端示例见 tests/unit/driver-proxy.test.ts 的 wire 断言与仓库外 wd-e2e 探针）
- **判定**：会话建立并转发命令

## B. 待凭证 / 账号

### B1. Developer ID 签名 + 公证（F5）
- **就绪内容**：`macSignAndNotarize`（codesign entitlements+runtime→ditto→notarytool --wait→stapler）；无凭证时输出完整命令计划
- **所需**：Apple Developer 账号 + "Developer ID Application" 证书 + App 专用密码（`ZTRON_NOTARY_APPLE_ID/TEAM_ID`）
- **验证方法**：设 `ZTRON_SIGN_IDENTITY` 为真身份跑 `ztron build`
- **判定**：`spctl -a -vv` 通过 + Gatekeeper 首启免拦

### ~~B2. 真·minisign 工具互测~~ —— 已完成（DESIGN §124；2026-09-02 复证四向全绿）
- **四向互测全绿**：①真 minisign 签名 → 我们验证 ✓；②我们解析真 -W 密钥+签名 → 真 minisign 验证 ✓；③真 minisign 加密密钥 → 我们 scrypt 解密（pickparams 语义对齐，9.2s）→ 签名 → 真 minisign 验证 ✓；④我们写入的加密密钥 → 真 minisign 解密签名 ✓
- **修复两个真 bug**：-W 密钥 chk 全零（上游只在密码路径算校验和）；opslimit/memlimit 槽的 libsodium pickparams 语义 + 循环退出值 off-by-one

### ~~B3. 全包重发布（GitHub Packages + npmjs）~~ —— 已完成（2026-10-06，v0.3.10→v0.3.12 三连发）
- **发布结果**：双通道（GPR restricted + npmjs public）11 包齐发布。v0.3.10 首发（npmjs 一次全绿；GPR 首跑 unit tests 红后幂等 dispatch 补齐）→ v0.3.11（driver bin stdout flush 修复）→ **v0.3.12（driver bin POSIX 全链可用版，当前 latest）**。smoke 三腿：doctor 7/7 + init/build/dmg 历轮全绿；driver bin 腿（--version/--help）于 v0.3.12 起真绿
- **发布过程揪出的真缺陷（全部已修）**：①capability rewrite 测试按宿主平台断言缺 linux/darwin 分支（ubuntu/macos unit 存量红，H21 引入）；②driver `--version/--help` write 后立即 process.exit 在 POSIX pipe 丢 stdout（Windows 同步写掩护）；③CLI 入口探针 `import.meta.url === pathToFileURL(argv[1])` 在 macOS/Linux npm **symlink** shim 下永假——bin 静默无效（0.3.10/0.3.11 带病），v0.3.12 改 realpath 双侧比较；④windows-latest 镜像切 VS2026 后 WebView2.h 不再在默认 INCLUDE（MSVC 腿改从 webview build 的 FetchContent _deps 自包含解析）+ MSVC 腿漏 apply webview-local.patch（permission API 原型）；⑤publish 四步幂等化（npm view 预检 skip，重跑不再 E409）+ smoke pin 刚发布版本 + 20×20s CDN 传播预算
- **发布流水线现状**：tag `v*` 或 workflow_dispatch 触发；publish-npm 输出发布版本号供 smoke 精确验证"本次发布的版本"；全流程可安全重跑

### ~~B4. Windows 预编译原生链发布（@zturnlibs/ztron-win32-x64）~~ —— 已完成（2026-10-07，v0.3.13）
- **发布结果**：双通道 12 包齐发布（GPR restricted + npmjs public），Windows 预编译链开箱即装——`npm i -g @zturnlibs/ztron-cli` 在 Windows 上自动携带 `@zturnlibs/ztron-win32-x64@0.3.13`（tjs.exe / ztron-host.exe / webview.dll / ffi-8.dll 四件）。smoke 双腿全绿：mac 腿 + **windows 腿**（真实 npm 安装→doctor 7/7→init→build→launcher 启动 12s 存活 + ztron-backend 进程断言）
- **核心断言实锤（run 37601893426 doctor 日志）**：tjs / ztron-host / webview 全部解析自 `…\@zturnlibs\ztron-win32-x64\native\libs\`——"doctor 只靠 bundled chain 全绿"与 mac 腿同款契约达成
- **版本冲突教训（首 dispatch 实录，run 37599339408）**：幂等预检 skip 的是"整包发布"，但 CLI 自身也在变（新增 win32 optionalDependency）——0.3.12 已被昨日发布占用，带挂钩的 CLI 发不出去；smoke 装到旧 CLI（optionalDependencies 仅 darwin）→ Windows 无 bundled chain → doctor 三连✗。**规则：依赖图变了就必须 bump 版本**，幂等预检只保护"内容相同的重跑"，不保护"同名新内容"。配套治本：docs 生成页脚注改从 packages/api/package.json 动态读版本（816a198），版本 bump 不再可能漂移生成页
- **流水线**：native-win32-x64 job（windows-latest 全链构建 + `tjs.exe -v` 哨兵证 ffi-8 可解析 + manifest 校验）+ 双通道幂等发布 + smoke-npm-windows；artifact 上传路径须用 `runner.temp` 上下文（env 上下文看不到 RUNNER_TEMP，run 37598273404 实录）
- **发布后**：README/官网/docs 的 Windows 状态行已随本次提交翻 ✅（预编译链随 CLI）；GAP/台账回填发布记录（B3 式）

## C. 本机环境漂移（已归因存量，健康环境复跑即应绿）

### ~~C1. hello 全链 maximize 卡死~~ —— 已修复（DESIGN §117）
- **真相**：两处自身回归被误判为环境漂移——①G1 窗口事件全局广播 + onCloseRequested 自动销毁兜底，别窗 close-requested 泄漏致 main 被毁；②G3 的 `Buffer.from` 在 tjs 无此全局直接抛错（单测跑在 Node 下有 Buffer，而唯一执行 tjs 的 hello spike 恒红，掩盖了 15 个批次）
- **修复**：窗口事件 emitTo 按 label 定向（上游语义）+ plugins/b64.ts 双运行时安全助手
- **验证**：hello 86 检查 FULL_OK（多轮复证）；**ci.sh 全链 exit 0 多次达成（最近 2026-09-02）**
### ~~C2. multiwin destroy-flood 段 SIGSEGV~~ —— 已修复（DESIGN §116）
- **根因**：vendored webview cocoa 后端的 script-message lambda 经 associated object 持有裸 `this`；窗口销毁（主队列延后的 webview_destroy）free 引擎后，WebKit IPC 管道中仍在途的 didPostMessage 稍后投递 → 虚调用读已释放内存 → SIGSEGV
- **修复**（webview-local.patch 内三重防护）：引擎存活注册表（构造注册/析构入口摘除）+ lambda 投递前 is_alive 校验（死指针→丢弃消息）+ 析构置空 associated 指针（兼防地址复用）
- **验证**：修复后 multiwin 连续 8 轮 5/5 检查全过（含 STRESS_OK）exit 0，.ips 崩溃计数零增长；此前该阶段几乎必崩

### ~~C3. macOS Actions 全链 job~~ —— 已完成（2026-10-07，run 37604719019 macos-spike success）
- dispatch ci 时 macos-spike 一并触发（workflow 级 dispatch 无法单点 job），真跑全绿——"额度恢复后手动触发即应绿"验证成立

### ~~C4. windows-spike（CI Windows 全链）~~ —— 已完成（2026-10-07，run 37608086776 全绿）
- **首跑实录（run 37604719019）**：8 段中 7 段绿（hello/multiwin/menuprobe/popuprobe/winevent/scheme + 打包），唯 **permission probe 红**——windows-latest 是裸 runner，无摄像头/麦克风：Chromium 在 PermissionRequested 事件触发前就因 NotFoundError 失败 getUserMedia（`PERM_DENY_FAIL {"name":"NotFoundError"}` + `PERM_KINDS_FAIL camera=false mic=false`）。真机（2026-10-03 A1）与 macOS runner（有虚拟设备）不受影响——环境假设缺陷，非代码回归
- **修复**：探针自检 `enumerateDevices`（Chromium 自己的可见面），无 videoinput+audioinput → `PERM_NODEVICE_SKIPPED` + FULL_OK 显式跳过；ci.sh 腿改分支断言（有设备主机保持四断言全量，裸 runner 显式 SKIPPED——msi 腿同款惯例）；探针补标准 FULL_OK 哨兵（裸 check 模式需要）
- **复跑实证（run 37608086776）**：windows full chain 全绿，日志明示 `permission probe: host has no capture devices — skipped`——跳过路径真走过，设备主机断言路径本地同日验证（5 检查 + FULL_OK exit 0）
- **flakiness 现状**：绿轮次 1（37608086776）。**翻 push 触发（ci.yml 既定计划）建议再积累 2–3 轮绿**——Windows runner 计费 2×、单轮 ~25 分钟，可在后续发布或风险改动时顺手 dispatch 攒数据

---

## 附：验收快照（2026-09-01 更新，C 类隔离项清零）

- 单测 **110 tests / 109 pass / 1 skip**（Node 下需真 tjs 的 PathScope 用例）
- typecheck 全仓 0 错误；原生 `-Wall -Werror` 干净
- **ci.sh 全链 exit 0（复证通过）**：hello 85/86 FULL_OK + multiwin 5/5 + menuprobe 3~5/5（含 INNER_POS/IMG_READBACK）
- 提交序列：`69d6e8c..27c2a76` 共 16 个（G1–G15 + 台账）
- GAP.md 消号 55 项；余项三类化：待环境（本清单）/ 远期深水（stronghold、同窗 webview、自研容器层）/ 平台边界（已文档化探针）
