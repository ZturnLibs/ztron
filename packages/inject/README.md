# @zturnlibs/ztron-inject

WebView bootstrap for [Ztron](https://github.com/ZturnLibs/ztron): the script embedded into every page that provides the `window.__TAURI_INTERNALS__`-compatible bridge the frontend API ([`@zturnlibs/ztron-api`](https://www.npmjs.com/package/@zturnlibs/ztron-api)) communicates through.

This is what makes the API port a drop-in replacement: pages talk the same internals protocol shape Tauri frontends expect, but the transport underneath is Ztron's host ⇄ txiki.js socket bridge.

## When you'd touch this

Never directly — it's an internal dependency of the CLI (which injects it into dev pages) and the packaging pipeline (which embeds it into production HTML). Listed on npm for transparency and version pinning.

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
