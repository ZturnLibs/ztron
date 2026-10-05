# @zturnlibs/ztron-driver

WebDriver intermediary for [Ztron](https://github.com/ZturnLibs/ztron) apps — the role [`tauri-driver`](https://docs.rs/tauri-driver) plays for Tauri: a W3C-protocol relay that lets standard WebDriver tooling drive a running Ztron application.

## Why

Ztron apps use the OS webview, which doesn't expose a WebDriver endpoint by itself. `ztron-driver` accepts a normal W3C WebDriver session (so WebDriverIO, selenium clients, and CI harnesses work unmodified) and relays it to the platform's native WebDriver remote — which it spawns itself — rewriting only the new-session capabilities.

## Usage

```sh
npm install -g @zturnlibs/ztron-driver
ztron-driver   # client port 4444, native remote port 4445
```

Point any WebDriver client at the relay and request a session with `tauri:options` (upstream wire contract):

```js
{
  capabilities: {
    alwaysMatch: {
      "tauri:options": {
        application: "C:/apps/hello/dist/ZtronApp/ztron-launcher",
        args: [],                    // forwarded to the app binary
        webviewOptions: { /* Windows-only passthrough to ms:edgeOptions */ }
      }
    }
  }
}
```

`application` is the app's **entry binary** — for a packed Ztron app that is
`ztron-launcher` (it starts the backend and the webview host; pointing at
`ztron-host` directly gives you a window with no backend).

The driver translates `tauri:options` per platform, exactly like upstream:
Windows → `ms:edgeOptions` (`ms:edgeChromium` + WebView2 binary) served by
`msedgedriver`; Linux → `webkitgtk:browserOptions` served by
`WebKitWebDriver`. Everything else passes through untouched — the native
remote's answers are the truthful ones.

Flags: `--port` / `ZTRON_DRIVER_PORT` (default 4444), `--native-port` /
`ZTRON_DRIVER_NATIVE_PORT` (4445), `--native-driver` / `ZTRON_NATIVE_DRIVER`
(explicit remote binary; also the hook for wrapping a custom/fake remote).

Windows note: install `msedgedriver.exe` matching your WebView2/Edge version
and put it on `PATH` (or pass `--native-driver`). The driver sets the usual
automation environment (`TAURI_AUTOMATION`, `TAURI_WEBVIEW_AUTOMATION`);
msedgedriver itself injects the CDP port into the app via
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` and hands it a scoped user-data
folder via `WEBVIEW2_USER_DATA_FOLDER` — the vendored Ztron engine honors
both under automation, so app sessions need no extra configuration.

## Platform matrix

| Platform  | Native remote    | Status |
| --------- | ---------------- | ------ |
| Windows   | `msedgedriver`   | verified end-to-end (real msedgedriver 154 → packed hello app: session/navigate/title/delete) |
| Linux     | `WebKitWebDriver`| wire contract unit-tested; remote-relay verified against a fake remote |
| macOS     | —                | not supported (upstream parity: no native WebDriver remote); fails closed at startup unless `ZTRON_NATIVE_DRIVER` wraps a custom remote |

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
