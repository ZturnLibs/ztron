---
title: Network (network)
---

# Overview

The `network` module queries the machine's network egress:
`getLocalIpv4()` (primary interface IPv4), `getLocalIpv6()` (primary
interface IPv6), `getPublicIp()` (public IPv4, `null` when offline or the
service is unreachable). All three are plain command invocations backed by
`plugin:network|*` (a port of `tauri-plugin-network`).

```ts
import { network } from "@zturnlibs/ztron-api/network";
// or from the main entry: import { network, getNetworkIpv4, getLocalIpv6, getPublicIp } from "@zturnlibs/ztron-api";
```

> The main entry re-exports `network.getLocalIpv4` under the name
> **`getNetworkIpv4`** to avoid clashing with the `local-ip` module's
> `getLocalIpv4`; the `@zturnlibs/ztron-api/network` subpath keeps the
> original name.

# Permissions & Scope

Permissions: `network:allow-get-local-ipv4`,
`network:allow-get-local-ipv6`, `network:allow-get-public-ip`; collected
in the **`network:default`** set. No scope — the plugin is constructed
with no arguments. From `examples/hello/src/main.ts`:

```ts
.plugin(networkPlugin())
```

The matching capability entry is `"network:default"`.

# Example

From `examples/hello/frontend/src/main.ts` (the anchor `NETWORK_OK` is
its real run output; IPv4 is asserted deterministically, IPv6/public are
recorded as best-effort info):

```ts
// 1e2. network (ipv4 deterministic; ipv6/public best-effort info)
const net4 = await getNetworkIpv4();
const net6 = await getLocalIpv6();
const pub = await getPublicIp();
if (net4) {
  report("NETWORK_OK:" + net4 + ":" + (net6 ?? "none") + ":" + (pub ?? "none"));
}
```

All three functions resolve `string | null` — they never throw on network
issues, they hand back `null` instead, so callers should treat the values
as optional.

# Commands

`plugin:network|*` totals **3 commands**:

| Command | API |
| --- | --- |
| `get_local_ipv4` | `getLocalIpv4()` |
| `get_local_ipv6` | `getLocalIpv6()` |
| `get_public_ip` | `getPublicIp()` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/network).

Applicable version: `ztron 0.3.0`
