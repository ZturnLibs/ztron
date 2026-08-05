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

| 阶段   | 内容                                                      | 验收                    |
| ------ | --------------------------------------------------------- | ----------------------- |
| **M0** | ⚡Spike:FFI 跑通 `hello` + Plan A 宿主双进程               | 同步+异步往返,exit=0    |
| **M1** | events + Channel 流式 + 窗口命令集 ✅                      | `M1_EVENTS_CHANNEL_WINDOW_OK` |
| **M2** | 插件基座 + 受限能力层 + CLI dev ✅                        | `M2_FS_SCOPE_PATH_OK`(scope 允/拒) |
| **M3** | `@ztron/api` 与打包器前端集成(Vite)✅                     | `M3_API_FRONTEND_OK`    |
| **M4** | `tjs compile` 单文件打包 + 三平台验证                     | 产出可分发二进制        |

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
| 组件 | 位置 | 说明 |
|---|---|---|
| `ztron-host` 原生宿主 | `native/host/host.c` | webview + socket 线程 + `webview_dispatch` 回 GUI;消息类型:request/response/eval/create_window/set_html/navigate/set_title/set_size/quit |
| socket 适配层 | `packages/runtime-ffi/src/host.ts` | `HostRuntime`/`HostWebviewHandle`,实现与 FFI 相同的 `RuntimeAdapter` 契约;`run()` 返回 closed promise |
| CLI 双进程编排 | `packages/cli/src/index.ts` | 起 host → 读 `PORT=` → spawn tjs + `ZTRON_HOST_PORT` |
| 构建脚本 | `scripts/build-native.sh` | + 编译 ztron-host(rpath 指向同目录 dylib) |
| 示例 | `examples/hello/src/main.ts` | `HostRuntime` + 真·异步命令(`setTimeout`) |

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
