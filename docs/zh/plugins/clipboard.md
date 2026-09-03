---
title: 剪贴板（clipboard）
---

# 概述

`clipboard` 模块读写**系统剪贴板**：纯文本、HTML flavor、PNG 图像与
一键清空。它镜像 `plugin:clipboard|*` 命令。图像以**原始 PNG 字节**
传输（P24 起走原始 IPC 响应——注入的 invoke 已把后端信封解开成
`Uint8Array`，不再需要前端解码）。与 Tauri v2 的一个刻意的分歧：
`readImage` 直接返回字节而非 `Image` 对象，需要注册图像时用
`Image.fromBytes` 包一层。

```ts
import { readText, writeText, readImage, writeImage, readHtml, writeHtml, clear, clipboard } from "@zturnlibs/ztron-api/clipboard";
```

# 权限与 Scope

clipboard 属于**框架内建命令**：`plugin:clipboard|*` 的 7 条命令随
内建命令注册进权限表，由 `core:default` 集统一授予。不需要插件
构造、没有 scope。

# 示例

文本往返（特殊字符负载守护 `zt_reply_string` 的 JSON 转义）。
摘自 `examples/hello/frontend/src/main.ts`（锚点 `CLIPBOARD_OK`、
`CLIPBOARD_BIG_OK` 为其真实运行输出，注释保留、有删节）：

```ts
// 5j. clipboard — round trip special chars (guards zt_reply_string JSON
// escaping: newline/quote/backslash would otherwise break the wire)
const clipText = 'line1\n"quoted"\\back';
await writeClipboardText(clipText);
const clip = await readClipboardText();
```

图像与清空（PNG 字节往返 + 清空后 `readImage` 为 null；P22）。摘自
同文件（锚点 `CLIPBOARD_IMG_OK`、`CLIPBOARD_CLEAR_OK` 为其真实运行
输出，注释保留、有删节）：

```ts
await writeClipboardImage(pngFixture);
const clipImg = await readClipboardImage();
if (
  clipImg &&
  clipImg.length >= 8 &&
  clipImg[0] === 0x89 &&
  clipImg[1] === 0x50 &&
  clipImg[2] === 0x4e &&
  clipImg[3] === 0x47
) {
  report("CLIPBOARD_IMG_OK:" + clipImg.length);
}
await clearClipboard();
const clipCleared = await readClipboardImage();
if (clipCleared === null) {
  report("CLIPBOARD_CLEAR_OK");
}
```

HTML flavor（真实的 pasteboard 往返，`public.html` 类型；写入时带
纯文本回退，P27；锚点 `CLIPBOARD_HTML_OK` 为其真实运行输出，注释
保留、有删节）：

```ts
// 17. clipboard HTML flavor: real pasteboard round trip through the
//    public.html type (deterministic; unlike modal dialogs).
const htmlIn = "<b>ztron-html</b>";
await writeClipboardHtml(htmlIn);
const htmlOut = await readClipboardHtml();
```

注意：顶层便捷导出是 `readClipboardText`/`writeClipboardText`/
`readClipboardImage`/`writeClipboardImage`/`readClipboardHtml`/
`writeClipboardHtml`/`clearClipboard`（hello 前端即用这些）；
`clipboard` 命名空间对象只聚合了 `readText`/`writeText`/`readImage`/
`writeImage`/`clear` 五个方法，HTML 函数仅在顶层。

# 命令一览

`plugin:clipboard|*` 共 **7 条**，与 API 一一对应：

| 命令 | API |
| --- | --- |
| `read_text` / `write_text` | `readText` / `writeText` |
| `read_image` / `write_image` | `readImage` / `writeImage`（PNG 字节；`Image` 实例宿主侧重编码） |
| `read_html` / `write_html` | `readHtml` / `writeHtml` |
| `clear` | `clear`（文本、图像、文件全清） |

完整清单见[命令参考](/reference/commands)与 [API 符号参考](/reference/api/clipboard)。

适用版本：`ztron 0.3.0`
