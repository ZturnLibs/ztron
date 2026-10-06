---
title: Prerequisites & Installation
---

# Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| macOS | Apple Silicon (verified) | prebuilt chain installs out of the box; Intel unverified, you can try it |
| Windows | Windows 10+ with the WebView2 Runtime | full host parity since v0.3.12 (22-item platform audit closed) + NSIS/MSI packaging + Authenticode; no platform package yet — build the native chain once from source (see the appendix) |
| Linux | — | host skeleton only, not yet usable |
| Node.js | ≥ 20 | |

# Step 1: Install the CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

On macOS the install automatically brings the **prebuilt native chain** (the
`tjs` runtime + the `ztron-host` native window host + the webview dynamic
library, ~2MB) — no repo clone, no compilation, no environment variables.

On Windows the CLI installs the same way, but the native chain is not yet
shipped as a platform package: build it once from source (appendix below),
then point the CLI at the outputs via `ZTRON_TJS` / `ZTRON_HOST_BIN` /
`ZTRON_WEBVIEW_LIB` (or keep the project inside the ztron clone, where the
CLI finds `native/libs/` automatically).

> The package is also published on GitHub Packages. If npmjs is unavailable,
> write `@zturnlibs:registry=https://npm.pkg.github.com` and
> `//npm.pkg.github.com/:_authToken=<your GitHub PAT>` into `~/.npmrc`,
> then install again.

# Step 2: Health Check

```bash
ztron doctor
```

When all five lines PASS and it prints `doctor: OK`, installation is done.
Every FAIL comes with a fix hint.

**Next: [Quick Start](/start/quick-start)**

# Appendix: Build the Native Chain from Source (contributors / fallback)

Only needed when you want to modify the native layer, when the prebuilt
package is unavailable, or on Windows. Extra prerequisites:

- **macOS**: pnpm 9 and Xcode Command Line Tools (they compile txiki.js +
  ztron-host + the webview library).
- **Windows**: pnpm 9, Visual Studio Build Tools (C++ workload), the
  Windows SDK, and libffi via vcpkg (`vcpkg install libffi:x64-windows`
  or the toolchain script in `scripts/`).

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # produces native/libs/{tjs,ztron-host,libwebview.dylib}
```

Point the CLI at it — either of:

- keep your project inside the ztron clone (the CLI walks up and finds
  `native/libs/` automatically); or
- put the following three lines into `~/.zshrc` (adjust the paths to where
  you cloned):

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```
