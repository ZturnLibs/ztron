# @zturnlibs/ztron-win32-x64

Prebuilt native chain for [Ztron](https://github.com/ZturnLibs/ztron) on Windows x64: the `ztron-host` binary (WebView2 + window/tray/menu/dialog), the txiki.js (`tjs`) runtime, the patched `webview.dll`, and the libffi runtime DLL (`ffi-8.dll`) `tjs.exe` loads at startup.

## Do not install this directly

It is consumed automatically as an `optionalDependency` of [`@zturnlibs/ztron-cli`](https://www.npmjs.com/package/@zturnlibs/ztron-cli), gated by `os`/`cpu` fields so it only installs on win32/x64. Install the CLI instead:

```sh
npm install -g @zturnlibs/ztron-cli
```

No MSVC, no vcpkg, no environment variables — the same out-of-the-box experience the CLI already has on macOS. Linux ships as its own `@zturnlibs/ztron-<os>-<arch>` package when its chain reaches prebuilt status (see the [roadmap](https://github.com/ZturnLibs/ztron/blob/main/ROADMAP.md)).

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
