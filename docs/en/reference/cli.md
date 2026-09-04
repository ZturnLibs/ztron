---
title: CLI Reference
---

The `ztron` CLI provides eight main commands — `init`/`doctor`/`dev`/
`build`/`codegen`/`check`/`signer`/`version` (plus the
`icon`/`info`/`add`/`migrate` utility commands, see the end). The command set
is defined by the dispatch switch in `packages/cli/src/index.ts` (the USAGE
strings do not yet cover codegen/signer).

```text
ztron init [dir]                  scaffold a new project in [dir] (default: current directory)
ztron doctor                      one-shot environment check for node/tjs/ztron-host/webview
ztron dev [--entry <file>]        build + run under the native host + tjs backend
ztron build [--entry <file>]      produce a standalone executable and .app
ztron codegen                     scan defineCommand, generate src/ztron-commands.ts typed bindings
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
                                  regression run: parse app-reported checks, exit 0 only on FULL_OK with 0 FAIL;
                                  --expect is a comma-separated list of required tags
ztron signer <sub> [--pk-file f] [--sk-file f]
                                  minisign-compatible key generation/signing/verification (generate and other subcommands;
                                  cross-verified with jedisct1/minisign)
ztron version                     print the version
```

## ztron init

```text
ztron init [dir]
```

Scaffolds a new project in the target directory (default: current
directory): generates the `src/main.ts` entry, the `frontend/` skeleton, and
`ztron.conf.json`.

```bash
node packages/cli/dist/index.js init my-app
```

## ztron doctor

```text
ztron doctor
```

One-shot environment check for node / tjs / ztron-host / the webview
library: prints `doctor: OK` and exits 0 when all checks pass; on any FAIL
it prints the per-check fix hints and exits 1.

```bash
node packages/cli/dist/index.js doctor
```

## ztron dev

```text
ztron dev [--entry <file>]
```

Builds the frontend (vite) and runs the app under the native host + tjs
backend; `--entry` defaults to `./src/main.ts`.

```bash
node ../packages/cli/dist/index.js dev --entry src/main.ts
```

## ztron build

```text
ztron build [--entry <file>]
```

Bundles the backend into a standalone executable with `tjs compile` and
produces a macOS `.app` (ad-hoc signed; `.dmg` also supported).

```bash
pnpm --filter @zturnlibs/ztron-example-hello build
```

## ztron codegen

Scans `defineCommand` declarations in all `.ts` files under `src/`, dedupes
by command name (last one wins), and generates the `src/ztron-commands.ts`
typed bindings for typed frontend calls like
`g.invoke("my:greet", {...})`.

```bash
node ../packages/cli/dist/index.js codegen
# [ztron] codegen: 3 command(s) -> src/ztron-commands.ts
```

## ztron check

```text
ztron check [--entry <file>] [--timeout <ms>] [--expect TAGS]
```

Regression run: starts the app through the full dev flow and parses the
checks it reports (hello-style `frontend reported` lines and bare `TAG_OK`
lines). It exits 0 only on reaching `FULL_OK` with 0 FAILs; the harness's
verdict covers the subprocess exit code. `--expect` takes a comma-separated
list of required tags; `--timeout` (milliseconds) bounds the total duration.

```bash
node packages/cli/dist/index.js check --expect SECOND_WINDOW_OK,STRESS_OK
```

## ztron signer

```text
ztron signer <sub> [--pk-file f] [--sk-file f]
```

minisign-compatible key generation/signing/verification, wire-level
cross-verified with jedisct1/minisign (signatures produced by this tool
verify with real `minisign`, and vice versa). The `generate` subcommand
additionally supports `--password` (or the `ZTRON_SIGNER_PASSWORD`
environment variable) to encrypt the private key with scrypt on write.

```bash
ztron signer generate
# signer: generated key pair
#   public key: minisign.pub
#   secret key: minisign.key
```

## ztron version

```bash
ztron version   # ztron 0.3.0
```

## Utility Commands

The switch also has: `ztron icon [input] [-o outDir]` (generate
icns/iconset/multi-size pngs), `ztron info` (print environment info),
`ztron add <plugin>` (add a plugin to the project), and `ztron migrate`
(migrate legacy configuration).

适用版本：`ztron 0.3.0`
