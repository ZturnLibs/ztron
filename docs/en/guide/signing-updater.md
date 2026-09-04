---
title: Signing & the Updater
---

Self-update relies on two trust chains: the publisher signs artifacts with
a minisign secret key, and the app verifies them with the public key. This
page covers the `ztron signer` tool, the update manifest format,
`updaterPlugin` configuration, and the `install()` flow; for API details
see [App Updates](/plugins/updater).

## minisign Keys

`ztron signer` provides three subcommands (from
`packages/cli/src/signer.ts`):

```bash
ztron signer generate   # --pk-file (default minisign.pub) --sk-file (default minisign.key)
ztron signer sign <file> --secret-key <path> [--password pw]
ztron signer verify <file> --public-key <path>
```

- `generate` accepts `--comment` (public key comment, default
  `ztron signer public key`); when `--password` (or the
  `ZTRON_SIGNER_PASSWORD` env var) is given, the secret key is written in
  the minisign scrypt-encrypted format, in plaintext otherwise.
- `sign` writes `<file>.minisig` by default; `--output` renames it, and
  `--trusted-comment` / `--comment` customize the signature comments.
- `verify` reads `minisign.pub` and `<file>.minisig` by default; on
  success it prints `signature verified` (plus the trusted comment), on
  failure it exits 1.

The format is wire-exact with jedisct1/minisign (signatures produced here
verify under the real `minisign` tool and vice versa); same wording as the
[CLI Reference](/reference/cli).

## Update Manifest Format

The manifest is JSON; `platforms` maps a platform key to the artifact
(from the module docstring of
`packages/core/src/plugins/updater.ts`):

```json
{
  "version": "1.2.0",
  "notes": "…",
  "platforms": {
    "darwin": { "url": "https://…/app.dmg", "sha256": "…", "signature": "untrusted comment: …\nb64(sig)\ntrusted comment: …\nb64(global)\n" }
  }
}
```

The platform key is normalized from `navigator.platform` into
`darwin` / `windows` / `linux`; `signature` is the minisign `.minisig`
text over the artifact file contents. When
`ZTRON_UPDATER_KEYS=<pub>,<sk>` is set, `ztron build` signs the `.dmg`
(or `.app`) and emits `latest.json` + `.minisig` (the manifest url prefix
comes from `ZTRON_UPDATER_BASE`, default `http://localhost:8080`).

## Configuring updaterPlugin

From `examples/hello/src/main.ts`:

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

The built-in HttpScope constrains **both** manifest fetches and artifact
downloads; `manifestUrl` sets the manifest address (overridable per call);
filling `pubkey` with the minisign public key file text arms the signature
gate.

## The install() Flow

`install` is a one-shot chain: check → download → sha256 and minisign
dual verification → relaunch via `plugin:process|relaunch`. Key points:

- Verification failure aborts **before** the relaunch — a corrupt/replaced
  artifact never replaces the running app.
- A configured `pubkey` means **fail-closed**: a missing or mismatched
  `signature` in the manifest throws outright.
- When the manifest has no version above `currentVersion` (SemVer 2.0.0
  precedence), or lacks `artifactUrl` / `sha256`, it returns
  `{ ok: false, reason: "no-update" }`.
- The streaming variant `install_stream` (API name `downloadAndInstall`)
  pushes Started → Progress×N → Finished over a Channel and enforces the
  same dual gate before landing.

## Capability Tiers

Same wording as [App Updates](/plugins/updater): `updater:default`
includes `check` + `download` + `verify` + `verify_signature` (**not**
the two install permissions); `updater:allow-install` (one-shot install)
and `updater:allow-install-stream` (streaming install) must be granted
separately.

适用版本：`ztron 0.3.1`
