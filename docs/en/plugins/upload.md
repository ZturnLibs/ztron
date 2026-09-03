---
title: Upload (upload)
---

# Overview

The `upload` module POSTs a local file's contents **as a raw body** to a
target URL and resolves with an `UploadResult` (`{ status, ok, body }`,
`body` truncated to 512 characters). Backed by the single
`plugin:upload|upload` command (a simplified port of
`tauri-plugin-upload`: no multipart or progress callbacks yet). The
namespace export is `uploader` (the main entry also exports the bare
`upload` function).

```ts
import { uploader, upload } from "@zturnlibs/ztron-api/upload";
// or from the main entry: import { uploader, upload } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permission: `upload:allow-upload`, collected in the **`upload:default`**
set.

The scope is a **required** plugin construction option, checked on both
ends — file paths go through a PathScope and the target URL through an
HttpScope; violations are rejected by each respectively (the URL side
throws `upload: url scope denied`, the file side PathScope's
`access denied: … is outside the configured scope`). From
`examples/hello/src/main.ts`:

```ts
.plugin(
  uploadPlugin({
    fileScope: { allow: ["$TMP/**"] },
    urlScope: { allow: [{ url: "http://localhost:*/*" }] },
  }),
)
```

The matching capability entry is `"upload:default"`.

# Example

From `examples/hello/frontend/src/main.ts` (the anchor `UPLOAD_OK` is its
real run output; uploads to the local echo server and verifies the round
trip, comments kept, excerpts elided):

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

Note the path argument is written as `$TMP/...` — scope variables are
resolved by the backend's PathScope, the same convention as the fs
module.

# Commands

`plugin:upload|*` totals **1 command**:

| Command | API |
| --- | --- |
| `upload` | `upload(url, file)` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/upload).

Applicable version: `ztron 0.3.0`
