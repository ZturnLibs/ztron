# @zturnlibs/ztron-darwin-arm64

Prebuilt native chain for [Ztron](https://github.com/ZturnLibs/ztron) on macOS Apple Silicon: the `ztron-host` binary (system WebView + window/tray/menu/dialog), the txiki.js (`tjs`) runtime, and libwebview.

## Do not install this directly

It is consumed automatically as an `optionalDependency` of [`@zturnlibs/ztron-cli`](https://www.npmjs.com/package/@zturnlibs/ztron-cli), gated by `os`/`cpu` fields so it only installs on darwin/arm64. Install the CLI instead:

```sh
npm install -g @zturnlibs/ztron-cli
```

The existence of this package is the point: end users never compile anything — no Xcode toolchain dance, no checkout, no environment variables. Other platforms ship as their own `@zturnlibs/ztron-<os>-<arch>` packages as their chains reach prebuilt status (Windows: [`@zturnlibs/ztron-win32-x64`](https://www.npmjs.com/package/@zturnlibs/ztron-win32-x64); Linux pending, see the [roadmap](https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md)).

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
