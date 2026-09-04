---
title: Autostart (autostart)
---

# Overview

The `autostart` module makes the app **launch at login**, translated
from `tauri-plugin-autostart` (simplified). The API is tiny:
`enableAutostart` / `disableAutostart` / `isAutostartEnabled` plus the
`autostart` namespace (`enable`/`disable`/`isEnabled`). Per-platform
implementation:

- **macOS**: writes a `~/Library/LaunchAgents/<id>.plist`
  (`RunAtLoad`);
- **Linux**: writes `~/.config/autostart/<id>.desktop`;
- **Windows**: sets `HKCU\...\CurrentVersion\Run` via `reg.exe`.

```ts
import { autostart, enableAutostart, isAutostartEnabled } from "@zturnlibs/ztron-api/autostart";
```

# Permissions & Scope

The plugin is constructed with `autostartPlugin(options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `id` | `"ztron"` | name of the launch file / registry key (prefer a reverse-domain identifier) |
| `exec` | current executable (`tjs.exePath`) | the command to launch at login; for packaged apps set the `.app`/binary path explicitly |

Three permissions `autostart:allow-enable` /
`autostart:allow-disable` / `autostart:allow-is-enabled`, aggregated
into the `autostart:default` set; the hello example declares
`autostart:default`. No scope concept (it writes to the fixed
platform autostart locations).

# Example

Backend registration. From `examples/hello/src/main.ts` (comment
kept):

```ts
.plugin(autostartPlugin({ id: "com.ztron.hello" }))
```

The frontend's full round trip: query → enable → re-check → disable.
From `examples/hello/frontend/src/main.ts` (the anchor `AUTOSTART_OK`
is its real run output; comments kept, excerpt elided):

```ts
// 5i. autostart
const wasEnabled = await isAutostartEnabled();
await enableAutostart();
const nowEnabled = await isAutostartEnabled();
await disableAutostart();
if (nowEnabled && !wasEnabled) {
  report("AUTOSTART_OK");
}
```

# Commands

`plugin:autostart|*` totals **3 commands**:

| Command | API |
| --- | --- |
| `enable` | `enableAutostart` (`autostart.enable`) |
| `disable` | `disableAutostart` (`autostart.disable`) |
| `is_enabled` | `isAutostartEnabled` (`autostart.isEnabled`) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/autostart).

Applicable version: `ztron 0.3.1`
