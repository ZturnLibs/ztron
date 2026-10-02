# Task 2 审计报告：ztron:// scheme handler 异步性（tauri 127aa176b 对齐）

日期：2026-10-03 · 分支：feat/align-tauri-2.12

## 结论：确认同病，已修复

macOS 的 WKURLSchemeTask 处理（`native/webview` 补丁内的 `cocoa_webkit.hh::scheme_start`）
原实现与 Tauri 修复前的 `asset://` 同病：**主线程同步 `NSData dataWithContentsOfFile:`
整文件读取**。慢盘/大资产（`asset/` 路径经 convertFileSrc 可指向任意大文件）会阻塞主
runloop，冻结所有窗口（ztron 所有 webview 共享主线程）。

Windows 侧（WebView2 `WebResourceRequested`）：同步回调模型，与上游 wry 同构，
主机内读取为内存流，无磁盘阻塞面——**无需修复**（与 tauri 修复面一致）。

## 修复内容（照 wry/tauri 模式）

`cocoa_webkit.hh`（经 `scripts/patches/webview-local.patch` 落地，433→538 行）：

1. 新增 `ztron_scheme_tasks` 命名空间（复用 `ztron_engine_liveness` 的函数局部静态模式）：
   `entry{task, atomic cancelled}` + mutex 保护的 pending 集合。
2. `scheme_start`：主线程只做路径解析/MIME（廉价字符串）；文件读取
   `dispatch_async` 到全局并发队列；读取完成后回主队列投递
   `didReceiveResponse/didReceiveData/didFinish`。
3. `scheme_stop`：置 `cancelled` 原子标记后从集合摘除——**不 release task**；
   投递块独占 `objc::release`，stop/投递竞态只跳过回调不会 double-free。
   （对已停止 task 调 didReceive* 会抛 NSInternalInconsistencyException，这是异步化的
   核心风险点。）
4. `dataWithContentsOfFile:` 返回 +0（autoreleased）——跨池/跨队列前显式 retain，
   投递后 release，生命周期平衡。

## 验证

- `c++ -fsyntax-only -std=c++17` 通过
- 补丁在干净 worktree（pinned WEBVIEW_REF cbbdee4）上 `git apply --check` 通过
- 增量重建 libwebview.dylib + ztron-host 后，hello spike：
  **`ztron check` 真实退出码 0，86 checks passed (FULL_OK)**（前端整页经 ztron:// 加载，
  含 WIN_EFFECTS_OK）
- 无回归：全仓测试 226/225/1skip/0fail（Task 1 基线保持）

## 遗留（记录不做）

- Range/multipart `206 Partial Content`（tauri f9ed1a3fd）：视频拖动进度条场景，
  单列 backlog
- scheme_stop 只取消未投递的读取；已在投递中的回调序列（response→data→finish 之间
  收到 stop）与 wry 存在同样的微窗口，上游同样未处理
