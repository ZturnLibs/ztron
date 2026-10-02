# @zturnlibs/tjs-types

TypeScript types for the `tjs` (txiki.js) runtime that Ztron apps run on.

## Where the types come from

Everything except `src/web-globals.d.ts` is the **official**
[`@txikijs/types`](https://github.com/saghul/txiki.js/tree/master/types),
synced from the vendored checkout Ztron actually builds
(`native/txiki.js/types/src`) — not from the npm-published package, which can
lag the runtime we ship. After updating `native/txiki.js`, re-run:

```sh
scripts/sync-tjs-types.sh
```

## Usage

In a project whose `src` runs inside tjs (the Ztron "backend"):

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "types": ["node", "@zturnlibs/tjs-types"]
  }
}
```

Do **not** hand-write `declare const tjs: ...` — this package is the single
source of truth, and its declarations carry the real txiki API shapes
(`tjs.readDir` returns an async-iterable `DirHandle`, `tjs.serve` returns a
`Server`, `tjs.stat` returns the full `StatResult`, ...).

### `@zturnlibs/tjs-types/web`

The official declarations assume the web platform globals (`Response`,
`TextEncoder`, `fetch`, ...) come from your compilation (`lib: DOM` or
`@types/node`). Pure-ES2022 compilations without node/DOM types — such as
`@zturnlibs/ztron-core` itself — additionally reference:

```ts
/// <reference types="@zturnlibs/tjs-types/web" />
```

Only opt into this when you have no other provider for those globals;
otherwise you risk conflicting ambient declarations.

## Versioning

The package version tracks the Ztron release train; the vendored txiki.js
commit it was synced from is recorded in the sync script output and git
history of `src/`.
