---
title: Quick Start
---

# Running hello (10 minutes)

Prerequisite: complete [Prerequisites & Installation](/start/install) (both the native chain and workspace packages built).

```bash
cd examples/hello
node ../../packages/cli/dist/index.js dev
```

What `dev` does: it first builds the frontend with Vite, then launches `ztron-host` (the native window) and starts the tjs backend connection; success is the native window appearing.

Regression run (parses the checks reported by the app; exits 0 only on `FULL_OK` + 0 FAIL):

```bash
node ../../packages/cli/dist/index.js check
```

`check` prints statistics over all checks — the hello example reports `86 checks passed (FULL_OK)`. It also supports `--expect TAGS` to pin required tags and `--timeout ms` to bound the duration.

# Bundling the App

```bash
node ../../packages/cli/dist/index.js build
```

Produces a standalone executable and a `.app` (ad-hoc signed).

# Creating Your Own Project (inside the monorepo)

```bash
node packages/cli/dist/index.js init my-app   # scaffolds src/main.ts + frontend/
cd my-app
node ../packages/cli/dist/index.js dev --entry src/main.ts
node ../packages/cli/dist/index.js codegen    # typed invoke bindings for your commands
```

`init` scaffolds `src/main.ts` and `frontend/`; `codegen` generates typed invoke bindings for your commands. Note: for now new projects must live inside the monorepo (`@ztron/*` resolves via `workspace:`), see [Prerequisites & Installation](/start/install). Command details are in the [CLI Reference](/reference/cli).

适用版本：`ztron 0.1.0`
