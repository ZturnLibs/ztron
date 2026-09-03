---
title: 应用更新（updater）
---

# 概述

`updater` 模块实现**自更新**：检查清单 → 下载 → 完整性校验 → 重启
应用。它镜像 `plugin:updater|*` 命令（Tauri `tauri-plugin-updater`
的翻译版），并实现 G3 安全链（GAP.md D1）：SemVer 优先级版本门槛 +
sha256 完整性校验 + minisign 签名校验（配置了 `pubkey` 即**失败关闭
**——签名缺失或不匹配都不落地）。更新清单是 JSON：
`{ version, notes?, platforms: { darwin: { url, sha256?, signature? } } }`，
`signature` 是对产物文件内容的 minisign `.minisig` 文本。

```ts
import { check, download, verify, verifySignature, install, downloadAndInstall, updater } from "@zturnlibs/ztron-api/updater";
```

# 权限与 Scope

updater 是**独立插件**，需要注册 `updaterPlugin(...)` 并在 capability
里加权限：

| 权限 | 授予内容 |
| --- | --- |
| `updater:default` | `check` + `download` + `verify` + `verify_signature`（**不含** install 两条） |
| `updater:allow-install` | `plugin:updater|install`（一次性应用更新） |
| `updater:allow-install-stream` | `plugin:updater|install_stream`（流式下载安装） |

摘自 `examples/hello/capabilities/main.json`：`"updater:default"`。

Scope 来自插件构造——`updaterPlugin` 内置一个 HttpScope，同时约束
**清单获取与产物下载**两类请求。摘自
`examples/hello/src/main.ts`：

```ts
.plugin(
  updaterPlugin({
    currentVersion: "0.1.0",
    scope: {
      allow: [
        { url: "http://localhost:*/*" },
        { url: "https://httpbin.org/*" },
        { url: "https://api.github.com/*" },
      ],
    },
  }),
)
```

其他构造参数：`manifestUrl`（清单地址，可被每次调用覆盖）、`pubkey`
（minisign 公钥文件文本；设置后 `install` 校验产物签名，缺失或
不匹配一律失败关闭）。

# 示例

hello spike 的更新器测试在**宿主侧**执行（本地清单服务器 + sha256
校验），前端经一条自定义命令读取结果。摘自
`examples/hello/frontend/src/main.ts`（锚点 `UPDATER_OK` 为其真实
运行输出，注释保留、有删节；`m3:updater-test` 是 spike 的测试命令，
不是 updater API 本身）：

```ts
// 5g. updater (local manifest server + sha256 verify)
const up = await invoke<{ hasUpdate: boolean; verifyOk: boolean }>(
  "m3:updater-test",
  {},
);
if (up.hasUpdate && up.verifyOk) {
  report("UPDATER_OK");
}
```

API 用法示例（基于 `packages/api/src/updater.ts` 的签名改写）——
`install` 是一次性链路：check → download → sha256 与 minisign 双重
校验 → 经 `plugin:process|relaunch` 重启；校验失败在重启**之前**
中止，损坏的产物永远不会替换正在运行的应用；清单没有更新版本时
返回 `{ ok: false, reason: "no-update" }`：

```ts
import { check, install, downloadAndInstall } from "@zturnlibs/ztron-api/updater";

const status = await check();               // { hasUpdate, currentVersion, latestVersion?, artifactUrl?, sha256?, signature? }
if (status.hasUpdate) {
  const r = await install();                // { ok: true, bytes, path } | { ok: false, reason: "no-update" }
}

// 流式变体（Tauri downloadAndInstall 对位）：Started → Progress×N → Finished
const done = await downloadAndInstall((ev) => {
  if (ev.event === "Started") console.log("total", ev.data?.contentLength);
  else if (ev.event === "Progress") console.log("+", ev.data.chunkLength);
});
```

独立工具函数：`download(url, destination)` 返回
`{ bytes, path }`；`verify(file, sha256)` 返回
`{ ok, actual }`；`verifySignature(data, signature, pubkey)` 把
minisign 校验门暴露给工具链（inline 数据、不落盘），失败时带
`error: "format" | "keyid-mismatch" | "message-signature" |
"global-signature"`。

# 命令一览

`plugin:updater|*` 共 **6 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `check` | `check(url?)` |
| `download` | `download(url, destination)` |
| `verify` | `verify(file, sha256)` |
| `verify_signature` | `verifySignature(data, signature, pubkey, opts?)` |
| `install_stream` | `downloadAndInstall(onEvent, url?)`（Channel 推送进度） |
| `install` | `install(url?)`（一次性 check→download→校验→重启） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/updater)。

适用版本：`ztron 0.3.0`
