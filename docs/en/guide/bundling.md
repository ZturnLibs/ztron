---
title: Bundling & Distribution
---

`ztron build` produces distributable artifacts: `.app` and `.dmg` on macOS,
control-file/manifest skeletons for the other platforms' real toolchains.
This page follows the actual `buildApp` flow in
`packages/cli/src/index.ts`.

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

Outside macOS (Linux/Windows) only a directory layout is produced today:
`dist/<appName>/` on Linux, while the Windows branch currently hardcodes
`dist/ZtronApp/` (regardless of `appName`) — either way it contains
`ztron-host` + the webview library + `frontend/`.

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

## bundle.* Configuration

For the full field table see the [Config Reference](/reference/config).
Directly build-relevant:

| Field | Effect |
| --- | --- |
| `bundle.active` | whether the bundling step is enabled (declarative field; the current build flow does not read this switch and always bundles) |
| `bundle.targets` | extra bundle targets: `"all"` or `nsis/msi/appimage/deb/rpm` (array or comma-separated string) |
| `bundle.icon` | PNG path, consumed by the portable packers (the `.app`'s AppIcon.icns currently comes from the CLI's own `assets/app-icon.png`) |
| `bundle.resources` | additional files shipped with the package |

The Windows/Linux entries in `targets` are emitted by each packer as the
control files/scripts the real toolchain consumes (`.nsi`, `.wxs`, AppDir,
`DEBIAN/`, `.spec`); when the toolchain is absent on this machine the
packer reports `built:false` with the exact reason instead of failing
silently. Note that hello's `ztron.conf.json` currently has no `bundle`
section — without it, build still produces `.app` + `.dmg`; `targets` only
controls additional artifacts. The `.app` name comes from `appName`
(default `ZtronApp`, stripped of whitespace/unusual characters); the
packers' productName is `productName ?? appName`.

## Signing Status

- **Ad-hoc signing: automatic.** When `ZTRON_SIGN_IDENTITY` is unset the
  identity is `-`: `MacOS/ztron-host` is signed first, then the whole
  bundle — the artifact runs on the same machine without Gatekeeper
  prompts.
- **Developer ID signing & notarization: NOT done.** The code path
  (`macSignAndNotarize`, env vars `ZTRON_SIGN_IDENTITY` /
  `ZTRON_NOTARY_APPLE_ID` / `ZTRON_NOTARY_TEAM_ID`) exists but has not
  been exercised against a real Apple developer identity; the repo README's
  Remaining section honestly lists "Developer ID signing / notarization"
  (see <https://github.com/ZturnLibs/ztron#readme>). Distributing to other
  machines still requires you to perform Developer ID signing and
  notarization yourself.

适用版本：`ztron 0.3.1`
