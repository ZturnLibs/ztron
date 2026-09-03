---
title: Updater (updater)
---

# Overview

The `updater` module implements **self-update**: check the manifest →
download → integrity verification → relaunch the app. It mirrors the
`plugin:updater|*` commands (a translation of Tauri's
`tauri-plugin-updater`) and implements the G3 security chain (GAP.md
D1): SemVer-precedence version gating + sha256 integrity + minisign
signature verification (a configured `pubkey` means **fail-closed** —
a missing or mismatched signature never lands). The update manifest is
JSON:
`{ version, notes?, platforms: { darwin: { url, sha256?, signature? } } }`,
where `signature` is the minisign `.minisig` text over the artifact
file contents.

```ts
import { check, download, verify, verifySignature, install, downloadAndInstall, updater } from "@zturnlibs/ztron-api/updater";
```

# Permissions & Scope

updater is a **standalone plugin**: register `updaterPlugin(...)` and
add permissions to the capability:

| Permission | Grants |
| --- | --- |
| `updater:default` | `check` + `download` + `verify` + `verify_signature` (**not** the two install commands) |
| `updater:allow-install` | `plugin:updater|install` (one-shot update application) |
| `updater:allow-install-stream` | `plugin:updater|install_stream` (streaming download+install) |

From `examples/hello/capabilities/main.json`:
`"updater:default"`.

The scope comes from plugin construction — `updaterPlugin` embeds an
HttpScope that constrains **both manifest fetches and artifact
downloads**. From `examples/hello/src/main.ts`:

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

Other construction options: `manifestUrl` (manifest address, overridable
per call) and `pubkey` (minisign public key file text; when set,
`install` verifies the artifact's signature and fails closed on a
missing or mismatched one).

# Example

The hello spike exercises the updater **host-side** (a local manifest
server + sha256 verification); the frontend reads the result through a
custom command. From `examples/hello/frontend/src/main.ts` (the anchor
`UPDATER_OK` is its real run output; comments kept, excerpts elided;
`m3:updater-test` is the spike's test command, not the updater API
itself):

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

API usage example (adapted from the signatures in
`packages/api/src/updater.ts`) — `install` is the one-shot chain:
check → download → the sha256 AND minisign gates → relaunch via
`plugin:process|relaunch`; a verification failure aborts **before**
the relaunch, so a corrupt artifact never replaces the running app;
with no newer version in the manifest it returns
`{ ok: false, reason: "no-update" }`:

```ts
import { check, install, downloadAndInstall } from "@zturnlibs/ztron-api/updater";

const status = await check();               // { hasUpdate, currentVersion, latestVersion?, artifactUrl?, sha256?, signature? }
if (status.hasUpdate) {
  const r = await install();                // { ok: true, bytes, path } | { ok: false, reason: "no-update" }
}

// Streaming variant (Tauri downloadAndInstall parity): Started → Progress×N → Finished
const done = await downloadAndInstall((ev) => {
  if (ev.event === "Started") console.log("total", ev.data?.contentLength);
  else if (ev.event === "Progress") console.log("+", ev.data.chunkLength);
});
```

Standalone tooling functions: `download(url, destination)` returns
`{ bytes, path }`; `verify(file, sha256)` returns `{ ok, actual }`;
`verifySignature(data, signature, pubkey)` exposes the updater's
minisign gate to tooling (inline data, no filesystem), carrying
`error: "format" | "keyid-mismatch" | "message-signature" |
"global-signature"` on failure.

# Commands

`plugin:updater|*` totals **6 commands**, mapped one-to-one to the API:

| Command | API |
| --- | --- |
| `check` | `check(url?)` |
| `download` | `download(url, destination)` |
| `verify` | `verify(file, sha256)` |
| `verify_signature` | `verifySignature(data, signature, pubkey, opts?)` |
| `install_stream` | `downloadAndInstall(onEvent, url?)` (progress over a Channel) |
| `install` | `install(url?)` (one-shot check→download→verify→relaunch) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/updater).

Applicable version: `ztron 0.3.0`
