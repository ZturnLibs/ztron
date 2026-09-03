---
title: 图像（image）
---

# 概述

`image` 模块提供原生图像的注册与引用：图像在 host 侧注册后以
registry id（`rid`）传递，供 `tray.setIcon`、`window.setIcon` 等
接受图标的 API 使用，是 `@tauri-apps/api/image` 的移植。

```ts
import { Image, transformImage } from "@zturnlibs/ztron-api/image";
```

- `Image.fromPath(path)`：从文件路径加载。
- `Image.fromBytes(bytes)`：从原始字节（PNG 等编码数据）加载。
- `Image.fromRGBA(rgba, width, height)`（上游别名 `Image.new`）：
  从 RGBA 像素数据构建。
- `img.rgba()` / `img.size()`：仅 `fromRGBA`/`new` 构建的图像携带
  像素；path/PNG 加载的图像在 C 层解码落地前 resolve 为
  `undefined`/`null`（GAP.md B11）。
- `img.close()`：释放 host 侧图像。
- `ImageLike`：图标类 API 接受的联合类型——路径字符串 / `Image` /
  原始字节（`Uint8Array`、`ArrayBuffer`、`number[]`）/ `null`。
- `transformImage(icon)`：把任一 `ImageLike` 归一化为 wire 形状
  （路径原样、`Image` 变 rid、原始字节先注册再给 id）。
- `toBase64` / `fromBase64`：分块编解码，服务大载荷。

# 权限与 Scope

image 属于框架内建能力，其 `plugin:image|*` 命令由 capability 中的
**`core:default`** 权限集授权；细粒度可用
`core:allow-image_<命令下划线名>`（如 `core:allow-image_from_path`）。
无 scope 约束。

# 示例

摘自 `examples/hello/frontend/src/main.ts`（验证锚点 `IMAGE_OK`、
`TRANSFORM_IMAGE_OK`）：

```ts
import { Image } from "@zturnlibs/ztron-api";

const img = await Image.fromPath(`${temp}/ztron_tray_icon.png`);
await setTrayIcon(img);      // 传 Image 句柄
await img.close();           // 用完释放

const png = await Image.fromBytes([0x89, 0x50, 0x4e, 0x47, /* PNG 头… */]);
await setTrayIcon(png);
await png.close();

// 原始字节直接传给图标 API：transformImage 自动注册 + 应用（host 侧解码）
await setTrayIcon([0x89, 0x50, 0x4e, 0x47, /* … */]);
```

# 命令一览

`plugin:image|*` 共 **5 条**：`from_path`、`from_bytes`、`rgba`、
`size`、`destroy`。完整清单见 [命令参考](/reference/commands)。

适用版本：`ztron 0.3.0`
