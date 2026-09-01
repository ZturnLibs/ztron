---
title: Configuring ztron.conf.json
---

`ztron.conf.json` is the project configuration file, validated by the CLI at
dev/build time in two layers (CLI fail-fast + core), and consumed via
`AppBuilder.fromConfig`. The hello example's full config:

```json
{
  "entry": "src/main.ts",
  "frontend": "frontend",
  "identifier": "com.ztron.hello",
  "version": "0.1.0",
  "windows": [
    {
      "label": "main",
      "title": "Ztron M3",
      "width": 900,
      "height": 640,
      "minWidth": 400,
      "minHeight": 300,
      "url": "frontend",
      "titleBarStyle": "visible",
      "resizable": true
    },
    {
      "label": "conf-second",
      "title": "From Config",
      "width": 360,
      "height": 240,
      "html": "<p style=\"font-family:system-ui\">declared in ztron.conf.json</p>",
      "resizable": false,
      "alwaysOnTop": true,
      "x": 120,
      "y": 120
    }
  ]
}
```

## Core Fields (P1 Subset)

Source: the `ProjectConfigFile` interface in `packages/core/src/app.ts`.

| Field | Description |
| --- | --- |
| `entry` | backend entry file |
| `frontend` | frontend directory |
| `identifier` | app identifier |
| `productName` | alias of `appName` (upstream naming) |
| `appName` | app name |
| `mainBinaryName` | main binary name |
| `version` | version number |
| `csp` | legacy top-level CSP; prefer `app.security.csp` (both work) |
| `capabilities` | legacy top-level capability list; prefer `app.security.capabilities` |
| `build.{devUrl,frontendDist,beforeDevCommand,beforeBuildCommand,beforeBundleCommand}` | build hooks and frontend dist directory |
| `app.{withGlobalTauri,macOSPrivateApi}` | global API injection switch, macOS private APIs |
| `app.security.csp` / `devCsp` | production/dev CSP (see [Security Model](/guide/security)) |
| `app.security.capabilities` | capability list (`string[] \| string`) |
| `app.security.assetProtocol.{scope,requireLiteralLeadingDot}` | asset protocol scope |
| `app.security.freezePrototype` | freeze prototypes, anti-tampering |
| `bundle.{active,targets,icon,resources,category,publisher,homepage,shortDescription,longDescription,copyright,license}` | bundling metadata |
| `plugins` | plugin configuration (`Record<string, unknown>`) |
| `windows[]` | declarative window startup state (see [Windows](/guide/window)) |

## Validation Behavior

`validateProjectConfig` (`packages/core/src/app.ts`): **warns on unknown
top-level keys** (keeps the value and prints `unknown top-level key "..."
(kept as-is)`); **throws on type/structure violations** — e.g. `build` not an
object, `build.devUrl` not a string, `app.withGlobalTauri` not a boolean all
abort directly with a `ztron.conf.json: ...` error.

Windows/Linux bundling targets are not yet provided; the fields on this page
all follow macOS behavior.

## What's Next

P2 plans to auto-generate a full configuration reference from the
`ProjectConfigFile` type; the field table on this page will then be
maintained by that generator.

适用版本：`ztron 0.1.0`
