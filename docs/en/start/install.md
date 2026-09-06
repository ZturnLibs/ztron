---
title: Prerequisites & Installation
---

# Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| macOS | Apple Silicon (verified) | Intel unverified, you can try it; Windows/Linux only have a host skeleton, not yet usable |
| Node.js | ≥ 20 | |

# Step 1: Install the CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

The install automatically brings the **prebuilt native chain** matching your
platform (the `tjs` runtime + the `ztron-host` native window host + the
webview dynamic library, ~2MB) — no repo clone, no compilation, no
environment variables.

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

Only needed when you want to modify the native layer, or when the prebuilt
package is unavailable. Extra prerequisites: pnpm 9 and Xcode Command Line
Tools (they compile txiki.js + ztron-host + the webview library).

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
