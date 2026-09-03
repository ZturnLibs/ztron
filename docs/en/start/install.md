---
title: Prerequisites & Installation
---

# Prerequisites

| Dependency | Requirement | Notes |
| --- | --- | --- |
| macOS | Apple Silicon (verified) | Intel machines unverified; you can try, but please file an issue if you hit problems |
| Node.js | ≥ 20 | The docs workspace and some scripts target this version |
| pnpm | 9 | workspace resolution depends on pnpm |
| Xcode Command Line Tools | required | `scripts/build-native.sh` builds the native chain (tjs + ztron-host + webview lib) with the system compiler |

Windows/Linux currently only have a host skeleton (it compiles); they are not yet usable for development or bundling, and no release timeline is committed.

# Getting the Source & Installing Dependencies

```bash
git clone https://github.com/ZturnLibs/ztron.git
cd ztron
pnpm install
```

# Building the Native Chain

```bash
scripts/build-native.sh                 # builds tjs + ztron-host + webview lib (macOS)
```

The first build takes a while (it compiles txiki.js and the native host); afterwards you only need to re-run it when the relevant sources change.

# Building the Workspace Packages

```bash
pnpm build
```

This generates `packages/*/dist`; the CLI is usable afterwards (invoked as `node packages/cli/dist/index.js …`).

# Important Limitation: Monorepo-Only for Now

The `@zturnlibs/ztron-*` packages currently resolve via the `workspace:` protocol, so a new project scaffolded by `ztron init` must live inside this monorepo for dependencies to resolve. The publishing pipeline is ready (tag-push triggers `publish.yml`, publishing to GitHub Packages); this section will be updated once the limitation is lifted.

适用版本：`ztron 0.3.0`
