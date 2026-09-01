---
title: Security Model
---

Ztron follows Tauri v2's ACL (access control list) model: **deny by
default** — every command the frontend may call and every path/URL it may
access must be explicitly granted in a capability.

## Capability Files

`capabilities/*.json` are auto-loaded at app startup (default directory
`./capabilities`). Head of `examples/hello/capabilities/main.json`:

```json
{
  "identifier": "main",
  "description": "Main window: core + path + fs + http + os + store + log + shell.",
  "windows": [
    "main"
  ],
  "permissions": [
    "core:default",
    "path:default",
    "fs:write-default",
    "fs:allow-copy",
    "fs:allow-rename",
    "fs:allow-stat",
    "fs:allow-make-dir",
    "http:default",
    "os:default",
    "store:write",
    "log:default",
    "shell:default",
    "updater:default",
    "sql:default",
    "autostart:default",
    "window-state:write",
    "single-instance:default",
    "websocket:default",
    "local-ip:default",
    "network:default",
    "upload:default",
    "persisted-scope:default",
    "fs:allow-watch",
    "fs:allow-read-file",
    "fs:allow-write-file"
  ]
}
```

`identifier` is the capability's name, `windows` declares which window labels
it grants, and `permissions` is the list of permission strings.

## Permission String Format

Permission strings uniformly take the two-segment `plugin:permission` form —
the plugin (or `core`) name plus a specific permission. For example,
`fs:allow-read-file` grants only the fs plugin's readFile command;
`core:default` is the default set of core commands. Calls to commands not
listed are rejected by the backend even if that plugin's handler is
registered (verification anchor `ACL_DENY_OK`).

## Scope: Three Constraint Models

Beyond permissions, plugins involving files/network also have scope
constraints, all from hello's `src/main.ts`:

- **PathScope** (fs/store/sql, etc.): path glob patterns.
  `fsPlugin({ scope: psScope })`, with the persisted baseline `scope: { allow: ["$TMP/**"] }`
  — only the temp directory and its subtree are allowed.
- **HttpScope** (http/updater): URL patterns.
  `httpPlugin({ scope: { allow: [{ url: "https://api.github.com/*" }, { url: "http://localhost:*/*" }] } })`.
  Out-of-scope URLs are rejected outright (verification anchor
  `HTTP_SCOPE_DENY_OK`).
- **store scope**: the store plugin also has its own path allowlist.
  `storePlugin({ scope: { allow: ["$TMP/**"] } })`.

## CSP

The production CSP is configured via `app.security.csp` and injected into
pages by the framework; the dev environment can be configured separately with
`devCsp`, so that the dev server's loose policy never reaches production. The
legacy top-level `csp` key still works, but migrating to `app.security.csp`
is recommended.

适用版本：`ztron 0.1.0`
