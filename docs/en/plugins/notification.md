---
title: Notifications (notification)
---

# Overview

The `notification` module sends **system-level notifications** and
manages notification authorization. It is a port of Tauri's
`tauri-plugin-notification`, backed by the built-in
`plugin:notification|*` commands. The macOS side goes through
UNUserNotificationCenter (rewritten in P22: macOS 11 removed
NSUserNotificationCenter, so the old path was a silent no-op), and the
permission prompt is a **result-carrying** C block call.

```ts
import { sendNotification, isPermissionGranted, requestPermission, notification } from "@zturnlibs/ztron-api/notification";
```

# Permissions & Scope

notification consists of **framework built-in commands**:
`plugin:notification|send`, `is_permission_granted` and
`request_permission` are registered into the permission table with the
other built-in commands and granted by the `core:default` set. No
plugin construction, no scope. Note that **OS-level authorization** is
a different thing from capability authorization: even when the
capability allows it, the first `requestPermission()` still triggers
the system's authorization prompt.

# Example

Sending resolves as soon as the call returns (delivery itself is up to
the OS). From `examples/hello/frontend/src/main.ts` (the anchor
`NOTIFICATION_OK` is its real run output):

```ts
// 6d. notification (send resolves; delivery is OS-level)
await sendNotification({ title: "Ztron", body: "hello-notification" });
report("NOTIFICATION_OK");
```

The permission flow (from the same file): check the grant first, then
request if missing; permission completions arrive on a WebKit queue,
so the spike races them with a timeout to keep an unanswered OS prompt
in the dev binary from hanging the whole run (anchor
`NOTIF_PERM_OK:<bool>`):

```ts
// Permission completions arrive on a WebKit queue; race with a timeout
// so a stuck UNUserNotificationCenter (e.g. an unanswered OS prompt in
// the dev binary) cannot hang the run.
const granted = await Promise.race([
  isPermissionGranted(),
  new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
]);
let permState = String(granted);
if (!granted) {
  permState = String(
    await Promise.race([
      requestPermission(),
      new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
    ]),
  );
}
report("NOTIF_PERM_OK:" + permState);
```

P22 records the dev bare-binary degradation: `NOTIF_PERM_OK:false`
(authorization is unavailable without a bundle identity); a packaged
.app gets real UN notifications.

# Commands

`plugin:notification|*` totals **3 commands**, mapped one-to-one to
the API:

| Command | API |
| --- | --- |
| `send` | `sendNotification` |
| `is_permission_granted` | `isPermissionGranted` |
| `request_permission` | `requestPermission` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/notification).

Applicable version: `ztron 0.3.1`
