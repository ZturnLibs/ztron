---
title: Encrypted Vault (stronghold)
---

# Overview

The `stronghold` module provides an **encrypted persistent KV vault**
(GAP E2), mirroring `plugin:stronghold|*`. Upstream Tauri rides the
Rust IOTA-stronghold; Ztron delivers the documented **pure-TS
rewrite**: `scrypt(password, salt)` derives the key, ChaCha20-Poly1305
AEAD encrypts the whole snapshot, and the file layout is
`"ZTSH1" | salt(16) | N,r,p u32le | nonce(12) | ciphertext | tag(16)`.
A wrong password or tampered ciphertext fails closed at the Poly1305
tag; the crypto primitives are cross-checked against `node:crypto` in
`tests/unit/stronghold.test.ts`.

The API has two layers: the 11 path-keyed functions of the
`stronghold` namespace, and the `Stronghold` class (bound path,
password held for the session — the spirit of the upstream Stronghold
object).

```ts
import { stronghold, Stronghold, load } from "@zturnlibs/ztron-api/stronghold";
import type { StrongholdStatus } from "@zturnlibs/ztron-api/stronghold";
```

# Permissions & Scope

The plugin is constructed with `strongholdPlugin(options)`:
`path` (the default file when `load` omits the path, default
`${tjs.tmpDir}/stronghold.bin`) and `params` (the scrypt cost
`{ n, r, p }`, default the libsodium-ish "moderate" n=2^14, r=8, p=1 —
16 MiB, ~0.5s). The snapshot file path itself does not go through a
`PathScope` (the encrypted container is the boundary); each loaded
vault's password is kept in process memory (source comment verbatim:
a TS runtime holds process memory equally, as upstream's keyring
does).

Permissions: 11 `stronghold:allow-*` entries (load/get/set/has/
remove/keys/clear/save/save_to/close/reload, one-to-one), aggregated
into the `stronghold:default` set ("Encrypted vault lifecycle
(load/save/close + kv)"). The hello example does **not** register this
plugin and its capability does not declare it — honestly stated: its
verification source is the E2 unit-test cross-check plus fail-closed
testing, not a hello spike anchor (there is no STRONGHOLD anchor in
the README).

# Example

Not covered by hello; the following are signature-level examples
(aligned verbatim with `packages/api/src/stronghold.ts`):

```ts
// Class surface: load (a missing file means a fresh vault) → read/write →
// save → close (flushes if dirty and forgets the password).
// Paths are passed to the backend as-is (no base-dir expansion); absolute is safest.
const vault = await Stronghold.load("/tmp/vault.bin", "correct horse");
await vault.set("token", { secret: "s3cret" });
const token = await vault.get<{ secret: string }>("token");
await vault.saveTo("/tmp/vault-backup.bin"); // the original file is untouched
const st = await vault.close();              // { closed: true }

// Function surface (operates on the same files as the class surface)
await stronghold.load("/tmp/vault.bin", "correct horse");
const keys = await stronghold.keys("/tmp/vault.bin");
await stronghold.reload("/tmp/vault.bin", "correct horse"); // drops unsaved state, reopens from disk
```

The write operations return `StrongholdStatus` (a subset of
`entries?` / `path?` / `saved?` / `closed?` / `reloaded?`). A `get`
after `close` is rejected with `stronghold: not loaded`; a wrong
password or corrupted snapshot throws
`stronghold: wrong password or corrupted snapshot` at load time.

# Commands

`plugin:stronghold|*` totals **11 commands**:

| Command | API |
| --- | --- |
| `load` | `stronghold.load` / `Stronghold.load` (returns `{ path, entries }`) |
| `get` / `set` | `stronghold.get` / `stronghold.set` (same-named instance methods) |
| `has` / `remove` / `keys` / `clear` | same-named (`stronghold.*` and instance methods) |
| `save` | `stronghold.save` (seals the snapshot to disk) |
| `save_to` | `stronghold.saveTo` (seals to another path; the original is untouched) |
| `close` | `stronghold.close` (flushes if dirty, unloads, forgets the password) |
| `reload` | `stronghold.reload` (drops unsaved state, reopens from disk) |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/stronghold).

Applicable version: `ztron 0.3.0`
