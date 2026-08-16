# Ztron — Tauri 的 TypeScript + 微型运行时重写

> 将 Tauri v2(Rust)框架以开源代码为蓝图,重写为 TypeScript + Web 技术栈的跨平台桌面应用框架。
> 参考上游:[tauri-apps/tauri](https://github.com/tauri-apps/tauri)(dev 分支 2.11.x)

## 0. 一句话定位

**Ztron = 系统 WebView + txiki.js 微型 JS 运行时 + 完整翻译自 Tauri 的 IPC/事件/命令/插件体系**。
前端 `@tauri-apps/api` 原样复用,后端运行时 ~2MB,整体体积 5MB 级,追平 Tauri 的"轻量"卖点。

## 1. 设计目标与非目标

### 目标

- 保留 Tauri 的 API 面、IPC 协议、插件体系、ACL 安全理念
- 前端 `@tauri-apps/api` 传输层**零改动**复用
- 后端用微型运行时(txiki.js)而非 Node(~80MB),控制安装包体积
- 跨平台:macOS(WebKit)/Windows(WebView2)/Linux(WebKitGTK)

### 非目标

- 不重写 `webview/webview` 原生层,通过 `tjs:ffi` 直绑其 C API
- 不做 Node/npm 生态兼容(命令 API 面由框架自建受限能力)
- v1 不含 updater/bundler 全量、不含移动端

## 2. 关键技术发现(方案可行性根基)

1. **前端传输接缝单一**:`@tauri-apps/api` 只依赖 `window.__TAURI_INTERNALS__` 的 8 个方法
   (`invoke / transformCallback / unregisterCallback / runCallback / convertFileSrc / postMessage / metadata / isTauri`)。
   只要在 webview 里注入等价对象,前端包 100% 复用。
2. **webview C API 与 IPC 天生匹配**(`webview/webview` 的 `api.h`):
   - `webview_bind(name, fn, arg)` → JS 全局函数 `window.__TAURI_IPC__`,回调收到 `(id, req, arg)`,`req` 为 JSON 数组
   - `webview_return(w, id, status, result)` → 原生 Promise 语义,resolve/reject 前端调用(线程安全)
   - `webview_init(w, js)` → 页面加载前注入脚本(注入 `__TAURI_INTERNALS__`)
   - `webview_eval(w, js)` → 推事件 / Channel 流式回调
3. **txiki.js 可 FFI 且支持回调进 JS**:`tjs:ffi` 提供 `dlopen`、指针/结构体/数组类型、`JSCallback` 类。

## 3. 总体架构

```
┌──────────────────────────────────────────────┐
│ WebView (WebKit / WebView2 / WebKitGTK)       │
│  ┌────────────────────────────────────────┐  │
│  │ 前端框架 (React/Vue/Vanilla)           │  │
│  │  @tauri-apps/api            ← 原样复用  │  │
│  │  window.__TAURI_INTERNALS__ ← webview_init 注入 │
│  │  window.__TAURI_IPC__       ← webview_bind     │
│  └────────────────────────────────────────┘  │
└───────────────────┬──────────────────────────┘
      bind: JS→原生     │      return/eval: 原生→JS
┌──────────────────────▼───────────────────────┐
│ 主进程 = txiki.js 单文件 (~2MB)               │
│  @ztron/core          命令/事件/插件/state     │
│  @ztron/runtime-ffi   tjs:ffi → webview 动态库  │
│  (libwebkit/WebView2/WebKitGTK 系统已有)       │
└──────────────────────────────────────────────┘
```

## 4. Monorepo 结构(pnpm workspace)

```
ztron/
├── DESIGN.md
├── packages/
│   ├── api/              # 前端传输层(翻译自 @tauri-apps/api/core)
│   ├── core/             # 主进程核心(IPC/命令/事件/插件/state)
│   ├── runtime-ffi/      # tjs:ffi 绑 webview C API(替换 tauri-runtime-wry)
│   ├── inject/           # __TAURI_INTERNALS__ 注入脚本(替换 tauri-codegen)
│   └── cli/              # dev/build 编排
└── examples/
    └── hello/            # 最小示例
```

## 5. 核心模块设计

### 5.1 `runtime-ffi`(替换 `tauri-runtime-wry`)

`tjs:ffi` 的 `dlopen` 加载 webview 动态库,按 `api.h` 声明签名:

| webview C API                                        | Ztron 用途                 |
| ---------------------------------------------------- | -------------------------- |
| `webview_create(debug, window)`                      | 创建窗口+WebView           |
| `webview_bind('__TAURI_IPC__', cb, arg)`             | 前端→主进程 IPC 入口       |
| `webview_return(w, id, status, result)`              | invoke 响应(成功/失败)     |
| `webview_eval(w, js)`                                | 推事件 / Channel 流式回调  |
| `webview_init(w, js)`                                | 注入 `__TAURI_INTERNALS__` |
| `webview_set_title / set_size / navigate / set_html` | 窗口控制                   |
| `webview_run / terminate / dispatch`                 | 主循环与跨线程调度         |
| `webview_get_native_handle(w, kind)`                 | 原生句柄(托盘/菜单扩展用)  |

对外暴露统一 `RuntimeAdapter` 接口,便于未来替换 Electron/Neutralino 后端。

### 5.2 `core`(替换 `tauri` crate)

- **IPC 协议**(翻译自 `crates/tauri/src/ipc/mod.rs`):
  ```ts
  interface InvokeMessage {
    cmd: string;
    callback: number;
    error: number;
    payload: unknown;
    options?: { headers?: HeadersInit };
    __TAURI_INVOKE_KEY__?: string; // 防注入密钥
  }
  ```
  响应:`webview_return` 或 `eval('runCallback(id, data)')`;`format_callback.rs` 的 JSON 转义优化照搬。
- **Channel 流式**:前端序列化为 `__CHANNEL__:${id}`,后端按序发 `{message, index}`、结束发 `{end:true, index}`。
- **命令系统**(替代宏):`app.commands.register('greet', async (args, ctx) => ...)`;构建期 codegen 扫描命令目录生成注册表与前端类型。
- **事件系统**:翻译自 `event/mod.rs`。
- **受限能力层**:命令默认无 Node 全局,能力面由框架自建(fs/path/sqlite/http),最小权限 = Tauri 安全理念。
- **插件基座**:`registerPlugin(name, { commands })`;内置命令命名兼容(`plugin:window` 等)。

### 5.3 `inject`(替换 `tauri-codegen` 注入脚本)

```js
window.__TAURI_INTERNALS__ = {
  invoke,
  transformCallback,
  unregisterCallback,
  runCallback,
  convertFileSrc,
  metadata,
  postMessage,
};
window.__TAURI_IPC__; // 由 runtime-ffi 的 webview_bind 提供
```

### 5.4 `cli`(dev 流程)

1. 启动 Vite dev server(随机端口)
2. 把 `__TAURI_INTERNALS__` 引导脚本嵌入 HTML 入口(webview_init 是 post 处理器,不能注入任意代码,M0 发现)
3. `tjs main.js` → `createWindow → navigate(http://localhost:PORT)` → HMR 生效

## 6. 命令 API 面(替代 Node 模块)

| 能力           | 来源                              |
| -------------- | --------------------------------- |
| 文件读写/遍历  | txiki 文件系统 API(带 scope 校验) |
| 路径           | `tjs:path`(POSIX + Windows)       |
| SQLite         | `tjs:sqlite`                      |
| HTTP/WebSocket | txiki 内置 fetch/WebSocket        |
| 原生扩展       | 插件 `tjs:ffi` 直绑任意 C 库      |

## 7. 里程碑

| 阶段   | 内容                                         | 验收                                |
| ------ | -------------------------------------------- | ----------------------------------- |
| **M0** | ⚡Spike:FFI 跑通 `hello` + Plan A 宿主双进程 | 同步+异步往返,exit=0                |
| **M1** | events + Channel 流式 + 窗口命令集 ✅        | `M1_EVENTS_CHANNEL_WINDOW_OK`       |
| **M2** | 插件基座 + 受限能力层 + CLI dev ✅           | `M2_FS_SCOPE_PATH_OK`(scope 允/拒)  |
| **M3** | `@ztron/api` 与打包器前端集成(Vite)✅        | `M3_API_FRONTEND_OK`                |
| **M4** | `tjs compile` 打包 + macOS .app 验证 ✅      | 打包产物端到端 `M3_API_FRONTEND_OK` |

## 8. 风险与限制

1. **⚠️ 事件循环共存(M0 验证项)**:`webview_run()` 阻塞主线程,webview GUI 循环与 tjs/libuv 循环需共存;bind 回调在 GUI 线程需安全进入 QuickJS。失败则回落 Node 裁剪档。**已解决:采用 Plan A(原生宿主 shim),见 §11。**
2. **单窗口**:webview 一个实例一个窗口,多窗口需多进程(v1 后处理)。
3. **受限 API 面**:非 Node 兼容,npm 生态不可用,命令能力由框架自建。
4. **安全模型**:无 custom protocol(tauri://),资产走 navigate 本地 HTTP / set_html;注入脚本无 sandbox。
5. **跨平台差异**:WebKit/WebView2/WebKitGTK 行为差异需三端真机验证。
6. **类型真源反转**:命令类型从 Rust 真源改为 TS 自维护,靠 codegen 防漂移。

## 9. 翻译对照表(Rust → TS)

| Rust 模块               | Ztron TS 等价物                                |
| ----------------------- | ---------------------------------------------- |
| `tauri-runtime-wry`     | `runtime-ffi`(tjs:ffi 绑 webview C API)        |
| `tauri` core            | `core`(命令/事件/state/插件)                   |
| `tauri-codegen` 注入    | `inject`(嵌入页面 HTML)                        |
| `ipc/mod.rs` 协议       | `core/ipc`(JSON + callback/error id + Channel) |
| `tauri-plugin`          | TS 插件(注册命令 + 权限)                       |
| `tauri-bundler`         | `tjs compile` + 平台打包脚本                   |
| `tauri-utils`(配置/CSP) | zod schema + 注入 CSP                          |
| `@tauri-apps/api`       | `api`(传输层适配,协议不变)                     |

## 10. M0 结论(已验证,macOS arm64)

### 已验证通过 ✅

- **FFI 绑定完整可用**:`tjs:ffi` 的 `dlopen` 正确加载 `libwebview.dylib` 并绑定 webview C API。
- **窗口 + 页面 + 双向 IPC 全链路跑通**(`examples/hello` 输出 `SPIKE_RESULT: SYNC_ROUNDTRIP_OK`,exit=0):前端 `invoke` → `window.__TAURI_IPC__`(bind)→ 后端 `IpcHub` 分发 → 命令执行 → `webview_return` 原生 Promise 语义回传 → 前端 `await` 拿到结果 → 再次 invoke 回传 → 自动关窗。
- **页面侧 JS 完全独立运行**:WKWebView 的 DOMContentLoaded、timers、microtask 均正常。

### 关键实现发现(已写入代码)

1. **`webview_init` 不是"页面加载时注入任意代码"**,而是**设置 post 传输处理器**——传入 JS 会被包成 `return (你的代码)(message)`。用它注入引导脚本会破坏 bind→原生链路。→ `__TAURI_INTERNALS__` 引导代码改为**直接嵌入页面 HTML**(core 在 `loadHtml` 前 prepend `<script>`;M3 起由 CLI 注入 HTML 入口)。
2. **JSCallback 必须声明 `returns: types.sint32` 并 `return 0`**(`void` 返回在 fast_call 报 `cannot convert js val to void`)。
3. **bind 回调的 `req` 是 JSON 数组字符串**(如 `["{...}"]`),解析用 `JSON.parse(req)[0]`,不是 `req[0]`。
4. **页面调 `window.__TAURI_IPC__` 应传对象**(webview 自动序列化为 params 数组),不要预先把消息 `JSON.stringify` 成字符串,否则后端解析出的是字符串。
5. **JSCallback 必须持有强引用**(存到 handle 字段),否则 QuickJS GC 释放 libffi 闭包 → `SIGSEGV`。
6. **bind 必须先于页面加载**(core 在 `loadHtml` 前先 `webview_bind`)。

### ⚠️ 异步命令阻塞(M1/M2 关键前置)

**`webview_run` 阻塞 tjs 主线程期间,libuv 事件循环与 QuickJS 微任务队列不泵动。** 实测:bind 回调内 `Promise.resolve().then(...)` 与 `setTimeout` 均不执行;`async` 命令(Promise 返回)的 `await result` 续体永远不跑 → 响应永不回传。手动调 `uv_run` 泵 loop 会 `SIGSEGV`(重入不安全)。

**推论**:v1 命令必须**同步执行并在回调内同步 respond**(已验证可行)。页面侧定时器驱动的异步仍在评估。

**解决路径(供 M1 前决策)**:

- **A. 原生宿主 shim(Neutralino 模式)**:写 ~百行 C 宿主,把 webview GUI loop 与 tjs 事件循环用 CFRunLoopSource/kevent 集成,tjs 作为嵌入或子进程,tjs 全异步可用。
- **B. 补丁 txiki**:给 tjs 增加 run-loop 集成模块(我们自行构建 tjs,可打补丁)。
- **C. v1 妥协**:仅同步命令 + 阻塞式 IO(FFI 调 C 同步函数),异步能力后续再补。

## 11. Plan A 决策与落地(原生宿主 shim,已验证)

### 为什么选 A

B(tjs 补丁交替泵动)虽有单进程优势,但依赖 QuickJS 微任务在交替循环下泵动(需额外验证),且要长期维护 tjs fork;A 让 tjs 作为**独立进程跑自己的事件循环**,异步天然可用,无需打补丁。C 仅作过渡。

### 双进程架构(已验证,macOS arm64,`SPIKE_RESULT: ASYNC_ROUNDTRIP_OK`)

```
┌────────────────────────┐        TCP/JSON       ┌──────────────────────────┐
│ ztron-host (C 宿主)     │◄──────────────────────►│ tjs 后端进程             │
│ 主线程: webview_run     │   newline-JSON 帧      │ 事件循环完全正常         │
│  socket 线程: 收后端消息 │                        │  async 命令 ✓ (timers/IO)│
│  webview_dispatch 回 GUI│                        │  HostRuntime(socket 适配)│
└────────────────────────┘                        └──────────────────────────┘
  前端 invoke → bind → 宿主 → socket → 后端 → 响应 → 宿主 webview_return → 前端
```

### 实现清单

| 组件                  | 位置                               | 说明                                                                                                                                     |
| --------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `ztron-host` 原生宿主 | `native/host/host.c`               | webview + socket 线程 + `webview_dispatch` 回 GUI;消息类型:request/response/eval/create_window/set_html/navigate/set_title/set_size/quit |
| socket 适配层         | `packages/runtime-ffi/src/host.ts` | `HostRuntime`/`HostWebviewHandle`,实现与 FFI 相同的 `RuntimeAdapter` 契约;`run()` 返回 closed promise                                    |
| CLI 双进程编排        | `packages/cli/src/index.ts`        | 起 host → 读 `PORT=` → spawn tjs + `ZTRON_HOST_PORT`                                                                                     |
| 构建脚本              | `scripts/build-native.sh`          | + 编译 ztron-host(rpath 指向同目录 dylib)                                                                                                |
| 示例                  | `examples/hello/src/main.ts`       | `HostRuntime` + 真·异步命令(`setTimeout`)                                                                                                |

### 新踩的坑(已修)

1. **宿主 JSON 解析必须解码 `\n` 等转义**:否则 html 里换行变字面 `\n`,引导脚本语法错误。`json_str` 已完整处理 `\\n\\r\\t\"\\\\`。
2. **`tjs.connect` 的流在 `await socket.opened` 结果上**,不在 socket 本体(服务端 accept 的才有直接属性)。
3. **后端不要把解析后的数组 `String()` 化**:`String([object])` → `[object Object]`。`hub.handle` 兼容数组/字符串两种形态;宿主适配层 `JSON.stringify` 回字符串保持契约一致。

### M0→M1 结论

- ✅ 同步命令全链路(M0 FFI 验证)
- ✅ **异步命令全链路(Plan A 验证)**:`invoke` → host → socket → 后端 `setTimeout(30ms)` → 响应 → `webview_return` → 前端 `await` 拿到结果
- ✅ 事件(emit/eval)与 Channel 流式的传输路径已具备(set_html/eval/response 三种消息均可走通)

## 12. M2 结论(插件基座 + 受限能力层,已验证)

### 验证通过 ✅(`SPIKE_RESULT: M2_FS_SCOPE_PATH_OK`,exit=0)

- **插件基座**:`app.plugin(fsPlugin(...))` → 命令自动注册为 `plugin:fs|*`、`plugin:path|*`
- **受限能力层 `PathScope`**:路径 `$VAR` 展开(HOME/TMP/CWD)+ 绝对化 + canonicalize(解析父目录真实路径,防符号链接逃逸)+ allow/deny 前缀匹配
- fs 插件:read_text / write_text / read_dir / exists / remove / make_dir,全部经 scope 闸门
- path 插件:join/resolve/normalize/is_absolute/basename/dirname/extname(纯字符串,无 scope)
- 越权写 `/etc/passwd` 被正确拒绝(scope 外抛 access denied)
- CLI:`ztron init <dir>` 脚手架(package.json + ztron.conf.json + src/main.ts)、`ztron.conf.json.entry` 决定入口
- 前端 `@ztron/api`:fs.ts / path.ts 类型化包装

### 踩坑(已修)

1. **scope 根未 canonicalize**:allow 前缀(`/var/...`)与检查路径 canonicalize 后(`/private/var/...`)不匹配 → 一律拒绝。修复:roots 懒加载 canonicalize(带 `.catch` 回退)。
2. **tjs fs 全异步**:`readFile/writeFile/stat/readDir` 返回 Promise,`readFile` 忽略 encoding 选项返回 Uint8Array → 用 `TextDecoder` 解码。
3. **`tjs:path` 默认导出**才有 posix/win32;`declare module "tjs:path"` 需在全局脚本文件(无 import/export)中声明。

## 13. M3 结论(@ztron/api 真实 Vite 前端,已验证)

### 验证通过 ✅(`SPIKE_RESULT: M3_API_FRONTEND_OK`,exit=0)

- **真实 Vite 前端** `examples/hello/frontend/` 用 `import { invoke, listen, Channel, fs, path, Window } from "@ztron/api"` 驱动后端
- invoke / 事件(后端异步 emit)/ Channel 流式(1,2,3)/ scoped fs / path 全部经 api 包工作
- CLI 编排:`vite build`(base './',IIFE)→ 改写经典脚本 → `file://` 加载 → host + tjs 后端

### 关键平台发现(macOS)

1. **WKWebView 拦截 `http://`(ATS)**,且 host 二进制 `__info_plist` ATS 豁免**不生效**(WebKit 网络进程读自己的 plist)。→ dev 前端改用 **`file://` 加载**(不受 ATS 限制,WebKit 允许 file:// ES/经典脚本)。
2. **`file://` + `<script type="module" crossorigin>` 有 CORS 问题**(文件 URL origin 为 null)。→ vite 产物为 **IIFE + 经典脚本**(CLI 构建后改写标签)。
3. **bootstrap 必须 `head-prepend`**(第一个脚本),否则 app 脚本先跑时 `__TAURI_INTERNALS__` 未定义。
4. `@ztron/api` 的 `Channel.onmessage` 收到的是**解码后的消息**(end 由 Channel 内部处理),不是 `{message,index}` 原始帧。

### 取舍

- 目前 dev 用 `vite build`(无 HMR);真正的 dev server + HMR 需要自定义 scheme 宿主(Tauri 的 `tauri://` 方案),列入后续。
- invokeKey 由 CLI 生成,`buildInitScript` 注入 + 后端 env 同源,前端每次 dev 会话一致。

## 14. M4 结论(`tjs compile` 打包 + macOS .app,已验证)

### 验证通过 ✅(打包产物端到端 `SPIKE_RESULT: M3_API_FRONTEND_OK`)

`ztron build` 产出 `ZtronApp.app`,运行后 5 项全通过并干净退出:

- 后端:esbuild 打包 → `tjs compile` 单文件二进制
- 前端:vite build + bootstrap/invokeKey 烧入
- 组装:.app(launcher + ztron-host + ztron-backend + libwebview.dylib + frontend)
- launcher 脚本:起 host → 读 PORT → 传 invokeKey/DEV_URL 起后端

### 产物结构(macOS)

```
ZtronApp.app/Contents/
  Info.plist
  MacOS/{ ztron(launcher), ztron-host, ztron-backend, libwebview.dylib }
  Resources/frontend/{ index.html, assets/ }
```

### 关键点

1. `tjs compile` 直接产出可独立运行的 Mach-O(内嵌脚本+运行时),`tjs:*` 内建模块保持 external。
2. **invokeKey 一致性**:CLI `build` 生成一次 key,vite 插件烧入前端 HTML + launcher 传给后端(env),前后端同源。
3. `findHostBin/findWebviewLib` 从 appRoot **向上回溯**找 `native/libs`(hello 的 native 在仓库根)。
4. 打包链路与 dev 共用 `buildFrontend`(返回真实路径,URL 由调用侧拼 `file://`)。
5. 三平台:macOS 已验证;Windows/Linux 需对应 webview 后端 + 打包脚本(待做)。

## 15. P0.1 结论(窗口状态 + 窗口事件,已验证)

### 验证通过 ✅(`WIN_STATE_OK` + `WIN_EVENT_OK`)

- **窗口状态**:minimize/unminimize/toggle_maximize/is_maximized/is_minimized/set_fullscreen/is_fullscreen/set_always_on_top/center/set_focus/set_visible/set_resizable
- **窗口事件**:resize/move/focus/blur/close → `tauri://resize/move/focus/blur/close-requested` 推送
- 全链路:host.c(ObjC runtime 直调 NSWindow)→ socket → backend → EventManager → 前端 `listen('tauri://focus')`

### 实现要点

1. host.c 用 `webview_get_native_handle(w, UI_WINDOW)` 拿 NSWindow,经 **ObjC runtime**(objc_msgSend)调 AppKit:`miniaturize:`/`zoom:`/`setStyleMask:`(fullscreen/resizable)/`setLevel:`(alwaysOnTop)/`center`/`makeKeyAndOrderFront:`/`setIsVisible:`。
2. 查询操作(is_*)走 **request/response**:host 用 `req_id` 回 `query_result`;HostRuntime 维护 pending promise map。
3. 窗口事件用 **NSWindow delegate**:动态建类 + `class_addMethod`(windowDidResize:/Move:/BecomeKey:/ResignKey:/WillClose:/ShouldClose:),事件经 socket 推给后端。
4. host 编译需 `-framework Foundation -framework AppKit`。
5. `@ztron/api` Window 类补齐状态方法与 onResized/onMoved/onFocused/onBlurred/onCloseRequested。

## 16. P0.2 结论(系统托盘,已验证)

### 验证通过 ✅(`TRAY_OK`)

- tray 创建(title/tooltip)/set_title/set_tooltip/destroy,点击 → `tauri://tray-click` 推送(点击需手动)
- 全链路:前端 `createTray()` → `plugin:tray|*` → backend → host(NSStatusItem)→ 菜单栏
- 点击路径与窗口事件同构(host → socket → backend → EventManager)

### 实现要点

1. host.c:`NSStatusBar systemStatusBar` + `statusItemWithLength:`(变长)→ `setTitle:`/`setToolTip:`;按钮 target/action 用动态类 `ZtronTrayTarget` 的 `trayClick:`。
2. `RuntimeAdapter.tray`(可选)TrayController;`App` 接线点击 → `tauri://tray-click`;`plugin:tray|create/set_title/set_tooltip/destroy` 命令。
3. `@ztron/api` tray.ts:createTray/setTrayTitle/setTrayTooltip/destroyTray/onTrayClick。
4. 图标支持(NSImage)后续加;Windows Shell_NotifyIcon 待平台移植。

## 17. P0.3 结论(应用菜单,已验证)

### 验证通过 ✅(`MENU_OK`)

- 菜单创建(menu_create + 逐项 menu_add_item)/设为应用主菜单(setMainMenu)/destroy/item enabled/title
- 点击 → `menu_event` → `tauri://menu` 推送(点击需手动)
- 全链路:前端 `setAppMenu([...])` → `plugin:menu|*` → backend → host(NSMenu)→ 菜单栏

### 实现要点

1. host.c:`NSMenu alloc/initWithTitle:` + `setAutoenablesItems:NO`;`NSMenuItem initWithTitle:action:keyEquivalent:` + tag;动态类 `ZtronMenuTarget.menuItemClicked:`;tag→refs 表回查 item_id 发 `menu_event`。
2. 协议避免数组解析:create + N×add_item(flat JSON),backend 迭代 items。
3. `RuntimeAdapter.menu`(可选 MenuController);`App` 接线 → `tauri://menu`(payload {menuId,itemId})。
4. `@ztron/api` menu.ts:Menu/setAppMenu/onMenuEvent;item enabled/title 更新。
5. 子菜单(Submenu)/快捷键/CheckMenuItem 为后续扩展;菜单栏点击事件需手动验证。

## 18. P0.4 结论(原生对话框,已验证注册链路)

### 验证通过 ✅(`DIALOG_REG_OK`;模态交互需手动)

- `plugin:dialog|open/save/message` 注册确认;模态显示 + `req_id` 回传路径实现
- 全链路:前端 `dialog.open()` → `plugin:dialog|open` → backend → host(NSOpenPanel)→ 选中路径回传

### 实现要点

1. host.c:`NSOpenPanel openPanel`/`NSSavePanel savePanel`/`NSAlert`,`runModal` 模态(嵌套 run loop);结果 `reply_string`(JSON 转义路径)或 `reply_null`。
2. `sendRequest` 泛化:query_result 结果任意 JSON(布尔/字符串/null);windowState 用 `r===true`,dialog 用字符串|null。
3. `RuntimeAdapter.dialog`(可选 DialogController);`plugin:dialog|*` 异步命令。
4. `@ztron/api` dialog.ts:open/save/message。
5. **限制**:模态对话框无法自动化 spike;文件过滤器/多选/目录模式为后续扩展;Windows 用 CommonDialog 待平台移植。

## 19. P1.1 结论(ACL 权限模型,已验证)

### 验证通过 ✅(`ACL_DENY_OK`)

- capability `["core:default", "path:default", "fs:write-default"]` 授予 main 窗口
- `fs.remove` 未授权 → backend 拒绝 `access denied`(其他命令放行)
- 全链路:capability JSON → `PermissionRegistry.expand` → `ResolvedAcl.allow/deny` → `IpcHub.handle` 门禁

### 实现要点

1. **三层数据模型**:Permission(commands+scope)、PermissionSet(命名分组,如 `default`)、Capability(windows+permissions)。Set 成员相对解析(`fs:default` 内的 `allow-x` → `fs:allow-x`)。
2. **Per-label 表**:`ResolvedAcl.#byLabel: Map<label, {allowedCommands, deniedCommands}>`;无 capability → permissive(向后兼容)。
3. **门禁范围**:`IpcHub.handle` 只对 `plugin:*` 命令做 ACL 检查(用户自定义命令 `m3:echo` 等免授权,简化 v1)。
4. **插件权限声明**:fsPlugin/pathPlugin 在 Plugin.permissions/permissionSets 中声明(与 Tauri 的 permission manifest 对应);App 启动时构建 `core:default` 集合(所有内置命令)。
5. **Tauri 兼容**:capability 文件格式与 Tauri 一致(`permissions: ["id", {identifier, scope}]`);`!cmd` 前缀表 deny;scope 透传给 PathScope。
6. **限制**(后续):per-command scope 未真正生效(目前 scope 仅记录);remote URL 匹配、glob 窗口、schema 校验未做。

## 20. P1.3 结论(HTTP scope,已验证)

### 验证通过 ✅(`HTTP_OK:200` + `HTTP_SCOPE_DENY_OK`)

- `http.fetch("https://httpbin.org/get")` → 200(允许域)
- `http.fetch("https://evil.example.com/steal")` → scope denied(拒绝域)
- 全链路:前端 `http.fetch()` → `plugin:http|fetch` → backend → HttpScope 校验 → tjs fetch

### 实现要点

1. **`HttpScope`** 编译时解析 URL 模式为 `CompiledPattern`(protocol/hostLabels/port/pathPrefix/pathGlobstar),`*` 通配子域,`**` 通配路径深度;host 从右向左匹配。
2. **`httpPlugin`** 包装标准 WHATWG `fetch`(tjs 原生支持),scope 不通过抛 `http scope denied`;ACL 权限:`http:allow-fetch`/`http:deny-fetch`/`http:default`。
3. **两层防护**:HttpScope(URL 粒度,插件配置)+ ACL(命令粒度,capability 授予)。
4. **`@ztron/api`** http.ts:`fetch(url, options)` → `HttpResponse {status, ok, headers, body}`。

## 21. P3 结论(插件生态:os/store/log/shell,已验证)

### 验证通过 ✅(`FULL_OK`,17 项全通过)

- **os**:platform/arch/hostname/version/homedir/tmpdir/sep(navigator + tjs)
- **store**:KV JSON 文件(get/set/delete/keys/values/entries/clear),内存缓存 + 持久化
- **log**:trace/debug/info/warn/error(级别过滤)
- **shell**:scoped 命令执行(program+args glob 匹配,tjs.spawn pipe stdout/stderr)

### 实现要点

1. 插件统一模式:Plugin{name, commands, permissions, permissionSets} → 自动注册 ACL
2. shell scope 匹配:program basename 匹配 + args glob(`*`/`**`)
3. store baseDir 默认 $TMP(不经 PathScope,直接 tjs 文件操作)
4. 每插件都有 `default` + `write`/`full` 权限集
5. 前端 api 包:`os.ts`/`store.ts`/`log.ts`/`shell.ts`(与 Tauri @tauri-apps/api 对齐)

## 22. P4 结论(命令 codegen + 测试,已验证)

### 验证通过 ✅(`FULL_OK` + `CODEGEN_OK`,mock 测试 3/3)

- **`defineCommand`**:类型化命令定义(name/args/result phantom + handler),`app.commandDef()` 同时注册进 registry + hub
- **`ztron codegen`**:TS AST 扫描 `defineCommand` 调用 → 提取 name/args/result 类型 → 生成 `ztron-commands.ts`(类型化 `invoke` + `KnownCommands` 映射)
- **`MockRuntime`/`MockWebviewHandle`**:无真实窗口的测试运行时,`mock.main.invoke()` 模拟前端调用
- **测试**:`node --experimental-strip-types --test tests/core.test.ts`(defineCommand 往返 / window 状态路由 / ACL 拒绝)

### 关键修复

1. `app.commands.registerDef()` 只进 registry 不进 hub → 新增 `app.commandDef()` 两者都注册
2. 生成器提取 `{} as T` 的右侧类型(as-expression),而非原样嵌入
3. 生成模块用单一泛型签名(overloads 与实现冲突),`invoke<C extends keyof KnownCommands>`
4. mock.invoke 在 status!=0 时 reject → 测试用 `assert.rejects`
5. `tjs:path` 懒加载 → core 可在 Node 下 import(mock 测试需要)
6. PathScope 测试在 Node 下跳过(需 tjs 全局)

### 剩余(WebDriver 集成测试)

- 端到端 WebDriver 测试(host + 真实 webview)尚未做,列 P5/后续

## 23. P5 结论(updater + 签名 + 跨平台骨架,已验证)

### 验证通过 ✅(`UPDATER_OK`,18 项 FULL_OK)

- **updater 插件**:check(版本比较)/download(fetch+写文件)/verify(sha256)
  - tjs 能力确认:`crypto.subtle.digest("SHA-256")` + `fetch().arrayBuffer()` 均可用
  - spike:本地 `tjs.serve` manifest server(version 1.2.0 vs current 0.1.0)→ hasUpdate;sha256 校验 "update-me" 匹配
- **macOS ad-hoc 签名**:CLI build 后 `codesign --force --deep --sign -`;`ZTRON_SIGN_IDENTITY` 可换正式身份
- **Win/Linux host 骨架**:`host_win.c`(WebView2 + Win32)/`host_linux.c`(WebKitGTK)——协议与 host.c 一致,runtime-ffi 无需改动;待目标平台编译验证

### 关键发现

1. `tjs.serve({port, listenIp, fetch})` 返回 `{ port, close }`(`.port` 属性,非 opened)
2. updater manifest 格式与 Tauri 对齐:`{ version, platforms: { darwin: { url, sha256 } } }`
3. 跨平台解耦已验证:runtime-ffi 的 HostRuntime 只依赖 socket 协议,后端平台只需换 host 二进制

### 剩余(需目标平台)

- Windows:WebView2 SDK 编译、NSIS/MSI 打包
- Linux:WebKitGTK 编译、AppImage/deb 打包
- 正式签名/公证(Developer ID / notarize)、移动端

## 24. 跨平台重构结论(host 分层,已验证)

### 重构:host.c 跨平台 core + 平台实现

- **host.c**:纯跨平台(socket 协议 + 消息分发 + main loop),不依赖 **APPLE**
- **host_platform.h**:平台接口 `zt_platform = { dispatch, init }` + 共享 Msg/zt_send_line/zt_json_* + 各平台实现的 zt_reply_*
- **host_macos.c**:窗口状态/事件(NSWindow delegate)、tray(NSStatusItem)、menu(NSMenu)、dialog(NSOpenPanel 等)——ObjC runtime
- **host_windows.c**:窗口状态(Win32 ShowWindow/SetWindowPos)、tray(Shell_NotifyIcon)、menu(HMENU)、dialog(GetOpenFileName)——通过 webview native handle 拿 HWND
- **host_linux.c**:窗口状态(GTK gtk_window_*)、tray(GtkStatusIcon)、menu(GtkMenu)、dialog(GtkFileChooserNative)——通过 native handle 拿 GtkWindow

### 验证 ✅(macOS)

- host.c + host_macos.c 编译(-Wall -Werror 干净),spike `FULL_OK`(18 项)无回归
- 关键 bug:重构时 socket_thread 统一字段解析漏了 response 的 `id` → `webview_return(w,"",…)` 前端 promise 永不 resolve → 已修(补 `zt_json_str(line,"id",…)`)
- Windows/Linux 需在目标平台编译验证(build-native.sh 已按平台选文件 + CLI 打包分支)

### 跨平台打包

- build-native.sh:Darwin/Linux(*)/Windows 各自编译 host + 平台文件
- CLI build:darwin→.app;linux/win→目录(host+lib+frontend)

## 25. 补充:sql + autostart 插件(已验证)

### sql 插件 ✅(`SQL_OK:hello-sql`)

- `plugin:sql|load/execute/select/close`,连接池(id → Database),路径经 PathScope
- tjs:sqlite 确认:`prepare(sql).run([params])` / `.all([params])`(位置 `?` 占位,数组传参;无 reset,每次新 prepare)
- 前端 `Database.load/execute/select/close`

### autostart 插件 ✅(`AUTOSTART_OK`)

- `plugin:autostart|enable/disable/is_enabled`
- macOS:写 `~/Library/LaunchAgents/<id>.plist`(ProgramArguments = exec)
- Linux:写 `~/.config/autostart/<id>.desktop`
- Windows:`reg.exe add HKCU\...\Run`(tjs.spawn)
- exec 默认 `tjs.exePath`,可配置

### spike:20 项 FULL_OK

- 新增 SQL_OK + AUTOSTART_OK(启用→检查→禁用,幂等)

## 26. P2 深入结论(http ESM 不可靠 → 需自定义 scheme)

### 验证过程与结论

- **可靠路径**:dev 用 watcher(vite build IIFE + file://),spike 稳定 `FULL_OK`(20 项)。手动 file:// navigate 也稳定执行页面。
- **尝试**:ATS-exempt .app bundle + vite dev server(http://localhost)+ CORS 头 + dev 保 `type="module"`。
  - CORS 头确认出现(index/main.ts 均 `Access-Control-Allow-Origin: *`)
  - 经典脚本探针在手动 http 场景**能执行**(证明 http 页面加载 + bind 正常)
  - **ESM module(main.ts)始终不执行**(多次验证;禁用 vite HMR websocket 也无效)
- **根因判断**:WKWebView 对 `http://` + `type="module"` 的 ESM 加载在当前 webview/webview 配置下不可靠(经典 script 正常)。完整 HMR(ESM + HMR websocket)需要 **WKURLSchemeHandler 自定义 scheme**(`ztron://`),即 ROADMAP P2.1 标注的深度 C 工作(需 patch webview 库或 host 自建 WKWebView 层)。

### 基础设施(已保留)

- `spawnHostInBundle`:临时 ATS-exempt .app bundle(可加载 http://localhost)
- `startFrontendDevServer`:vite dev server + CORS + dev 保 ESM(待自定义 scheme 时启用)
- dev 当前用 `startFrontendWatcher`(IIFE + file://,可靠)

## 27. P2 落地:自动刷新 dev(near-HMR,已验证)

### 机制

- CLI dev:watcher(排除 dist/.ztron 避免循环)检测前端源码变化 → 重建 IIFE → touch `.ztron/reload` 信号文件
- backend:每 400ms 轮询 reload 文件,检测到变化 → `webview.eval('location.reload()')`
- **关键修复**:dev 后端改用**异步 `spawn`**(非 `spawnSync`)——spawnSync 阻塞主线程导致 watcher 的 setTimeout 永远不执行

### 验证 ✅

- 修改 `src/main.ts` → `frontend changed → rebuilt → page reloaded`
- 修改 `index.html` → 同样触发;无重建循环

### 与完整 HMR 的关系

- 当前:整页 reload(自动,可靠)
- 完整模块级 HMR:需 `ztron://` scheme(WKURLSchemeHandler),深度 C 工作(DESIGN.md §26)

## 28. P2 终评:ztron:// 自定义 scheme 技术蓝图(评估完成,暂缓实现)

### 为什么需要

- WKWebView 对 `http://` 的 ESM module 加载不可靠(§26),完整模块级 HMR 需要自定义 scheme
- 生产资产走 `ztron://` 可获隔离(优于 file://)

### patch 位置(webview/webview,header-only)

- `core/include/webview/api.h`:加 `webview_register_scheme(webview_t, const char *scheme, handler, arg)`
- `core/include/webview/detail/backends/cocoa_webkit.hh` **`window_settings()`(约 450 行)**:`WKWebViewConfiguration_new()` 之后、`m_webview` 创建(485 行)之前,调 `WKWebViewConfiguration_setURLSchemeHandler_forURLScheme(config, handler, scheme)`
- 需用 ObjC 运行时动态类实现 WKURLSchemeHandler 协议:`webView:startURLSchemeTask:`(解析 URL path → 生成响应 → task didReceiveResponse/didReceiveData/didFinish)、`webView:stopURLSchemeTask:`

### 评估

- **工作量**:100-200 行 ObjC 运行时动态协议代码(arm64 msgSend、task 生命周期、NSData/NSHTTPURLResponse 构造)
- **风险**:高(动态协议实现易错,可能破坏现有 webview 功能;当前 GUI 环境 http/窗口渲染不稳定,难可靠验证)
- **收益**:生产资产隔离 + 完整模块级 HMR
- **结论**:暂缓;near-HMR(§27)已覆盖开发体验的主要缺口。未来实现时按本蓝图在目标平台(或有稳定 GUI 的环境)进行。

### devtools(P2.3 部分)

- 已默认启用:host `webview_create(1, …)` → `developerExtrasEnabled`(cocoa 后端 window_settings 中设置)

### ✅ 已实现(2026-08):ztron:// 自定义 scheme 端到端

按本蓝图实现并验证通过(spike 经 `ztron://host/index.html` 全量 57 项 FULL_OK):

1. **webview 库**:`webview_set_scheme_handler(webview_t, scheme, root)`(api.h + c_api_impl + engine_base 虚方法 + cocoa 实现)
2. **WKURLSchemeHandler 动态类**(cocoa_webkit.hh):`ZtronSchemeHandler` 实现 `startURLSchemeTask:`(URL→root 文件→NSHTTPURLResponse+NSData 响应,含 Content-Type MIME)与 `stopURLSchemeTask:`
3. **注册时机**:window_settings(webview 创建前)读 `ZTRON_SCHEME_ROOT` env 注册 —— **晚注册(webview 创建后 set)被 WKWebView 忽略**(排查确认)
4. **host**:读取 env 后 `navigate` 到 `ztron://host/index.html`;backend 用 `ZTRON_SCHEME_URL` 作 devUrl

**踩坑记录**:

- 晚注册 scheme handler 无效(须在 config 创建时注册)
- `NSData dataWithContentsOfFile:` 返回 +0,不可再 `init`(会崩/错)
- `dictionaryWithObject:forKey:` 类方法构造崩溃 → 改 `NSMutableDictionary dictionary` + `setObject:forKey:`
- 缺 Content-Type header → WKWebView 不解析 HTML/不加载 JS
- libwebview 是 versioned dylib(`libwebview.0.12.dylib`),cp 需带 symlink 链

**解锁**:自定义协议加载(资产隔离)、convertFileSrc、完整模块级 HMR 的基础

**convertFileSrc(随 scheme 落地)**:

- api `convertFileSrc` 默认 protocol 改为 undefined(原默认 "asset" 会绕过 scheme 检测);bootstrap 在 `location.protocol === "ztron:"` 时返回 `ztron://host/asset/<encodeURIComponent(path)>`
- scheme handler 识别 `asset/` 前缀 → 百分号解码绝对路径直接服务
- spike:img 加载 `convertFileSrc()` 转换的文件 → `CONVERT_FILE_SRC_OK`(仅 scheme 模式)
- **打包坑**:libwebview 是 versioned dylib(install name `@rpath/libwebview.0.12.dylib`),packMacApp 只拷 `libwebview.dylib`(symlink)→ 打包 app 缺版本化 dylib。修复:拷真实 `libwebview.0.12.0.dylib` + 重建 symlink 链

**dev 升级:Vite dev server + 完整 HMR**(取代 near-HMR build+reload)
- CLI dev 优先启动 Vite dev server(`hmr:true`)→ 前端经 `http://localhost:5173` ESM 加载,`@vite/client` 连 WS → **模块级 HMR**
- 变更探测验证:`[vite] (client) page reload src/main.ts`(非 hot-accept 模块整页 reload;hot-accept 模块就地更新)
- 无 frontend/index.html 的内联 html app 回退 near-HMR watcher
- 收益:ESM 源码调试(真 source map/模块名)、无需每次全量 build、HMR 基建就绪

## 多窗口(架构 + API 完成,运行时创建受 webview 库限制)

- **架构**:host 加 webview 注册表(label→webview_t),socket 消息按 label 路由(`zt_webview(label)`);`ipc_cb` 带 label 参数(webview_bind 的 arg)
- **backend**:`plugin:webview|create` → `App.createWindow(config)`;api `WebviewWindow`(extends Window,`create()`)
- **限制**:单窗口全流程正常(回归 FULL_OK);**运行时第二窗口创建卡 GUI** —— webview 库在 run loop 活跃时 `webview_create`(新 WKWebView)与主窗口 dispatch 冲突。需库级修复(如建窗移至 webview_run 前/独立线程),或目标平台验证
- 已验证:host/backend/api 路由(MULTI_WINDOW_OK 经 api 路径)

## 29. 补充:clipboard 插件 + CSP 注入 + tray 崩溃修复(已验证)

### clipboard 插件 ✅(`CLIPBOARD_OK:hello-clipboard`)

- `plugin:clipboard|read_text` / `write_text`,core 加 `ClipboardController`(runtime-ffi 实现,`sendRequest` 读 / `send` 写)
- host 三平台:
  - macOS:`NSPasteboard.generalPasteboard` + `stringForType:` / `clearContents`+`setString:forType:`
  - Windows:`OpenClipboard` + `CF_TEXT`(GlobalAlloc/GlobalLock)
  - Linux:`gtk_clipboard_get(GDK_SELECTION_CLIPBOARD)` + `wait_for_text` / `set_text`
- 前端 `readClipboardText` / `writeClipboardText`(api/clipboard.ts)

### 关键发现 1:`Msg.type` 长度截断 bug

- `Msg.type` 原是 `char[16]`;`clipboard_read_text`(18)/`menu_item_set_enabled`(22)超长
- `zt_json_str` 会截断后写 `'\0'` 并返回 `*p=='"'`(此时 *p 非引号)→ **返回 0 → host 静默丢弃该消息**
- 修复:`char[32]`,并统一 `text/tooltip/message → str2`、`title/item_id/default_name → id`

### 关键发现 2:host 在 tray 操作后崩溃(定位过程)

- 现象:CLIPBOARD_OK 之后 TRAY/MENU/DIALOG 永不出现,前端卡在 `await setTrayTooltip`
- 定位:后端已写 set_tooltip 的 response(无 `be-send:ERR`),但 host 永远读不到下一行
- 根因:**host 进程在 `tray_set_tooltip` → `setToolTip:` 处 EXC_BAD_ACCESS 崩溃**
  - `statusItemWithLength:` 返回 **autoreleased** 的 NSStatusItem;存储到 `g_status_item` 未 retain
  - 主 run loop 排空 autorelease pool 后 `g_status_item` 成悬垂指针 → 下次 `setToolTip:` 崩溃(PAC failure)
- 修复:`tray_create` 中 `[item retain]`,`tray_destroy` 中 `[g_status_item release]`
- 教训:跨线程/跨 runloop 存储的 autoreleased 对象必须显式 retain

### CSP 注入 ✅

- CLI `buildFrontend`:若 index.html 无 CSP meta,注入默认 CSP
  - `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:* ws://localhost:*`
- `ztron.conf.json` 的 `csp` 字段可覆盖

### spike:22 项 FULL_OK

- 新增 CLIPBOARD_OK;阈值 22(CODEGEN…WIN_EVENT/TRAY/MENU/DIALOG_REG),连续 3 次全绿

## 30. 补充:positioner + window-state + notification 插件(已验证)

### positioner ✅(`POSITIONER_OK:120,140`)

- host 新 op:`window_get_frame`(返回 `{x,y,width,height}`)、`window_set_position`(x/y;Msg 加 x/y 字段)
- macOS:`[window frame]` / `setFrameOrigin:`(arm64 直接 objc_msgSend,x86_64 用 objc_msgSend_stret)
- Windows:`GetWindowRect` / `SetWindowPos`;Linux:`gtk_window_get_position/size` / `gtk_window_move`
- core 内建命令 `plugin:window|get_frame/get_position/set_position`;api `positioner.ts`
- 验证:setPosition(120,140) → getPosition 精确返回 (120,140)

### window-state 插件 ✅(`WINDOW_STATE_PLUGIN_OK:120,140`)

- `windowStatePlugin({ file, restoreOnStartup })`,命令 `plugin:window-state|get/save/restore`
- save:读当前 frame 写 JSON;restore:读 JSON 应用位置+尺寸;restoreOnStartup 在 setup 后延 100ms 自动恢复
- api `window-state.ts`(`getWindowState/saveWindowState/restoreWindowState`)

### 关键发现:`webview_set_size` 总是居中窗口

- webview 库 cocoa 后端 `set_size_impl`(cocoa_webkit.hh)设置 frame 后**无条件调用 `NSWindow_center()`**
- 因此 restore 若先 setPosition 再 setSize,窗口会被重新居中,位置丢失(实际得到屏幕中心坐标)
- **修复:restore 先 setSize 再 setPosition**(文档记录,避免重踩)

### notification ✅(`NOTIFICATION_OK`)

- host op `notification_send`(title→id、body→str2)
- macOS:NSUserNotificationCenter(deprecated 但免授权/bundle);Windows:Shell_NotifyIcon NIF_INFO;Linux:notify-send
- core 内建命令 `plugin:notification|send`;api `notification.ts`
- 验证:send 命令解析即通过(OS 级投递不做断言)

### spike:25 项 FULL_OK

- 新增 POSITIONER_OK + WINDOW_STATE_PLUGIN_OK + NOTIFICATION_OK;阈值 25,连续 3 次全绿

## 31. 补充:global-shortcut + single-instance 插件 + 打包修复(已验证)

### global-shortcut ✅(`SHORTCUT_OK`)

- host op:`shortcut_register` / `shortcut_unregister`(id→m->id、accelerator→str2)
- macOS:Carbon `RegisterEventHotKey`/`UnregisterEventHotKey` + `kEventHotKeyPressed` 事件处理器(链接 `-framework Carbon`);accelerator 解析 `Cmd/Ctrl/Alt/Option/Shift + A-Z/0-9/F1-F12/Space`
- Windows:`RegisterHotKey` + `WM_HOTKEY`(zt_proc);Linux:返回 false(X11 XGrabKey 未实现)
- core `GlobalShortcutController` + 内建命令;触发时发 `tauri://global-shortcut` 事件;api `global-shortcut.ts`
- 验证:register("Cmd+Shift+K") + unregister 均返回 true

### single-instance 插件 ✅(`SINGLE_INSTANCE_OK`)

- `singleInstancePlugin({ identifier })`:FNV-1a 把 identifier 哈希到 [20000,60000) 端口,`tjs.serve` 绑定
  - 绑定成功 → 主实例;次实例连接时主实例发 `tauri://single-instance` + focus 窗口
  - 绑定失败 → 次实例(向主实例发 HTTP GET 唤醒),`is_primary === false`
- api `single-instance.ts`(`isPrimaryInstance` / `onSecondInstance`)

### 打包修复

- **launcher 无执行位 bug**:`packMacApp` 用 `writeFileSync` 写 `ztron` 启动脚本,不设 exec bit → `.app` 无法启动。修复:`chmodSync(0o755)`
- **WIN_EVENT_OK 偶发回归**:P3 轮删掉 `win.setFocus()`,focus 事件完全依赖 hide/show 时序而偶发丢失。恢复 `setFocus()`(makeKeyAndOrderFront 确定性触发 windowDidBecomeKey),dev 4/4 稳定
- **WIN_EVENT 环境性 flaky(最终结论)**:裸二进制(终端启动)受 macOS 激活限制,`makeKeyAndOrderFront`/`activateWithOptions`/`setActivationPolicy` 均无法让窗口可靠成为 key(`canBecomeKeyWindow=YES` 但 `isKeyWindow=NO`)。曾 4/4 稳定是环境恰好让窗口自然获得焦点。**决定:WIN_EVENT_OK 改为 bonus(触发才报,不阻塞 SPIKE);spike 硬阈值 = 30 个确定性检查**。`open`/Finder 启动的 .app 中窗口正常获得焦点,该检查在那种环境下会通过
- **已知限制**:script 启动的裸二进制 .app(非 `open`)不激活 app → 窗口永不 key → WIN_EVENT 不发。`open`/Finder 启动时正常。属环境性,非代码 bug

### spike:27 项 FULL_OK

- 新增 SHORTCUT_OK + SINGLE_INSTANCE_OK;阈值 27,连续 4 次全绿
- `ztron build` 打包回归:产物含 CSP、launcher 可执行、运行 26/27(script 启动缺 WIN_EVENT,见上)

## 32. 补充:窗口外观(set_opacity / transparent / decorations,已验证)

- `plugin:window|set_opacity`(0.0–1.0,Msg 加 `double opacity_val` + `zt_json_double` 解析)
- `plugin:window|set_transparent` / `set_decorations`(bool,走 `windowState`)
- macOS:`setAlphaValue:` / `setOpaque:`+`setBackgroundColor:` / `setStyleMask`(去/加 Titled|Closable|Miniaturizable|Resizable|FullSizeContentView)
- Windows:`SetLayeredWindowAttributes(LWA_ALPHA)` / `WS_EX_TRANSPARENT` / `WS_OVERLAPPEDWINDOW`
- Linux:`gtk_widget_set_opacity` / RGBA visual+app_paintable / `gtk_window_set_decorated`
- api `window.ts`:`setOpacity/setTransparent/setDecorations`
- 验证:`OPACITY_OK`/`TRANSPARENT_OK`/`DECORATIONS_OK`;spike 30 项 FULL_OK(3 次稳定)

## 33. deep-link 插件(macOS kAEGetURL,管线已验证)

- host:AppleEvent handler(`kInternetEventClass`/`kAEGetURL`)→ 发 `deep_link` 消息;`LSRegisterURL` 注册当前可执行;embedded Info.plist 加 `CFBundleURLTypes`(ztron scheme)
- core `DeepLinkController`(onEvent + getLastUrl)+ `plugin:deep-link|get_last_url`;触发时发 `tauri://deep-link` 事件
- api `deep-link.ts`(`getCurrentUrl` / `onDeepLink`)
- 打包 app Info.plist 也加 `CFBundleURLTypes`(CLI appInfoPlist)→ `open "ztron://..."` 可用
- **验证**:
  - dev spike:`DEEP_LINK_OK`(管线:get_last_url 返回 null、onDeepLink 可注册),31 项 FULL_OK
  - 打包 app:`lsregister` 注册后 `open "ztron://..."` 退出 0(scheme 已认领)
  - **已知限制**:脚本启动的裸二进制/dev 无法认领 scheme(LaunchServices 只认 bundle);URL 投递到"已运行实例"依赖启动方式(脚本启动的实例 `open` 会另起新实例)—— 标准 macOS 行为,非代码 bug

## 34. 修复:JSON boolean 解析 bug(重要)+ window-state 增强

### 关键 bug:`zt_json_int` 无法解析 JSON boolean

- `Msg.bool_val`(`set_*` 窗口 op 的 value 字段)用 `zt_json_int`(atoi)解析 → `"value":true` → `atoi("true")=0`
- **受影响**:set_always_on_top / set_visible / set_resizable / set_fullscreen / set_transparent / set_decorations / menu `enabled` / `separator` —— 全部失效(spike 只验证命令 resolve,未验证实际状态,掩盖了 bug)
- 修复:新增 `zt_json_bool`(识别 `true`/`false`/整数),用于 `value`/`separator`/`enabled` 字段
- 现象溯源:window-state 增强后 save 时 `is_maximized` 误报 true(setDecorations(true) 未生效 → 窗口保持 borderless style=0 → isZoomed=true)

### window-state 增强

- 新增保存 `maximized`/`fullscreen` 标志(save 查询 is_maximized/is_fullscreen,restore 恢复)
- 单测新增:标志保存 + restore 重新最大化

## 35. 修复:ztron init 脚手架无法打包

- **问题**:模板用内联 `html`、无 frontend 目录,`ztron build` 强制要求 frontend → scaffold 无法打包
- **修复**:模板生成最小 `frontend/index.html` + `frontend/src/main.ts`(vite,CLI 程序化配置);后端用 `ZTRON_DEV_URL`(devUrl)指向构建产物,内联 html 仅作回退;注册 `hello` 命令示例
- 验证:模板 typecheck 通过(backend 用 AppBuilder.setup 注册命令,`command()` 在 App 上非 AppBuilder)
- 注:`@ztron/*` 未发布时 scaffold 需在 monorepo 上下文构建(独立 `pnpm install` 会因依赖未发布而失败)

## 36. window_get_state 查询 + boolean op 生效验证

- host 新 op `window_get_state`:返回 `{maximized,minimized,fullscreen,always_on_top,visible,resizable}`(macOS isZoomed/isMiniaturized/styleMask/level/isVisible;Win IsZoomed/WS_EX_TOPMOST/...;Linux gtk_window_is_*)
- core `plugin:window|get_state` + `WebviewHandle.getWindowState()`;api `Window.getState()`
- **动机**:§34 的 boolean 解析 bug 靠 spike 无法发现(只验证命令 resolve)。`getState` 让 spike _\*直接断言 set_* 生效_*
- spike 新增 `STATE_VERIFY_OK`(alwaysOnTop/resizable/visible=true,maximized/fullscreen=false),阈值 31,3 次稳定 + 打包回归

## 37. drag-region(`startDragging`,命令 round-trip 已验证)

- host op `start_dragging`:
  - macOS:`performWindowDragWithEvent:[NSApp currentEvent]`(非 mouseDown 事件安全 no-op)
  - Windows:`ReleaseCapture` + `SendMessage(WM_NCLBUTTONDOWN, HTCAPTION)`
  - Linux:`gtk_window_begin_move_drag`
- core `plugin:window|start_dragging` + `WebviewHandle.startDragging()`
- api `Window.startDragging()` + `setupDragRegion()`(监听 `[data-tauri-drag-region]` 元素 mousedown)
- 单测 + spike:`DRAG_REGION_OK`(32 项 FULL_OK,3 次稳定);真实拖动需鼠标(手动)
- 完成 frameless 窗口故事:`setDecorations(false)` + drag-region

## 38. window-state 增强:alwaysOnTop 持久化 + getState 复用

- save 改用 `getWindowState()`(单次查询代替两次 is_* 查询),持久化 `maximized`/`fullscreen`/`alwaysOnTop`
- restore/setup 恢复时重放 three 标志(`toggle_maximize` / `set_fullscreen` / `set_always_on_top`)
- 单测更新:save 写 alwaysOnTop,restore 重放 set_always_on_top(true)
- spike 32 项 FULL_OK(2 次稳定)

## 39. app 元数据 API(getName / getVersion / getTauriVersion)

- core 内建 `plugin:app|name/version/tauri_version`(读取 AppConfig.appName/version;tauri_version 固定 "2.0.0")
- api `app.ts`(`getName`/`getVersion`/`getTauriVersion`);spike `APP_OK`
- 单测:appName/version 从 config 返回;spike 33 项 FULL_OK(2 次稳定)

## 40. process 模块(exit / relaunch)

- host op `app_exit`(带退出码,`m->status`)与 `app_relaunch`;HostPlatformOps 加 `relaunch`(macOS fork+execl 自身、Win ShellExecute、Linux /proc/self/exe)
- core `plugin:process|exit/relaunch` + `ProcessController`;api `process.ts`(`exit`/`relaunch`)
- **注意**:spike 只验证命令注册(`PROCESS_OK`),不实际调用(会退出应用);relaunch 为 best-effort(宿主自身 respawn,打包 app 由 launcher 完整重启 host+backend)
- 单测:exit 记录退出码、relaunch 计数;spike 35 项 FULL_OK

## 41. 修复:字段映射 bug(tray 标题 / dialog 标题 / menu 标题)

- **wire 字段映射**(host.c socket_thread):`title→m->id`、`menu_id→m->str`、`item_id→m->id`、`text/tooltip/message/accelerator→m->str2`
- **tray bug**:`tray_create`/`tray_set_title` 用 `m->str`,但 title 在 m->id → **托盘标题一直是空**(三平台)。修复:改 `m->id`
- **dialog bug**:`dialog_open`/`dialog_message` 的标题用 `m->str`,但 title 在 m->id → 对话框标题空。修复:macOS/Win/Linux 改 `m->id`(dialog_save 的 title 与 default_name 冲突,标题为装饰性,保留 default_name)
- **menu 标题 bug**:`menu_item_set_title` 后端发 `title`(与 item_id 同映射 m->id)→ 新标题丢失。修复:后端改发 `text`(→m->str2)
- 这些 bug 均被"命令能 resolve"的 spike 掩盖;TRAY_OK/MENU_OK/DIALOG_REG_OK 只验证注册

## 42. 修复:window set_title + get_title(NSString 转换)

- **set_title**:host.c 用 `m->str`,但 title 映射到 m->id → `win.setTitle()` 一直失效。修复:改 `m->id`
- **get_title 新查询**:`[window title]` 返回 **NSString***(不是 const char*),直接 cast 传给 `zt_reply_string`(strlen 读垃圾)→ 查询挂起。修复:用 `UTF8String` 转换
- Win `GetWindowTextA` / Linux `gtk_window_get_title`(C 字符串,天然正确)
- core `plugin:window|get_title` + `WebviewHandle.getWindowTitle()`;api `Window.getTitle()`
- **验证**:spike `TITLE_OK`(setTitle→getTitle round-trip 直接验证 wire 字段),36 项 FULL_OK(3 次稳定)
- 教训:`[xxx title]`/`[xxx stringValue]` 返回 NSString*,必须 `UTF8String` 转 C 串 —— 与 boolean 解析、字段映射同类的潜伏 bug

## 43. 修复:zt_reply_string 不完整 JSON 转义

- 旧实现只转义 `"` 和 `\`;**裸换行/控制字符会切断 backend 按行读取**(新行即消息边界)→ JSON.parse 失败 → 查询**挂起**
- 修复:补 `\n`/`\r`/`\t` 转义 + 其他控制字符替换为 `?` + 缓冲边界(65536-32)
- 影响面:所有 `zt_reply_string` 响应(clipboard 读、dialog 路径、window_get_title)
- **验证**:spike clipboard 改为特殊字符往返(`'line1\n"quoted"\\back'`),`CLIPBOARD_OK` round-trip 通过;36 项 FULL_OK

## 44. 修复:zt_reply_string 固定缓冲截断大回复

- 上一版 `char buf[65536]` 会把 >64KB 回复(大剪贴板文本/dialog 路径)截断 → 静默数据丢失
- 修复:按 `strlen(s)*2+64` heap 分配,无截断;OOM 时回退 `zt_reply_null`
- **验证**:spike 加 100KB 剪贴板往返 `CLIPBOARD_BIG_OK:100000`;37 项 FULL_OK(2 次稳定)

## 46. fs 插件补 copy / rename / stat

- tjs 原生有 `copyFile`/`rename`/`stat`;fs 插件补 `plugin:fs|copy|rename|stat`(双路径均过 PathScope)
- `stat` 返回 `{size,isDirectory,isFile,modifiedAt}`(mode 位判断目录)
- 权限:`fs:allow-copy/rename/stat` 加入 `fs:full`;example capability 显式授予
- api `fs.ts`:`copyFile`/`renameFile`/`stat`
- 修正 tjs-global.d.ts 的 stat 类型声明(实际返回 `{size,mode,mtime:string}`,非 isFile/isDirectory)
- spike `FS_COPY_RENAME_OK:8`(copy→rename→stat 往返);38 项 FULL_OK

## 47. shell execute 补 cwd/env

- `plugin:shell|execute` 透传 `cwd`/`env` 给 `tjs.spawn`(scope 校验仍作用于 program+args)
- api `shell.execute(program, args, {cwd, env})`
- spike `SHELL_CWD_OK`(`pwd` 在 tempDir 运行;example scope 加 `pwd`),39 项 FULL_OK

## 48. dialog_open 目录选项修复

- 后端发 `directory` 选项但 host 忽略(wire 无映射 + macOS 硬编码 setCanChooseDirectories:NO)→ 目录选择失效
- 修复:host.c 加 `directory`→`m->bool_val` 映射;macOS setCanChooseFiles/Directories 按标志;Linux 用 `GTK_FILE_CHOOSER_ACTION_SELECT_FOLDER`
- Windows 需 COM IFileDialog(保留为 skeleton 已知限制)
- 验证:39 项 FULL_OK 回归

## 49. tray 图标(setIcon)

- host op `tray_set_icon`(icon→m->str2):macOS NSImage `alloc`+`initWithContentsOfFile:`(⚠ `imageWithContentsOfFile:` 在新 macOS 被移除,废弃 API 会导致 `unrecognized selector` 崩溃)、Win `LoadImage`+NIF_ICON、Linux `gtk_status_icon_set_from_file`
- backend tray.apply("set_icon") + api `tray.setIcon(path)`;TrayOp/TrayPayload 加 set_icon/icon
- spike:backend setup 写 1x1 PNG 到 TMP,前端 setTrayIcon(TRAY_OK 内联验证),39 项 FULL_OK(2 次稳定)
- 教训:废弃 ObjC API(`imageWithContentsOfFile:`)在现代 macOS 直接崩溃 —— 与 NSString 类型同类的"编译过、运行时崩"风险

## 50. shell.open(默认浏览器打开 URL)

- `plugin:shell|open`:校验 `^https?://`,拒绝其他协议;用 tjs.spawn 调平台 opener(macOS `open`/Linux `xdg-open`/Win `cmd start`)
- 实现于插件层(不经过 host,避免加 adapter 通道);api `shell.open(url)`
- 权限 `shell:allow-open` 加入 `shell:default`
- spike `SHELL_OPEN_OK`:验证 `file://` 被拒(不真正打开浏览器);40 项 FULL_OK

## 51. window 小 API:theme / scaleFactor / setIgnoreCursorEvents

- host op:
  - `window_get_theme`:macOS `NSApp.effectiveAppearance.name` 含 "Dark";Win 注册表 AppsUseLightTheme;Linux gtk-theme-name 含 "dark"
  - `window_get_scale_factor`:macOS `[window backingScaleFactor]`;Win GetDpiForWindow/96;Linux gdk_screen_get_scale_factor
  - `set_ignore_cursor_events`:macOS `setIgnoresMouseEvents:`;Win WS_EX_TRANSPARENT;Linux no-op(输入穿透需额外工作)
- core `plugin:window|get_theme/get_scale_factor/set_ignore_cursor_events` + WebviewHandle 方法;api `Window.getTheme()/scaleFactor()/setIgnoreCursorEvents()`
- spike `THEME_OK:light@1`(theme 合法 + scaleFactor>0 + ignore 往返);41 项 FULL_OK(2 次稳定)

## 52. .app 应用图标

- `assets/app-icon.png`(1024×1024 生成的蓝底白 Z 图标,Python 脚本)
- CLI `packMacApp`:`buildIcns()` 用 sips 生成 iconset + iconutil → `AppIcon.icns` 拷入 Resources,Info.plist 设 `CFBundleIconFile`
- **坑 1**:iconutil 要求输入目录名以 `.iconset` 结尾(mkdtemp 模板需末尾 XXXXXX,先建再改名)
- **坑 2**:iconset 文件名必须是合法集合(16/32/128/256/512 + @2x,不能有 64/1024)
- 验证:打包产物含 AppIcon.icns(78KB)+ CFBundleIconFile;spike 41 项全绿

## 53. websocket 插件

- `plugin:websocket|connect/send/disconnect`;连接池 Map<id, WebSocket>;收消息推 `tauri://websocket-message`,开关推 `tauri://websocket-status`
- 纯插件层(tjs 原生 WebSocket),无 host 改动;api `websocket.ts`(connect/sendMessage/disconnect/onMessage/onStatus)
- 权限 `websocket:allow-*` 加入 `websocket:default`
- spike:`WEBSOCKET_OK:ws-echo-test`(连 postman-echo → 发送 → 收到回显);42 项 FULL_OK(2 次稳定)
- 注:echo.websocket.org 不回显原消息(返回 "Request served by ..."),故用 ws.postman-echo.com/raw

## 54. app.getConfig

- `plugin:app|get_config` 返回 AppConfig(identifier/appName/version/windows 等),**剥离 invokeKey/initScript/withGlobalTauri 敏感字段**
- api `app.getConfig()`;单测验证 invokeKey 不泄漏
- spike `APP_CONFIG_OK:com.ztron.hello`;43 项 FULL_OK

## 55. Window 查询 getter 补齐(Tauri 对齐)

- `Window.isAlwaysOnTop()/isVisible()/isResizable()`(来自 getState)、`outerSize()/outerPosition()`(来自 getFrame)—— 纯前端,无需新 host 命令
- spike `WINDOW_GETTERS_OK:900x608`(is* 与 getState 一致 + outerSize>0);44 项 FULL_OK

## 56. local-ip 插件

- `plugin:local-ip|get`:macOS `ipconfig getifaddr en0`(回退 route get default 找接口)、Linux `hostname -I`;正则校验 IPv4,未知返回 null
- 纯插件层(tjs.spawn),无 host 改动;api `localIp.getLocalIpv4()`
- 权限 `local-ip:allow-get` 加入 `local-ip:default`
- spike `LOCAL_IP_OK:192.168.0.134`(真实 LAN IP);45 项 FULL_OK

## 57. shell executeStream(输出流式)

- `plugin:shell|execute_stream`:逐块读 stdout/stderr,推 `tauri://shell-output`/`shell-error` 事件;resolve 退出码
- api `shell.executeStream(program, args, {onChunk, onError})`;权限 `shell:allow-execute-stream` 加入 `shell:default`
- **坑**:scope 参数模式 `["*"]` 只匹配单个参数;`sh -c <script>` 需 `["**"]`
- spike `SHELL_STREAM_OK:3`(`sh -c 'echo one; sleep 1; ...'` 收到 ≥2 个 chunk,证明渐进输出);46 项 FULL_OK

## 58. os.locale + window.innerPosition

- `plugin:os|locale`:tjs 无 Intl,用 `LC_ALL/LANG/LANGUAGE` env 规范化(`en_US.UTF-8`→`en-US`);权限 `os:allow-locale` 加入 `os:default`
- `Window.innerPosition()`:近似 outer(frame 原点,精确 content 原点需标题栏高度)
- spike `LOCALE_OK:en-US`;47 项 FULL_OK

## 59. upload 插件 + HttpScope 端口通配修复

- `plugin:upload|upload({url,file})`:文件过 PathScope、URL 过 HttpScope,读文件字节 → 原始 POST
- api `uploader.upload(url, file)`;权限 `upload:default`
- **HttpScope bug**:`new URL` 无法解析 `*` 端口 → 文档示例 `http://localhost:*` 一直失效。修复:compile 前归一化 `://host:*`,port 用 -1 通配
- spike:example setup 起本地 echo 服务器(tjs.serve 回显 body),前端写文件→上传→验证回显;`UPLOAD_OK:200`;48 项 FULL_OK

## 60. persisted-scope 插件

- `PathScope` 加 `addAllow`/`serializeAllow`;fsPlugin 接受 PathScope 实例
- `persistedScopePlugin({file, scope})` 返回 `{...plugin, scope}`:启动时从 JSON 加载持久化 allow 条目合并进 scope;`plugin:persisted-scope|get/save`
- api `persistedScope.get/save`
- spike:`PERSISTED_SCOPE_OK`(预置 `$HOME/ztron-persisted-spike/**` 条目 → fs 在 $TMP 之外写读成功,证明持久化生效);49 项 FULL_OK

## 61. window.setCursor

- host op `set_cursor`(cursor→m->str2):CSS 风格名 → 平台光标
  - macOS:NSCursor 映射(pointer→pointingHandCursor、text→IBeamCursor、resize 系列、grab→openHand 等)+ `[cursor set]`(WKWebView 下 best-effort)
  - Windows:LoadCursor(IDC_*) + SetCursor;Linux:gdk_cursor_new_from_name + gdk_window_set_cursor
- core `plugin:window|set_cursor` + `WebviewHandle.setCursor`;api `Window.setCursor(cursor)`
- spike `CURSOR_OK`(pointer/text/default round-trip);50 项 FULL_OK(视觉为手动)

## 62. network 插件(ipv4/ipv6/public)

- `plugin:network|get_local_ipv4/6` + `get_public_ip`;local 复用 shell(ipconfig/hostname -I/ifconfig),public 用 `icanhazip.com`(纯文本,比 api.ipify.org 稳)
- api `network.getLocalIpv4/6`/`getPublicIp`;权限 `network:default`
- spike `NETWORK_OK:192.168.0.134:none:180.213.154.232`(local+public);51 项 FULL_OK

## 63. 测试框架(三层 100% 覆盖)

- **Surface(完整性)**:`tests/helpers/manifest.ts` 是命令 + @ztron/api 导出的 source of truth;`surface.test.ts` 断言框架注册的命令与导出 == 清单(无缺失/无多余)
- **Unit(路由/行为)**:`MockRuntime` 增强(补 tray/menu/dialog/clipboard/notification adapter)+ `tjs-stub.ts`(内存 fs/spawn/serve)→ `routing.test.ts` 逐个命令断言路由;`scopes.test.ts` PathScope/HttpScope 穷举;`acl.test.ts` ACL 穷举;`coverage.test.ts` 覆盖账本(UNIT_COVERED ∪ INTEGRATION_ONLY = 全部命令,无空洞)
- **Integration**:spike 51 项(tjs:` 模块/网络/会退出应用的命令)
- 运行:`pnpm test`(50 测试:49 pass / 1 skip)
- 发现并修复:`store` 缺 `has` 命令(补上)、api 顶层导出补全(fs copyFile/renameFile/stat、os locale、updater check/verify/download)
- 设计要点:manifest 即契约 —— 新增命令/API 必须同步更新 manifest,否则测试失败

## 64. path 目录 getter 补全(Tauri 对齐)

- `pathPlugin({ appId })` 新增 ~20 个目录 getter(appData/appConfig/appCache/appLocalData/appLog/baseline/data/config/cache/font/desktop/document/download/picture/audio/video/public/template/runtime/executable/resource dir)
- 平台约定:macOS `~/Library/Application Support/<appId>` 等;Linux `~/.local/share` 等;Windows APPDATA 等(安全访问,不引用 process)
- 单测:appId 约定路径 + 常用目录;spike `PATH_APP_DIRS_OK`;52 项 FULL_OK

## 65. os type / family / eol 补全

- `plugin:os|type`(Darwin/Windows_NT/Linux)、`family`(macos/windows/linux)、`eol`(\n 或 \r\n)
- 权限 os:allow-type/family/eol 加入 os:default;api os.type()/family()/eol()
- 单测:type=Darwin/family=macos/eol="\n"(stub navigator);spike `OS_TYPE_OK:Darwin`;53 项 FULL_OK

## 66. window setShadow / setEnabled / setZoom

- host op:
  - `set_shadow`:macOS `setHasShadow:`;Win CS_DROPSHADOW;Linux no-op
  - `set_enabled`:Win `EnableWindow`;Linux `gtk_widget_set_sensitive`;**macOS 无 NSWindow setEnabled → no-op**(安全,避免 unrecognized selector 崩溃)
  - `set_zoom`:CSS zoom via `webview_eval`(host.c on_gui,`zoom`→opacity_val 双精度)
- core:WindowStateOp 加 set_shadow/set_enabled;WebviewHandle.setZoom;plugin:window|set_zoom/set_shadow/set_enabled
- api:Window.setShadow()/setEnabled()/setZoom()
- **教训(重要)**:插入 host on_gui 分支时**误删了 `response`/`quit` 分支** → 前端 invoke 永不 resolve、SPIKE terminate 失效(表现为 spike 0 输出,排查了 backend/host 多轮)。修复:恢复 response/quit。**这是"改一处、坏别处"的典型,spike 全绿是唯一防线**
- spike:CURSOR_OK(含 shadow/enabled/zoom round-trip);53 项 FULL_OK

## 67. menu 子菜单 + 复选(Submenu / CheckItem)

- `MenuItemConfig` 加 `type`(normal/check/radio)、`checked`、`children`
- host:
  - `menu_add_item` 加 checked 参数(macOS `setState:NSOnState`;Win/Linux 忽略)
  - 新 `menu_add_submenu_item(menu_id, submenu_id, text)`(macOS 建 NSMenu + setSubmenu,子项递归;Win/Linux no-op)
  - Msg 加 `checked` 字段 + `submenu`→m->id 解析
- backend:menu createMenu 递归构建(子菜单 + check);api MenuItem 支持嵌套/check
- spike:setAppMenu 含子菜单 View→Zoom(check)+Reload;MENU_OK;53 项 FULL_OK

## 68. window.setBounds

- host op `window_set_bounds`:macOS `setFrame:display:`(⚠ `setFrame:` 不存在,unrecognized selector 崩溃,正确为 3 参数 `setFrame:display:`);Win `SetWindowPos`(全参);Linux `gtk_window_move`+`gtk_window_resize`
- core `WebviewHandle.setBounds` + `plugin:window|set_bounds`;api `Window.setBounds(x,y,width,height)`
- 单测:setBounds 路由 + frame 更新;spike CURSOR_OK(含 setBounds);53 项 FULL_OK

## 69. shell Command 类 + menu radio

- **shell.Command 类**(Tauri 对齐):`new Command(program, args, options)` + `.on("stdout"/"stderr"/"status")` + `.spawn()`(流式)/`.execute()`(收集)/`.status()`;sidecar 不支持(抛错)
- **menu radio**:`type:"radio"` 在 wire 层与 check 同走 `checked` 状态(macOS `setState:`);radio 组互斥为 UI 细节,当前为复选标记
- api `shell.Command` + `MenuItem.type="radio"`;spike `SHELL_CMD_CLASS_OK` + 菜单含 radio 项;54 项 FULL_OK

## 70. window preventClose + destroy

- host:
  - `set_prevent_close`(macOS `g_prevent_close` 标志;Win/Linux no-op)→ `windowShouldClose:` 拦截:prevent 时发 `window_event close`(→`tauri://close-requested`)+ 返回 NO
  - `window_destroy`:macOS `webview_terminate`、Win `DestroyWindow`、Linux `gtk_window_close`(绕过 preventClose 强制关闭)
- core `plugin:window|prevent_close/destroy` + `WebviewHandle.destroy`;api `Window.preventClose()`/`destroy()`
- 单测:prevent_close 路由 + destroy 计数;spike `PREVENT_CLOSE_OK`;55 项 FULL_OK(真实 close 点击为手动)

## 71. window startResizeDragging

- host op `start_resize_dragging`(direction→m->str2):Win `WM_NCLBUTTONDOWN`(HTTOPLEFT/HTRIGHT/…)、Linux `gtk_window_begin_resize_drag`;**macOS no-op**(需 NSEvent 追踪循环,未实现)
- core `WebviewHandle.startResizeDragging` + `plugin:window|start_resize_dragging`;api `Window.startResizeDragging(direction)`
- 单测:方向路由;spike `RESIZE_DRAG_OK`;56 项 FULL_OK

## 45. 修复:host 推送事件未 JSON-escape 用户字符串

- `menu_event`/`shortcut_event`/`deep_link` 嵌入用户字符串(menu_id/item_id/shortcut_id/url),旧代码只转义部分 → 特殊字符破坏 JSON → 事件丢失(fire-and-forget,不挂起但静默丢事件)
- 新增 `zt_json_escape`(quote/backslash/`\n`/`\r`/`\t`/ctrl)→ macOS menu/shortcut/deep_link、Windows menu/shortcut;Linux 只推固定 window_event,无需改
- 验证:37 项 FULL_OK 回归

## 72. Image 模块

- host 图像注册表:`image_from_bytes`(base64→NSData→NSImage)、`image_from_path`、`image_destroy`;`tray_set_icon` 支持 image_id
- core `ImageController` + `plugin:image|from_bytes/from_path/destroy`;api `Image` 类(`fromPath`/`fromBytes`/`fromRGBA`/`close`)
- `tray.setIcon` 接受 path 或 Image
- **坑**:`path` 字段未映射到 m->str → `initWithContentsOfFile:""` 返回 nil。修复:socket_thread 加 `path`→m->str 解析
- 单测:image 命令路由;spike `IMAGE_OK`(fromPath + fromBytes→tray);57 项 FULL_OK

## 73. window v2 批次 2(Tauri 对齐:size 约束/按钮开关/dock 扩展)

- **命令(20)**:`set_size_constraints`/`set_min_size`/`set_max_size`、`set_minimizable`/`is_minimizable`、`set_maximizable`/`is_maximizable`、`set_closable`/`is_closable`、`is_decorated`/`is_focused`、`set_skip_taskbar`、`set_always_on_bottom`、`set_content_protected`、`request_user_attention`、`set_progress_bar`、`set_badge_count`、`set_badge_label`、`set_background_color`、`set_titlebar_style`
- **macOS 实现**:
  - 按钮开关走 style mask:`NSMiniaturizableMask`(min)、`standardWindowButton:2`(zoom 按钮 setEnabled)、`NSClosableMask`;查询对应反向读
  - `set_skip_taskbar` = `NSApplicationActivationPolicyAccessory`(app 级,Dock 图标隐藏);`set_always_on_bottom` = `setLevel:-1`;`set_content_protected` = `setSharingType:`
  - min/max size:`setContent{Min,Max}Size:`(NSSize 2×double by-value,scalar cast 匹配 arm64 浮点寄存器 ABI,同 §69 setFrameOrigin)
  - dock:progress = `NSProgressIndicator`(determinate 0–100)塞进 `dockTile.contentView`(tao 对齐;负值清除);badge = `dockTile.badgeLabel`
  - titlebar style:tao 语义矩阵 —— `overlay` = transparent+fullSizeContentView,`transparent` = 仅 transparent,`visible` = 双 false
- **坑(set_badge_label 参数冲突)**:payload 的 `label` 字段是窗口路由参数(所有 `plugin:window|*` 都带),handler 若解构 `label` 会拿到窗口标签而非 badge 文本 → 参数名改 `badgeLabel`
- **requestUserAttention 简化**:Tauri 枚举 → bool(Critical=NSCriticalRequest/Informational=NSInformationalRequest),null 视为 Informational(macOS 取消需持有 request id,未实现)
- `zt_parse_color`:`transparent`→clearColor、`#rrggbb(aa)`→sRGB NSColor、其他→windowBackgroundColor
- 单测:20 命令路由(buttons 真值断言 + badgeLabel 冲突回归);spike `WIN_BUTTONS_OK`/`WIN_V2_EXTRAS_OK`/`DOCK_V2_OK`(isFocused 属 key-window bonus);61 项报告 FULL_OK

## 74. spike 账本修复 + transformImage(P8)

- **httpPlugin 从未注册**(spike 历史遗留):`git log -S` 证实 AppBuilder 链上一直缺 `.plugin(httpPlugin(...))` → `plugin:http|fetch not found`。补注册(api.github.com + localhost scope)
- **persisted-scope 种子竞态**:旧代码先构造插件(构造器内 fire-and-forget 读文件)、后异步 IIFE 写种子文件 → 冷启动时读先于写完成,scope 未生效(access denied);重跑时又因目录残留 EEXIST。修复:种子写入 `await` 前置到插件构造之前 + `fs.makeDir(recursive)`
- **fs.make_dir recursive**(Tauri mkdir 对齐):core 命令 + api `MakeDirOptions` + tjs 声明从 `(p, mode?)` 改为 options 对象(txiki `MakeDirOptions`);顺带修正 autostart 两处旧签名调用
- **HttpScope 根路径 glob**:`https://host/*` 应匹配 `https://host/`(尾 `*` 段可匹配空,对齐 Tauri url pattern);`**` 分支保持"任意深度 ≥ prefix"。新增单测回归
- **transformImage/ImageLike**(api):`string→path`、`Image→rid`、`bytes→fromBytes 注册`;`setTrayIcon` 接受 `ImageLike` 并统一经 transformImage 归一
- **修复 tray icon-by-rid 被静默丢弃**:FFI host `set_icon` 分支只转发 `payload.icon`,不透传 `image_id` —— host.c 明明解析了该字段(真 bug,spike 只验命令往返所以从未暴露)。`TrayPayload` 补 `image_id` 字段
- 验证:55 tests(54 pass/1 skip);spike 62 项确定性全过(`HTTP_OK`/`HTTP_SCOPE_DENY_OK`/`PERSISTED_SCOPE_OK`/`TRANSFORM_IMAGE_OK`),连续两轮无状态污染;`WIN_QUERY2_OK` 归入 key-window bonus

## 75. 多窗口运行时解锁(P6.3)

- **原"卡 GUI"诊断推翻**:webview 库第二实例创建路径(cocoa engine `window_init_proceed` 直调,无 run-loop 等待)本身不死锁。真因是 **label 时序 bug**:socket 线程在**入队时**解析 `zt_webview(label)`,此时 `create_window` 尚未在 GUI 队列执行 → 注册表空 → `set_html(second)` 回落主窗(第二页加载进主窗,表象即"第二窗口永远出不来/像挂死")
- **修复:on_gui 内 GUI 线程重解析目标 webview**(`m->win_label[0] ? zt_webview(label) : w`)。主队列 FIFO 保证 create_window 先执行,后续 label 消息重解析即命中新注册表项
- **UAF 修复**:`webview_bind(nw, ..., m->win_label)` 存了 Msg 内指针,`on_gui` 末尾 `free(m)` 后即悬空 → `strdup` 
- **per-window 事件**:窗口事件回调从通知 `object` 取 NSWindow → `zt_label_for_window(wnd)` 反查注册表 label(不再硬编码 "main");第二窗口的 resize/move/focus/blur/close 事件带正确 label 路由到对应 handle
- **per-window preventClose**:`g_prevent_close` 全局旗标 → label 键控表(≤8 窗口);`set_prevent_close` 用 `m->win_label`
- **attach_webview 钩子**(HostPlatformOps 新增):runtime 建窗后给新 NSWindow 装 ZtronWindowDelegate(动态查类,已注册则复用);Win/Linux 传 NULL
- **关闭清理**:非 main 窗 `windowWillClose` → 注册表移除 + `webview_dispatch` 延迟 `webview_destroy`(不在 delegate 回调里直接销毁,避免重入 run loop);`window_destroy` op 对非 main 窗只 close 该窗(main 保持 terminate 语义)
- **backend**:`HostRuntime.sendRequest/sendQuery` 增加 `from` label 参数(原硬编码 `"main"`,第二窗口查询会打到主窗);`HostWebviewHandle` 的 frame/state/title/theme/scaleFactor/windowState 全部传 `this.label`
- **验证**:`examples/multiwin` 端到端 —— 创建→第二页 invoke(label=second)→minimize/unminimize/setTitle/is_minimized→destroy→注册表清理(`SECOND_WINDOW_OK`+`SECOND_OPS_OK`+`MULTI_WINDOW_RUNTIME_OK`);hello spike 62 项零回归

### §75 补充:退出链修复 + 库 deplete 死锁补丁

- **库补丁(webview vendored)**:`engine_base::deplete_run_loop_event_queue` 改 virtual;cocoa 端 override 为 **非阻塞排空**(`NSDate distantPast` + 256 轮上限)。原实现(dispatch done 标记 + `nextEventMatchingMask` nil expiration 无限等)在主队列块内调用时永不完成——done 块排在被占用的主队列后面,手动泵 NSApp 事件不排空 GCD 主队列。`sample` 实证主线程 1223/1576 采样卡在该循环。该死锁同时是**预先存在的**退出挂起根因(host main() 里销毁主窗同样触发)。最小 C 复现程序验证补丁后 terminate→run 返回→destroy→exit 全通
- **multiwin spike 修正**:`app.getWebview("main")` 在 `run()` 前返回空(窗口在 run() 才注册)→ terminate 从未发出;改为回调内惰性取 handle 后 EXIT 0
- **hello 真 MULTI_WINDOW 检查**:页面驱动 `WebviewWindow.create()` + 第二页经自身 IPC 报 `SECOND_PAGE_OK`(label 路由实证);**不在 hello 里 destroy 第二窗**——销毁与后续高强度 GUI 操作交错时撞 WKWebView 异步 script-message 回调 UAF(上游析构不移除 message handler,TODO 注释自认);destroy 链路由 multiwin 专项覆盖(EXIT 0 干净退出)
- **hello 退出链**:echo server 关闭 + near-HMR 轮询 clearInterval + FULL_OK 后 `tjs.exit(0)`(keep-alive fetch 连接会拖住 txiki 事件循环);hello 现也 EXIT 0
- 最终:hello 63 report/0 FAIL/FULL_OK/EXIT 0;multiwin 全检查/EXIT 0;54 tests pass

## 76. 多窗口三连修复:label 命令路由 + delegate 链式转发 + 引擎析构 UAF

**症状**:hello 第二窗口 destroy 后 app 随机崩溃/挂起(卡点漂移:51→54→56),multiwin 却全过。

1. **命令层 label 路由(真凶,系统性缺陷)**:`plugin:window|*` 全部 handler 用 `ctx.webview`(发起窗口)而非 `args.label`(目标窗口)。主页面调 `second.destroy()` → **主窗被 terminate**,app 中途死亡(ZT_TRACE 实证 `window_destroy label=main`)。此前"跨窗操作成功"全是巧合(ops 打在主窗上、查询碰巧同值)。修复:构造器里统一包装 window 命令——按 args.label 解析 `getWebview(label)`(找不到报 `window not found`,Tauri 语义),重写 ctx.webview/ctx.label
2. **delegate 链式转发**:host 的 ZtronWindowDelegate `setDelegate:` 直接**替换**了引擎的 WebviewNSWindowDelegate → 引擎错过 `windowWillClose`(本应置空 m_window/m_webview、让 dtor 跳过重复 close/over-release)。修复:`objc_setAssociatedObject(delegate, "orig", prev, ...)` 保存原 delegate,每个回调先 `fwd_to_orig`(class_respondsSelector 探测)
3. **引擎析构 UAF(库补丁)**:dtor 释放 WKWebView 前未摘 script-message handler(handler 持 `this` 回指针,in-flight WKScriptMessage 回调撞已释放引擎;上游 TODO 自认 m_manager 泄漏)。修复:dtor 先 `removeAllUserScripts` + `removeScriptMessageHandlerForName:`(新增 WKUserContentController_removeScriptMessageHandler 封装)

- 调试利器:host.c 加 `ZT_TRACE=1` 环境门控的 on_gui 消息日志(零开销,本次定位主靠它)
- 验证:hello 63 report/0 FAIL/FULL_OK/**EXIT 0**(真实 destroy + 主窗持续操作);multiwin 4 检查含 STRESS_OK(10 轮建窗-狂发 invoke-销毁竞态);54 单测绿;库补丁已入 scripts/patches/webview-local.patch

## 77. window v2 批次 3(maximize/innerSize/cursor/theme/workspaces/simple-fs)

- **13 命令**:`maximize`/`unmaximize`(条件 zoom:,区别于 toggle)、`is_enabled`(macOS 恒 true)、`inner_size`(contentView bounds)、`cursor_position`(NSEvent mouseLocation→convertScreenToBase)、`set_cursor_position`(convertBaseToScreen→CGWarpMouseCursorPosition)、`set_cursor_visible`(NSCursor hide/unhide,平衡计数)、`set_focusable`(NSNonactivatingPanelMask 1<<7)、`set_theme`(app 级 NSApp.appearance)、`set_visible_on_all_workspaces`(collectionBehavior CanJoinAllSpaces|FullScreenAuxiliary)、`set_simple_fullscreen`(存 frame→去 titled 位→整屏 setFrame;off 反向)
- api 糖:`show/hide/title/theme/setCursorIcon` 别名 + `onFocusChanged`(focus+blur 合并)、`setCursorPosition` 接受 dpi 类型
- **NSPoint ABI 心得**:2×double 结构在 arm64 与 x86_64 都走寄存器(x86_64 SSE 结构 xmm0/1 非 stret),标量强转两平台通用;NSRect 32B arm64 靠 cast 类型触发 sret(x8)
- **CLI dev server URL bug**:返回 `localhost` 可能先解析 ::1 打到无关 IPv6 监听者 → 改回绑定 IP `127.0.0.1`;port 取不到时关闭 server 返回 null(不再回退 5173)
- **max-size 清除 bug**(重):`setMaxSize(null)` 走 `(0,0)` → `setContentMaxSize:(0,0)` 是**上限为零**而非清除 → 后续 zoom 把窗口钳成 1×32 标题栏残桩(hello WINDOW_STATE_PLUGIN_FAIL + inner=1x0 的根因;multiwin 定向复现 setMaxSize(1600,1200)→(0,0)→maximize 即现)。修复:两侧 ≤0 时发 FLT_MAX 清除。min (0,0) 天然无约束,不动
- 调试法:multiwin 加 `probe` 命令读 frame/inner + 页面驱动的定向 op 链,二分定位交互 bug
- 验证:hello 64 report/0 FAIL/FULL_OK/EXIT 0(含 simpleFullscreen 往返);multiwin 4 检查;55 单测绿

## 78. menu v2(托盘菜单 / popup / accelerator / setChecked)

- **host(4 op)**:`menu_popup`(`popUpMenuPositioningItem:atLocation:inView:`,x/y 省略取光标:`NSEvent mouseLocation`→`convertScreenToBase`)、`tray_set_menu`(`NSStatusItem setMenu:`——macOS 左键弹菜单的标准位,挂 Quit/Preferences;挂菜单后 click target 不再触发,系平台约定)、`menu_item_set_checked`(`setState:`)、`menu_item_set_accel`(新 `menu_parse_accel`:令牌→NSEventModifierFlags mask + keyEquivalent 字符;`CmdOrCtrl` 在 macOS 取 Command;与 Carbon 版 parse_accelerator 同令牌集)
- **core**:4 命令(`plugin:menu|popup/set_item_checked/set_item_accel` + `plugin:tray|set_menu`)+ `MenuItemConfig.accelerator`(create 时对带 accel 的 item 追发 set_item_accel)+ MenuController 扩 3 方法 + `TrayOp`/`TrayPayload` 增 set_menu/menuId
- **api**:`Menu.setItemChecked/setItemAccelerator/popup(x?,y?)`(popup 配 DOM `contextmenu` 事件:`e.preventDefault()` 后 `popup(e.x,e.y)`)、`MenuItem.accelerator`、`tray.setMenu(menuId)`、`setTrayMenu`
- **坑**:`menu_item_set_title` 的 wire 字段 `text`(title 会撞 item_id 的 m->id 槽),set_accel 同样走 text
- 验证:hello `MENU_ACCEL_CHECKED_OK`(accel+checked 往返+popup)+`TRAY_MENU_OK`(托盘真挂菜单),66 项/FULL_OK/EXIT 0;56 单测绿

## 79. window 收尾批(monitors/getAllWindows/trafficLight/scale+theme 事件)

- **monitors(host)**:`NSScreen screens` 枚举 → `{name(localizedName),position,size,workArea(visibleFrame),scaleFactor}`(点×scale = 物理px,对齐 tao Monitor);单屏模式复用同一数组序列化,core 层 `ms?.[0] ?? null` 解包(primary/current/from_point);from_point 顶层坐标 vs Cocoa 底左坐标翻转(mainScreen.height - y)后 NSPointInRect 判定
- **get_all_windows**:core `#windows` map 键列表(无需 host);**配套修复:close 事件到达时从 map 删除非 main 窗口**(此前 destroy 后 core 侧残留 → getAllWindows 报已死窗口)
- **trafficLightPosition**:`standardWindowButton:`(0/1/2)×`setFrameOrigin:`(overlay 无标题栏窗口刚需)
- **scale-change**:delegate 加 `windowDidChangeBackingProperties:` → `backingScaleFactor` + frame×scale,事件链路扩 payload贯通(host wire `scale/width/height` → FFI 组装 → core `emit(name, payload)` → `tauri://scale-change`)
- **theme-change**:`NSDistributedNotificationCenter` 监听 `AppleInterfaceThemeChangedNotification` → 对 main+全部注册窗广播 `tauri://theme-changed`(payload "dark"/"light")
- **连环 debug(教训录)**:
  1. `windowShouldClose:` 参数是**窗口本身**(sender)而非通知——`[n object]` 无效,需 respondsToSelector 探测(performClose 曾因此异常挂起)
  2. **fwd_to_orig 时序坑(核心)**:引擎的 windowWillClose 处理器会把 m_window **置空** → 之后再经 native handle 反查 label 全部失败回落 "main" → 注册表永不清理(wins 残留)。修复:**先解析 label 再转发**。指针级 trace(note vs registry handle)定位
  3. 假象甄别:plain `close` 一直有触发 willClose,只是 label 解析失败;真实修好后 multiwin 的 second/stress-0 标签全部正确
- 验证:hello 67 项/FULL_OK/EXIT 0(`MONITORS_OK:1:Built-in Retina Display@2 workArea=3840x2312` 真实数据);multiwin 4 检查/EXIT 0;58 单测绿(monitors/getAllWindows/trafficLight 路由 + scale/theme payload 事件)

## 80. menu 动态增删 + PredefinedMenuItem

- **4 命令**:`add_item`(at 省略追加 / 带则为 `insertItem:atIndex:`)、`remove_item`(`[menu removeItem:]`)、`item_info`(查询 `{enabled,checked,title}`,null=不存在)、`create` 循环支持 `predefined`
- **PredefinedMenuItem(macOS 落地面)**:copy/cut/paste/selectAll/undo/redo/minimize/maximize/fullscreen/hide/hideOthers/showAll/closeWindow/quit/bringAllToFront/about —— `initWithTitle:action:keyEquivalent:` + **nil target**(首响应者路由,系统行为)+ 惯用快捷键(Cmd+C/X/V/A/Z、Shift+Cmd+Z/F/H…);`services` 需 NSApp.servicesMenu 布线,暂不支持
- **两个 API 陷阱(崩溃实证录)**:
  1. **macOS 无 `+[NSMenuItem standardItem:]`**(想当然记错,ObjC 实测 `NSInvalidArgumentException`)——全部走 selector 构造
  2. **NSMenuItem 无 `removeFromMenu:`**(同因 doesNotRecognizeSelector 杀死 host)——正确姿势 `[menu removeItem:item]`
- **popup 模态性(sample 实证)**:`popUpMenuPositioningItem:` 在主线程进入菜单跟踪会话(NSMenuTrackingSession startRunningMenuEventLoop),**阻塞后续 GUI dispatch** 直到用户点击/关闭——产品语义正确(用户会点),但程序化流程须把 popup 放最后;spike 已按此排布
- insert 用 `autorelease pool` 包裹 + NSUInteger 显式 cast;wire:at → m->x
- 验证:hello 68 项/FULL_OK/EXIT 0(`MENU_DYNAMIC_OK:Second` 含 predefined copy 项 + item_info 真值回读 + remove);58 单测绿

## 81. ztron.conf.json 声明式多窗口 + schema 校验

- **ProjectConfigFile**(core):identifier/appName/version/csp/windows[];窗口项对齐 Tauri WindowConfig 可落地面(label/title/width/height/x/y/min-max 尺寸/resizable/maximizable/minimizable/closable/maximized/fullscreen/visible/decorations/alwaysOnTop/alwaysOnBottom/transparent/skipTaskbar/contentProtected/center/titleBarStyle/theme/url/html)
- **url: "frontend" 占位符**:fromConfig 第二参 `frontendUrl` 把声明窗口接到 dev server/构建产物;backend 侧无 dev server 时由用户代码回落(注入 inline html)
- **校验(双层)**:CLI 读取时 fail-fast + core `validateProjectConfig`(label 字符集 `[a-zA-Z0-9_-]+`、重复 label、width/height/x/y 非负)——Tauri 同款约束
- **启动态应用**:`App.run()` 创建声明窗口后统一走 `#applyStartupWindowState`(flag→windowState、center、min/max 尺寸、titleBarStyle、theme、x/y);maximized 用 `maximize`(非 toggle)
- **管线**:CLI `readProjectConfig` → `ZTRON_CONF` 环境变量(JSON)→ backend `AppBuilder.fromConfig(JSON.parse(...), {frontendUrl})`;`ztron init` 脚手架模板同步升级
- 验证:hello conf 声明 main(frontend url + minWidth) + conf-second(alwaysOnTop + 定位 + inline html)→ `CONF_WINDOW_OK:From Config`(api 侧读回启动态并 destroy);69 项/FULL_OK/EXIT 0;59 单测(fromConfig 默认值/重复 label/非法字符/负宽 4 断言组)

## 82. TrayIcon 类 + setVisible/template 图标

- **host 2 op**:`tray_set_visible`(`NSStatusItem setVisible:` 10.12+,隐藏时保留 item 可复显——优于 removeStatusItem+重建)、`tray_set_icon_template`(对**当前** button image `setTemplate:` + `setNeedsDisplay:` 即时刷新;button retain 同一 NSImage 实例,标记持续到下次 setImage)
- **core**:TrayOp 扩 `set_visible/set_icon_template` + `plugin:tray|set_visible|set_icon_as_template` 命令;**ACL 重复注册防御**:duplicate permission 现在显式报错(顺带清掉 P8 遗留的 set_menu 双注册)
- **api**:`TrayIcon` 类(create/setTitle/setTooltip/setIcon/setMenu/setVisible/setIconAsTemplate/onClick/destroy)对齐 Tauri 类形态;函数式 API 保留为薄层
- 验证:hello `TRAY_CLASS_OK`(类创建 + template 往返 + visible 往返 + destroy),70 项/FULL_OK/EXIT 0

## 83. fs.watch(FSEvents 端到端)

- **实现**:core `plugin:fs|watch/unwatch`——PathScope 校验后 `tjs.watch`(libuv FSEvents/kqueue/inotify 封装)→ 事件经 **Channel 流**推前端(与 m3:stream 同管线;事件 `{type:"modify"|"rename", path}`;txiki 的 `rename` 涵盖 create/delete/move,对齐 Tauri WatchEventKind 粗分类)
- **watcher 注册表**:插件工厂闭包内 Map(id→FileWatcher),unwatch 显式 close;id 由 api 层生成(`fs-watch-<ts>-<rand>`)
- **api**:`fs.watch(path, handler)` → 返回 unwatch 闭包;`fs.WatchEvent` 类型
- **覆盖账本**:watch/unwatch 归 INTEGRATION_ONLY(需真实 tjs.watch,Node 侧无实现)
- 验证:hello `FS_WATCH_OK:modify`(watch→arm→writeText v2→FSEvents 事件回流→unwatch),71 项/FULL_OK/EXIT 0

## 84. dmg 打包 + 可签名 Mach-O launcher(修复打包签名链)

- **dmg**:`hdiutil create -format UDZO` + 拖拽布局(staging: .app + /Applications symlink),默认产出 `dist/<App>.dmg`(ZTRON_NO_DMG=1 关闭);挂载/结构实测通过
- **签名链修复(核心)**:原 shell 脚本作 CFBundleExecutable → app 为 "generic" 格式,**codesign strict validation 永远失败**(整个 app 实际未签名——M0 以来隐性存在)。两层修复:
  1. **launcher 换 Mach-O**:`native/host/launcher_macos.c`(posix_spawn host→轮询 .host.log 的 PORT=→spawn backend→wait→kill),invokeKey 经 -D 编译期烘焙;cc 缺失时回落 shell 脚本
  2. **ztron-backend 移入 Resources**:tjs compile 产物(linker-signed adhoc)对独立重签也报 strict validation(连 /tmp 副本都过不了——产物固有特性);Resources 内嵌套二进制**不在 app 主签名链内**,验证即通过。launcher 从 Resources spawn
- 顺序:内层(ztron-host/launcher/dylib)→ app 外层;`--deep` 弃用(对 tjs 产物必失败)
- 验证:`codesign --verify` exit 0;实跑安装副本:launcher→host→Resources/ztron-backend 三层进程全起、干净退出;hello 71 项/FULL_OK/EXIT 0 零回归;59 单测绿

## 85. shell 交互式命令(spawn/stdin/kill)

- **core 3 命令**:`spawn_stream`(返回 cid;插件闭包注册表 cid→tjs Process;stdin pipe;退出时发 `tauri://shell-terminated {cid,code}` 并自清)、`write_stdin`(writer.write + releaseLock)、`kill`(默认 SIGTERM 15)
- **api**:`Command.spawnInteractive()`(先挂 stdout/stderr/terminated 监听再 spawn——**顺序关键**,漏监听会丢早期 chunk)、`write(cid,data)`、`kill(cid,sig?)`、`on("terminated")`
- **tjs 类型修正**:tjs-global spawn 声明补 `stdin/pid`(txiki Process 实际有;旧声明缺)——execute_stream 顺带获得 stdin pipe
- 验证:hello `SHELL_INTERACTIVE_OK:echo-me-back`(spawn cat → write_stdin → stdout 回流 → SIGKILL),72 项/FULL_OK/EXIT 0;59 单测绿

## 86. fs 二进制 IO + http timeout

- **fs**:`plugin:fs|read_file`(→`{base64}`)/`write_file`(base64→bytes)——wire 上 base64(JSON 安全);core 侧 chunked btoa/atob(0x8000 步进防栈溢);api `readFile`→Uint8Array / `writeFile`(接受 bytes 或现成 base64 串)
- **http**:`timeoutMs` 选项经 `AbortSignal.timeout`(txiki 原生支持)
- 验证:hello `FS_BINARY_OK:15b`(PNG 魔数 + 混合字节写入→读回逐字节相等),73 项/FULL_OK/EXIT 0
