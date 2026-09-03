---
title: Clipboard (clipboard)
---

# Overview

The `clipboard` module reads and writes the **system clipboard**:
plain text, the HTML flavor, PNG images, and one-call clear. It mirrors
the `plugin:clipboard|*` commands. Images travel as **raw PNG bytes**
(since P24 they ride the raw IPC response — the injected invoke already
unwraps the backend envelope into a `Uint8Array`, no frontend decoding
needed). One deliberate divergence from Tauri v2: `readImage` returns
the bytes directly instead of an `Image` object — wrap with
`Image.fromBytes` when you need a registered image.

```ts
import { readText, writeText, readImage, writeImage, readHtml, writeHtml, clear, clipboard } from "@zturnlibs/ztron-api/clipboard";
```

# Permissions & Scope

clipboard consists of **framework built-in commands**: the 7
`plugin:clipboard|*` commands are registered into the permission table
with the other built-in commands and granted by the `core:default`
set. No plugin construction, no scope.

# Example

Text round trip (the special-characters payload guards the
`zt_reply_string` JSON escaping). From
`examples/hello/frontend/src/main.ts` (the anchors `CLIPBOARD_OK` and
`CLIPBOARD_BIG_OK` are its real run outputs; comments kept, excerpts
elided):

```ts
// 5j. clipboard — round trip special chars (guards zt_reply_string JSON
// escaping: newline/quote/backslash would otherwise break the wire)
const clipText = 'line1\n"quoted"\\back';
await writeClipboardText(clipText);
const clip = await readClipboardText();
```

Images and clear (PNG-byte round trip + null `readImage` after
clearing; P22). From the same file (the anchors `CLIPBOARD_IMG_OK`,
`CLIPBOARD_CLEAR_OK` are its real run outputs; comments kept, excerpts
elided):

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

The HTML flavor (a real pasteboard round trip through the
`public.html` type; writes carry a plain-text fallback, P27; the anchor
`CLIPBOARD_HTML_OK` is its real run output; comments kept, excerpts
elided):

```ts
// 17. clipboard HTML flavor: real pasteboard round trip through the
//    public.html type (deterministic; unlike modal dialogs).
const htmlIn = "<b>ztron-html</b>";
await writeClipboardHtml(htmlIn);
const htmlOut = await readClipboardHtml();
```

Note the naming: the top-level convenience exports are
`readClipboardText`/`writeClipboardText`/`readClipboardImage`/
`writeClipboardImage`/`readClipboardHtml`/`writeClipboardHtml`/
`clearClipboard` (what the hello frontend uses); the `clipboard`
namespace object only aggregates `readText`/`writeText`/`readImage`/
`writeImage`/`clear` — the HTML functions exist only as top-level
exports.

# Commands

`plugin:clipboard|*` totals **7 commands**, mapped one-to-one to the
API:

| Command | API |
| --- | --- |
| `read_text` / `write_text` | `readText` / `writeText` |
| `read_image` / `write_image` | `readImage` / `writeImage` (PNG bytes; an `Image` instance is re-encoded host-side) |
| `read_html` / `write_html` | `readHtml` / `writeHtml` |
| `clear` | `clear` (text, images and files) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/clipboard).

Applicable version: `ztron 0.3.0`
