---
title: Image（image）
---

# Overview

The `image` module registers and references native images: an image is
registered with the host and passed around by registry id (`rid`) to
icon-accepting APIs such as `tray.setIcon` and `window.setIcon` — a
port of `@tauri-apps/api/image`.

```ts
import { Image, transformImage } from "@zturnlibs/ztron-api/image";
```

- `Image.fromPath(path)`: loads from a file path.
- `Image.fromBytes(bytes)`: loads from raw bytes (PNG etc.).
- `Image.fromRGBA(rgba, width, height)` (upstream alias `Image.new`):
  builds from RGBA pixel data.
- `img.rgba()` / `img.size()`: only images built via `fromRGBA`/`new`
  carry pixels; path/PNG-loaded images resolve to `undefined`/`null`
  until the C-layer decode lands (GAP.md B11).
- `img.close()`: releases the host-side image.
- `ImageLike`: the union accepted by icon APIs — path string /
  `Image` / raw bytes (`Uint8Array`, `ArrayBuffer`, `number[]`) /
  `null`.
- `transformImage(icon)`: normalizes any `ImageLike` into the wire
  shape (path stays a path, `Image` becomes its rid, raw bytes are
  registered first and passed by id).
- `toBase64` / `fromBase64`: chunked codecs for large payloads.

# Permissions & Scope

image is a framework built-in: its `plugin:image|*` commands are granted
by the **`core:default`** permission set in a capability; individual
`core:allow-image_<underscored_cmd>` permissions (e.g.
`core:allow-image_from_path`) grant single commands. No scope.

# Example

Example (adapted from the tray-icon sections of
`examples/hello/frontend/src/main.ts`, PNG data elided; the anchors
`IMAGE_OK`, `TRANSFORM_IMAGE_OK` are its real run outputs):

```ts
import { Image } from "@zturnlibs/ztron-api";

const img = await Image.fromPath(`${temp}/ztron_tray_icon.png`);
await setTrayIcon(img);      // pass the Image handle
await img.close();           // release when done

const png = await Image.fromBytes([0x89, 0x50, 0x4e, 0x47, /* PNG header… */]);
await setTrayIcon(png);
await png.close();

// raw bytes passed straight to an icon API: transformImage registers + applies host-side
await setTrayIcon([0x89, 0x50, 0x4e, 0x47, /* … */]);
```

# Commands

`plugin:image|*` totals **5 commands**: `from_path`, `from_bytes`,
`rgba`, `size`, `destroy`. Full list in the
[Commands Reference](/reference/commands).

Applicable version: `ztron 0.3.1`
