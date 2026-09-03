---
title: Mobile Plugins Overview (mobile)
---

# Overview

This page covers the five **mobile-oriented** plugins in one place:
`barcode-scanner`, `biometric`, `geolocation`, `haptics`, and `nfc`.
Their upstream counterparts (ML Kit / VisionKit / CoreMotion / NFC,
etc.) are **mobile-only**; Ztron ports the **command surface** in
place (GAP E3–E7, the G12 mobile plugin stubs) so the API shape aligns
with upstream, but on desktop runtimes every command **fails closed
deterministically**: it throws `PluginUnavailable` (a message shaped
like
`plugin:<name>|<command> is unavailable on this platform (mobile-only
upstream surface; ported for parity)`).

This is deliberate: callers get a **documented, assertable
rejection** instead of a silent fake success. When a mobile host lands
(user-provided environment), real implementations backfill behind the
same command surface — each plugin's options already reserve a
`bridge` field as the hook for that future mobile host bridge. The
hello example does not register these five plugins, so this page has
no spike anchor (stated honestly).

```ts
import { scanBarcode } from "@zturnlibs/ztron-api/barcode-scanner";
import { authenticate, biometricStatus } from "@zturnlibs/ztron-api/biometric";
import { getCurrentPosition, watchPosition, clearWatch } from "@zturnlibs/ztron-api/geolocation";
import { impactOccurred, notificationOccurred, selectionChanged } from "@zturnlibs/ztron-api/haptics";
import { nfcScan, nfcWrite, nfcStop } from "@zturnlibs/ztron-api/nfc";
```

# Permissions & Scope

Each of the five plugins registers `<plugin>:allow-<command>`
permissions alongside its commands, aggregated into a
`<plugin>:default` set (described uniformly as "Command surface
parity; fails closed off-platform."). No scope. Note: a granted
permission only means the command is **reachable**; on a desktop
runtime the command body still throws `PluginUnavailable` — an
authorization grant and platform capability are different things.
Also recorded in GAP E4: a real macOS Touch ID implementation
(LAContext) for `biometric` remains an optional upgrade; it is not
implemented today.

# Example

Not covered by hello; the following are signature-level examples
(aligned verbatim with `packages/api/src/*.ts`) demonstrating the
actual shape of "surface in place, rejected on desktop":

```ts
import { scanBarcode } from "@zturnlibs/ztron-api/barcode-scanner";

try {
  const value = await scanBarcode(); // desktop: the Promise rejects (PluginUnavailable)
} catch (e) {
  // e.message: plugin:barcode-scanner|scan is unavailable on this platform
  //            (mobile-only upstream surface; ported for parity)
}

// The remaining functions share the shape: optional args?: Record<string, unknown>
await biometricStatus();        // → { available: boolean } (on a mobile host only)
await getCurrentPosition();     // → { coords: { latitude, longitude, accuracy } }
const wid = await watchPosition(); // → watch id (string)
await clearWatch();             // stop watching
await impactOccurred();         // haptics trio: impact / notification / selection
await nfcScan();                // → tag contents (string)
```

# Commands

The five plugins total **12 commands**, all stub status
(off-platform fail-closed):

| Plugin | Commands | API |
| --- | --- | --- |
| `barcode-scanner` | `scan` | `scanBarcode` |
| `biometric` | `authenticate` / `status` | `authenticate` / `biometricStatus` |
| `geolocation` | `get_current_position` / `watch_position` / `clear_watch` | `getCurrentPosition` / `watchPosition` / `clearWatch` |
| `haptics` | `impact_occurred` / `notification_occurred` / `selection_changed` | `impactOccurred` / `notificationOccurred` / `selectionChanged` |
| `nfc` | `scan` / `write` / `stop` | `nfcScan` / `nfcWrite` / `nfcStop` |

Full list in the [Commands Reference](/reference/commands) and the
per-module [API symbol reference](/reference/api) (barcode-scanner /
biometric / geolocation / haptics / nfc).

Applicable version: `ztron 0.3.0`
