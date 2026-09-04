---
title: Deep Link (deep-link)
---

# Overview

The `deep-link` module handles **custom URL scheme deep links** (a
port of `tauri-plugin-deep-link`): when the outside world opens the
app with a `ztron://...` URL, a running page receives the full URL,
and the app can query the most recent one.

Unlike most plugins, `plugin:deep-link|get_last_url` is a **framework
built-in command** (registered in `registerBuiltinCommands`): the host
adapter captures the OS deep-link open event → the App emits the
`ztron://deep-link` event. The API is two functions: `getCurrentUrl()`
(the most recent URL, `null` when the app was launched normally) and
`onDeepLink(handler)` (subscribes to deep links opened while the app
is running; the handler receives the full URL).

```ts
import { deepLink, getCurrentUrl, onDeepLink } from "@zturnlibs/ztron-api/deep-link";
```

# Permissions & Scope

`plugin:deep-link|get_last_url` is registered with the other built-in
commands and granted by the `core:default` set (there is no separate
`deep-link:*` permission); the event-listening commands that
`onDeepLink` relies on are also part of `core:default`. No plugin
construction, no scope.

The prerequisite for real routing: a **packaged `.app`** must
register the scheme in `CFBundleURLTypes`. The dev bare binary cannot
claim a scheme with the OS — hello honestly verifies the plumbing
only; see below.

# Example

**Registering the listener early** is the key deep-link practice: an
externally opened URL is then captured at any point during the run.
From `examples/hello/frontend/src/main.ts` (the `DEEP_LINK_EVENT`
anchor is its real run convention; comment kept):

```ts
// Register the deep-link listener early so an externally-opened ztron://
// URL (packaged .app, registered via CFBundleURLTypes) is captured at any
// point during the run.
await onDeepLink((url) => {
  if (url.includes("spike")) report("DEEP_LINK_EVENT:" + url);
});
```

Plumbing verification (`get_last_url` is `null` on a normal launch).
From the same file (the anchor `DEEP_LINK_OK` is its real run output;
comments kept, excerpt elided):

```ts
// 12. deep-link: command plumbing. OS routing of ztron:// needs a bundle
// registered with CFBundleURLTypes (the packaged .app); ...
const lastUrl = await invoke<string | null>(
  "plugin:deep-link|get_last_url",
  {},
);
if (lastUrl === null) {
  report("DEEP_LINK_OK");
}
```

# Commands

`plugin:deep-link|*` totals **1 command**:

| Command | API |
| --- | --- |
| `get_last_url` | `getCurrentUrl` (`deepLink.getCurrentUrl`) |

Event surface: `ztron://deep-link` ← `onDeepLink`
(`deepLink.onDeepLink`).

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/deep-link).

Applicable version: `ztron 0.3.1`
