---
title: CLI (cli)
---

# Overview

The `cli` module parses the command-line arguments the app was launched
with (a port of `@tauri-apps/plugin-cli`'s JS bindings): `getArgv()`
returns the raw argv (including the `argv[0]` executable), and
`getMatches()` returns the schema-parsed `CliMatches` — flags to values
(dashed names become camelCase, numbers auto-coerced), bare positionals
collected under `_`, and subcommands forming a recursive tree
(`{ name, matches }`). Backed by the two `plugin:cli|*` commands.

```ts
import { getMatches, getArgv } from "@zturnlibs/ztron-api/cli";
// or from the main entry: import { getMatches, getArgv } from "@zturnlibs/ztron-api";
```

# Permissions & Scope

Permissions: `cli:allow-get-argv`, `cli:allow-get-matches`; the
**`cli:default`** set grants both. No scope.

Parsing behavior is driven by the plugin construction options:
`cliPlugin({ schema? | subcommands?, booleans? })` — `schema` is the
upstream clap-shaped declarative description
(`{ description?, args?, subcommands? }`); with no schema the parse falls
back to fully lenient legacy rules. The hello example does not register
this plugin; registration (shaped after
`packages/core/src/plugins/cli.ts`) looks like:

```ts
import { cliPlugin } from "@zturnlibs/ztron-core";

const cli = cliPlugin({
  schema: {
    description: "my app",
    args: [{ name: "verbose", short: "v", takesValue: false }],
    subcommands: [{ name: "serve", args: [{ name: "port", takesValue: true }] }],
  },
});
```

# Example

The hello frontend does not use this module — the following is minimal
usage against the schema above, at the API-signature level (not run code
from the example app):

```ts
// Process args: myapp --verbose serve --port 8080
const argv = await getArgv();
// ["myapp", "--verbose", "serve", "--port", "8080"] (argv[0] included)

const m = await getMatches();    // argv[0] is stripped before parsing
m.args.verbose;                  // true — root flags land in the root matches
m.subcommand;
// { name: "serve", matches: { args: { port: 8080 }, subcommand: null } }
m.subcommand!.matches.args.port; // 8080 — numbers auto-coerced
// Bare positionals not consumed by flags/subcommands collect under
// args._ (a string array; everything after `--` lands there too)
```

# Commands

`plugin:cli|*` totals **2 commands**:

| Command | API |
| --- | --- |
| `get_argv` | `getArgv()` |
| `get_matches` | `getMatches()` |

Full list in the [Commands Reference](/reference/commands) and the
[API symbol reference](/reference/api/cli).

Applicable version: `ztron 0.3.0`
