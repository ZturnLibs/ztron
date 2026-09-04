---
title: 文件上传（upload）
---

# 概述

`upload` 模块把一个本地文件的内容以**原始 POST** 上传到目标 URL，返回
`UploadResult`（`{ status, ok, body }`，`body` 截断到 512 字符）。由单条
`plugin:upload|upload` 命令支撑（对齐 `tauri-plugin-upload` 的简化移植：
暂无 multipart 与进度回调）。导出名是 `uploader`（主入口同时以
`upload` 裸函数导出）。

```ts
import { uploader, upload } from "@zturnlibs/ztron-api/upload";
// 或从主入口：import { uploader, upload } from "@zturnlibs/ztron-api";
```

# 权限与 Scope

权限：`upload:allow-upload`，权限集 **`upload:default`**。

Scope 是**必填**的插件构造参数，双向受限——文件路径走 PathScope、目标
URL 走 HttpScope，越界分别被两者拒绝（URL 侧抛
`upload: url scope denied`，文件侧抛 PathScope 的
`access denied: … is outside the configured scope`）。摘自
`examples/hello/src/main.ts`：

```ts
.plugin(
  uploadPlugin({
    fileScope: { allow: ["$TMP/**"] },
    urlScope: { allow: [{ url: "http://localhost:*/*" }] },
  }),
)
```

capability 中对应条目为 `"upload:default"`。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（锚点 `UPLOAD_OK` 为其真实
运行输出；向本地 echo 服务上传并校验往返内容，注释保留、有删节）：

```ts
// 1f. upload: POST a file to the local echo server and verify the round trip
await fs.writeText("$TMP/ztron_upload.txt", "upload-payload-77");
const port = await invoke<number>("m3:echo-port", {});
const up = await uploader.upload(
  `http://localhost:${port}/echo`,
  "$TMP/ztron_upload.txt",
);
if (up.ok && up.body.includes("upload-payload-77")) {
  report("UPLOAD_OK:" + up.status + ":" + up.body.slice(0, 16));
}
```

注意路径参数直接写 `$TMP/...`——作用域变量由后端 PathScope 解析，与 fs
模块同一套约定。

# 命令一览

`plugin:upload|*` 共 **1 条**：

| 命令 | API |
| --- | --- |
| `upload` | `upload(url, file)` |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/upload)。

适用版本：`ztron 0.3.1`
