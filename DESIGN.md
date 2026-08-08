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
