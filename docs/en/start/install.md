---
title: Prerequisites & Installation
---

# Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| macOS | Apple Silicon (verified) | Intel unverified, you can try it; Windows/Linux only have a host skeleton, not yet usable |
| Node.js | ≥ 20 | |
| pnpm | 9 | used to build the native chain and the examples |
| Xcode Command Line Tools | required | compiles the native chain (txiki.js + ztron-host + webview lib) |

# Step 1: Install the CLI

```bash
npm i -g @zturnlibs/ztron-cli
```

> The package is also published on GitHub Packages. If npmjs is unavailable,
> write `@zturnlibs:registry=https://npm.pkg.github.com` and
> `//npm.pkg.github.com/:_authToken=<your GitHub PAT>` into `~/.npmrc`,
> then install again.

# Step 2: Get the Native Chain (one-time)

The native chain = the `tjs` runtime + `ztron-host` (the native window host) +
the webview dynamic library. It currently has to be compiled from source once
(a few minutes; only needed on the first run and after upstream changes):

```bash
git clone https://github.com/ZturnLibs/ztron.git ~/ztron
cd ~/ztron
pnpm install
scripts/build-native.sh                 # produces native/libs/{tjs,ztron-host,libwebview.dylib}
```

# Step 3: Point to the Native Chain

Put the following three lines into `~/.zshrc` (adjust the paths to where you
cloned):

```bash
export ZTRON_TJS=~/ztron/native/libs/tjs
export ZTRON_HOST_BIN=~/ztron/native/libs/ztron-host
export ZTRON_WEBVIEW_LIB=~/ztron/native/libs/libwebview.dylib
```

# Step 4: Health Check

```bash
ztron doctor
```

When all five lines PASS and it prints `doctor: OK`, installation is done.
Every FAIL comes with a fix hint.

**Next: [Quick Start](/start/quick-start)**
