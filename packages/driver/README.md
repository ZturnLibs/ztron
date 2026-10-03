# @zturnlibs/ztron-driver

WebDriver intermediary for [Ztron](https://github.com/ZturnLibs/ztron) apps — the role [`tauri-driver`](https://docs.rs/tauri-driver) plays for Tauri: a W3C-protocol relay that lets standard WebDriver tooling drive a running Ztron application.

## Why

Ztron apps use the OS webview, which doesn't expose a WebDriver endpoint by itself. `ztron-driver` accepts a normal W3C WebDriver session (so WebDriverIO, selenium clients, and CI harnesses work unmodified) and translates it to the Ztron host surface.

## Usage

```sh
npm install -g @zturnlibs/ztron-driver
ztron-driver   # start the relay, then point your WebDriver client at it
```

Pair it with any WebDriver client pointed at the relay — the integration test layer of Ztron itself ([`tests/`](https://github.com/ZturnLibs/ztron/tree/main/tests)) drives real windows through this path, so it is exercised on every `ztron check` run.

## Status

Working on macOS (Apple Silicon). Platform coverage follows the [Ztron host](https://github.com/ZturnLibs/ztron#平台支持).

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
