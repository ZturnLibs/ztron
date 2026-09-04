---
title: Local IP (local-ip)
---

# Overview

The `local-ip` module does one thing: it returns the primary interface's
IPv4 address, `getLocalIpv4()` (`string | null`, `null` when unknown or
offline). Backed by the single `plugin:local-ip|get` command (a port of
`tauri-plugin-local-ip`). It overlaps with [network](/plugins/network)'s
`getLocalIpv4()` — local-ip is the one-to-one port of the upstream
single-purpose plugin, while network bundles the v4/v6/public trio; pick
whichever fits.

```ts
import { localIp, getLocalIpv4 } from "@zturnlibs/ztron-api/local-ip";
// or from the main entry: import { localIp, getLocalIpv4 } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permission: `local-ip:allow-get`, collected in the
**`local-ip:default`** set. No scope — the plugin is constructed with no
arguments. From `examples/hello/src/main.ts`:

```ts
.plugin(localIpPlugin())
```

From `examples/hello/capabilities/main.json`:

```json
"local-ip:default"
```

# Example

From `examples/hello/frontend/src/main.ts` (the anchor `LOCAL_IP_OK` is
its real run output; asserted deterministically with an IPv4-shape
regex):

```ts
// 1e. local-ip (primary IPv4)
const localIp = await getLocalIpv4();
if (localIp && /^\d{1,3}(\.\d{1,3}){3}$/.test(localIp)) {
  report("LOCAL_IP_OK:" + localIp);
}
```

It resolves `null` instead of throwing: offline or with no determinable
primary interface the caller gets `null` and should treat it as optional
info.

# Commands

`plugin:local-ip|*` totals **1 command**:

| Command | API |
| --- | --- |
| `get` | `getLocalIpv4()` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/local-ip).

Applicable version: `ztron 0.3.1`
