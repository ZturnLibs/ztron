---
title: Bundling & Distribution
---

`ztron build` produces distributable artifacts: `.app` and `.dmg` on macOS;
a flat app directory plus NSIS and MSI installers (with optional
Authenticode signing) on Windows. This page follows the actual `buildApp`
flow in `packages/cli/src/index.ts`.

## What ztron build Does

Four steps in order (from `buildApp`/`packMacApp` in
`packages/cli/src/index.ts`):

1. **Frontend build**: vite builds `frontend/` into `dist/` with
   `base: "./"` and IIFE output, rewriting `<script type="module">` into
   classic scripts (under `file://` module scripts fail CORS due to the
   null origin); a CSP `<meta>` is then injected per config (the built-in
   DEFAULT_CSP by default). The invoke key is baked into the page by the
   ztron vite plugin.
2. **Backend bundling**: esbuild bundles the entry (default `src/main.ts`)
   into `.ztron/app.mjs` (externalizing `tjs:*`, inline sourcemap).
3. **Backend compilation**: `tjs compile` produces the standalone
   `ztron-backend` executable.
4. **.app assembly**: writes `Contents/Info.plist`, copies the host and the
   webview dylib, compiles the Mach-O launcher on the fly, copies the
   frontend artifacts and icon, then codesigns (see below).

Outside macOS, the Windows branch (`packWindowsApp`) assembles a flat
`dist/<appName>/` directory: `ztron-launcher.exe` (MSVC-compiled
GUI-subsystem executable; falls back to `ztron-launcher.cmd` without MSVC),
`ztron-host.exe`, the WebView2 loader library, `ffi-8.dll`, the
tjs-compiled `ztron-backend.exe`, `frontend/` and the staged
conf/capabilities — everything side by side, since the host resolves
`webview.dll` and the backend resolves `ffi-8.dll` from its own directory.
Linux still only produces a `dist/<appName>/` directory layout.

## The .app Layout

```text
ZtronApp.app/
  Contents/
    Info.plist            CFBundleExecutable = ztron (launcher)
    MacOS/                ztron (Mach-O launcher), ztron-host, libwebview*.dylib
    Resources/            ztron-backend, frontend/, AppIcon.icns
```

Two deliberate choices, quoted from `packages/cli/src/index.ts` (the P17
signing-chain fix):

> NOTE: it goes to RESOURCES, not MacOS — tjs-compiled binaries fail
> codesign strict validation, and a nested resource binary stays outside
> the app's main signature chain (the launcher spawns it from there).

That is, `ztron-backend` lives in `Resources/`, not `MacOS/`: tjs-compiled
binaries fail codesign strict validation, and as a resource file they stay
outside the main signature chain. The main executable is a Mach-O launcher
compiled on the fly from `native/host/launcher_macos.c` (invoke key baked
in) — a shell script as CFBundleExecutable cannot pass codesign. The
launcher starts `ztron-host` (reads its `PORT=`) and then
`Resources/ztron-backend`.

## DMG

After the `.app`, `dist/<appName>.dmg` is produced by default
(`ZTRON_NO_DMG=1` opts out): a staging folder holds the `.app` plus a
symlink to `/Applications` (the classic drag-to-install layout), and the
image is created with `hdiutil create -format UDZO` (zlib compression);
the volume name is the app name.

## Windows Installers (NSIS / MSI)

With `bundle.targets` containing `nsis` and/or `msi`, `packWindowsApp`
hands the flat directory to the matching packer:

- **NSIS** (`packNsisDir`): emits a complete `.nsi` (per-user install,
  Start-menu + desktop shortcuts to the launcher, uninstaller, Add/Remove
  Programs entry with the bundle icon) and runs `makensis` when found
  (`ZTRON_MAKENSIS` overrides; `where makensis` and the standard
  `Program Files` locations are probed). The script is written UTF-8 with
  a BOM so CJK product names survive.
- **MSI** (`packMsiDir`): emits a complete `.wxs` (per-user install to
  `%LOCALAPPDATA%`, recursive component tree, shortcuts, HKCU
  Add/Remove-Programs entry) and runs `candle + light` when found
  (`ZTRON_WIX` points at a WiX v3 binaries directory; WiX v4's single
  `wix build` is not handled). The UpgradeCode is derived
  deterministically from the bundle identifier, so upgrades replace files
  in place across versions without extra config.

When the toolchain is absent the packer still writes the
script/definition ready to run and reports `built:false` with the exact
reason instead of failing silently.

## bundle.* Configuration

For the full field table see the [Config Reference](/reference/config).
Directly build-relevant:

| Field | Effect |
| --- | --- |
| `bundle.active` | whether the bundling step is enabled (declarative field; the current build flow does not read this switch and always bundles) |
| `bundle.targets` | extra bundle targets: `"all"` or `nsis/msi/appimage/deb/rpm` (array or comma-separated string) |
| `bundle.icon` | PNG path, consumed by the portable packers (the `.app`'s AppIcon.icns currently comes from the CLI's own `assets/app-icon.png`; on Windows an `.ico` entry feeds the NSIS/MSI installer icons) |
| `bundle.resources` | additional files shipped with the package |

The Linux entries in `targets` are emitted as the control files/scripts
the real toolchain consumes (AppDir, `DEBIAN/`, `.spec`); on Windows the
`nsis`/`msi` packers run the real toolchain when present, as described
above. Note that hello's `ztron.conf.json` currently has no `bundle`
section — without it, build still produces `.app` + `.dmg` (macOS) or the
flat directory (Windows); `targets` only controls additional artifacts.
The `.app` name comes from `appName` (default `ZtronApp`, stripped of
whitespace/unusual characters); the packers' productName is
`productName ?? appName`.

## Signing Status

- **macOS ad-hoc signing: automatic.** When `ZTRON_SIGN_IDENTITY` is unset
  the identity is `-`: `MacOS/ztron-host` is signed first, then the whole
  bundle — the artifact runs on the same machine without Gatekeeper
  prompts.
- **Developer ID signing & notarization: NOT done.** The code path
  (`macSignAndNotarize`, env vars `ZTRON_SIGN_IDENTITY` /
  `ZTRON_NOTARY_APPLE_ID` / `ZTRON_NOTARY_TEAM_ID`) exists but has not
  been exercised against a real Apple developer identity. Distributing to
  other machines still requires you to perform Developer ID signing and
  notarization yourself.
- **Windows Authenticode: supported.** After NSIS/MSI packing,
  `signWinArtifact` signs the installer with `signtool` when a
  certificate is configured: `ZTRON_SIGN_PFX` (+ `ZTRON_SIGN_PASSWORD`)
  or a certificate-store SHA1 thumbprint via `ZTRON_SIGN_THUMBPRINT`;
  `ZTRON_SIGN_TS_URL` adds an RFC3161 timestamp. `signtool` is located
  via `ZTRON_SIGNTOOL`, `where signtool`, or the Windows Kits tree.
  Without a certificate the artifact ships unsigned and the exact reason
  is reported.

适用版本：`ztron 0.3.12`
