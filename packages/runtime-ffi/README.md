# @zturnlibs/ztron-runtime-ffi

Runtime bridge for [Ztron](https://github.com/ZturnLibs/ztron): `HostRuntime`, the socket adapter implementing the two-process model (native C host ⇄ txiki.js backend over a local socket with IPC key checks), plus reference `tjs:ffi` bindings to the [webview/webview](https://github.com/webview/webview) C API.

Two entry points:

- `@zturnlibs/ztron-runtime-ffi` — the FFI reference bindings
- `@zturnlibs/ztron-runtime-ffi/host` — `HostRuntime`, the backend-side transport adapter used when the app runs against the real native host instead of a mock

## When you'd touch this

Almost never in application code — the CLI's dev/build pipeline selects it automatically. It exists as a separate package so that:

- [`@zturnlibs/ztron-core`](https://www.npmjs.com/package/@zturnlibs/ztron-core) stays transport-agnostic (tests run on `MockRuntime`, dev/prod run on `HostRuntime`)
- alternative transports can be swapped in without forking the core

## Architecture

```
┌──────────────────────────┐  TCP/JSON  ┌───────────────────────────────────┐
│ ztron-host (native C)     │◄──────────►│ tjs backend (txiki.js)            │
│ system WebView + GUI loop │            │ HostRuntime (this package)        │
└──────────────────────────┘            └───────────────────────────────────┘
```

See [DESIGN.md](https://github.com/ZturnLibs/ztron/blob/main/DESIGN.md) for the full protocol and the decisions behind the two-process split.

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
