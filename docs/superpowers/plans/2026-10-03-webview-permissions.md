# Webview 权限请求 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对齐 tauri 2.12 `382dd6ccc`——`on_permission_request` + PermissionKind/PermissionResponse 体系，macOS 落地媒体捕获（摄像头/麦克风）权限拦截，Windows/Linux 协议就绪待后端。

**Architecture:** host 侧在 `attach_webview` 时用 `class_addMethod` 给 webview 库的 WKUIDelegate 类动态加 `requestMediaCapturePermissionForOrigin:...` 方法（**不动 webview fork**），decisionHandler 块存 pending 表；host→backend 走既有 `zt_send_line` JSON 行泵（新 `permission_request` 消息），backend→host 走既有 `rt.send`（新 `permission_response` 消息，经 host.c Msg 分发）。core 侧无用户 handler 时自动回 `default`——与"未实现即 Prompt"的 WKUIDelegate 官方语义逐字一致。参考：`/Users/zyj/Zturn/tauri`（只读）`crates/tauri-runtime/src/webview_permissions.rs`（15 种 kind 的 kebab-case 名与平台支持矩阵——**macOS 仅 media capture，连 Tauri 也如此**）。

**Tech Stack:** TypeScript（node:test）、C（objc runtime，host_macos.c 现有 OBJC_MSG/class_addMethod 模式）、Blocks ABI（`Block_copy`/`Block_release` 为 libSystem 导出符号，C 可直接声明调用）。

## Global Constraints

- 分支 `feat/webview-permissions`；基线 239 tests（238 pass/1 skip/0 fail）、FULL_OK 86 checks 不得回退
- macOS 事实（本机 SDK 头核实）：selector `webView:requestMediaCapturePermissionForOrigin:initiatedByFrame:type:decisionHandler:`（macOS 12+）；`WKPermissionDecision`：Prompt=0/Grant=1/Deny=2；`WKMediaCaptureType`：Camera=0/Microphone=1/CameraAndMicrophone=2；未实现该方法 ≡ 调 decisionHandler(Prompt)
- 类型编码：IMP 签名 `v@:@@@q@`（type 为 64 位 NSInteger）
- kind 字符串表与 tauri `Display` 实现逐字一致（"microphone"/"camera"/"clipboard-read"/…/"other"）
- wire：host→backend `{"type":"permission_request","id":N,"kind":"camera","url":"https://host:port","label":"main"}`；backend→host `{"type":"permission_response","req_id":N,"response":"allow|deny|default"}`
- host.c 是跨平台共享：`permission_response` 分发到 `zt_permission_respond(Msg*)`，三平台各实现（win/linux no-op）
- TCC：`native/host/Info.plist` 加 `NSCameraUsageDescription`/`NSMicrophoneUsageDescription`（dev host）；打包 plist 若另有模板同步加
- 公开 API 若进 typedoc 面（core 通常不进），api-zh 严格门禁为准

---

### T1: core 权限模块 + builder/adapter/mock/单测

**Files:** Create `packages/core/src/permissions.ts`；Modify `packages/core/src/app.ts`（AppOptions+App 构造接线+AppBuilder 方法）、`packages/core/src/runtime.ts`（PermissionController）、`packages/core/src/index.ts`（导出）、`packages/core/src/testing/mock.ts`（mock controller）；Test `tests/unit/core-permissions.test.ts`（新建）

**Interfaces:**
- `PermissionKind`：15+1 字符串联合（tauri Display 逐字）
- `PermissionResponse = "allow" | "deny" | "default"`
- `PermissionRequest { kind; url; label; respond(response): void }`
- `AppOptions.onPermissionRequest?: (req) => void | Promise<void>`；`AppBuilder.onPermissionRequest(cb): this`
- `RuntimeAdapter.permissions?: { onPermissionRequest(cb: (wire: {id; kind; url; label}) => void): void; respond(id: number, response: PermissionResponse): void }`
- mock：`permissions` controller + `permissionLog`/`respondLog` 供断言

- [ ] 失败测试（3 条）：注册 handler 收到 wire 请求且 respond 路由 respondLog；未注册 handler 自动回 "default"；AppBuilder 链式存储 handler
- [ ] 实现 + 全量 `pnpm test` 绿（基线 +3）

### T2: ffi wire

**Files:** Modify `packages/runtime-ffi/src/host.ts`（#onLine 加 `case "permission_request"`；`permissions` controller 实现挂到 HostRuntime）

- [ ] WireMessage 类型补 id/kind/url 字段；case 调 cb；respond = `this.#rt.send({type:"permission_response", req_id, response})`
- [ ] typecheck + build

### T3: host C 协议

**Files:** Modify `native/host/host.c`（parser：`response`→aux；dispatch：`permission_response` → `zt_permission_respond(m)`）、`native/host/host_platform.h`（extern 声明）、`native/host/host_windows.c`/`host_linux.c`（no-op 实现）

- [ ] `cc -fsyntax-only` 三平台全过

### T4: host_macos UIDelegate 桥

**Files:** Modify `native/host/host_macos.c`

- [ ] attach_webview_impl 中：取 `WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER`，`[wk UIDelegate]` → `object_getClass` → 幂等 `class_addMethod`（selector 见约束，IMP `perm_capture_cb`，编码 `v@:@@@q@`）；给 wk setAssociatedObject "perm_label"
- [ ] `perm_capture_cb`：type→kind（0/2→camera，1→microphone）；origin `toString`→UTF8；`Block_copy` 存 pending 表（cap 64，满则 decisionHandler(Prompt)+release）；`zt_send_line` 请求行
- [ ] `zt_permission_respond`：查表 → block invoke（`struct {void*isa;int flags;int reserved;void(*invoke)(void*,long);}`）映射 default/allow/deny→0/1/2 → `_Block_release`
- [ ] `extern void *_Block_copy(const void *)` / `extern void _Block_release(void *)` 声明
- [ ] 重编 host → hello spike FULL_OK 保持

### T5: TCC 键 + 文档

- [ ] `native/host/Info.plist` 加相机/麦克风 usage 描述；查 bundler 打包 plist 模板是否独立，是则同步
- [ ] ROADMAP §6 勾选 + 平台支持矩阵注释（macOS=media capture；win/linux=协议就绪）；progress.md 账本
- [ ] 手动冒烟说明写给用户：devtools 里 `getUserMedia` 验证

### 最终门禁

- `pnpm -r build` + `pnpm test`（242/241/1/0）+ typecheck 0 + `cc -Wall -Werror` 重编 host + spike FULL_OK 真实退出码 0
- conventional commits、PR、CI 绿
