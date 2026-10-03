# @zturnlibs/ztron-api

Frontend API for [Ztron](https://github.com/ZturnLibs/ztron) — a faithful TypeScript port of the [`@tauri-apps/api`](https://github.com/tauri-apps/tauri) surface. If you know Tauri, you know this package; migrating an existing frontend is mostly rewriting imports from `@tauri-apps/api/*` to `@zturnlibs/ztron-api/*` ([migration guide](https://zturnlibs.github.io/ztron/docs/guide/tauri-migration.html)).

## Install

```sh
npm install @zturnlibs/ztron-api
```

## Usage

```ts
import { invoke, Channel, convertFileSrc } from "@zturnlibs/ztron-api/core";
import { listen, emit } from "@zturnlibs/ztron-api/event";

// call a command registered in the Ztron backend
const greeting = await invoke<string>("greet", { name: "world" });

// stream progress over a Channel
const chan = new Channel<number>();
chan.onmessage = (n) => console.log(`${n}%`);
await invoke("transcode", { onProgress: chan });

// events, both directions
const unlisten = await listen<string>("backend-ready", (e) => console.log(e.payload));
await emit("frontend-ready", { version: "1.0.0" });

// resolve a filesystem path to a ztron:// asset URL
const src = convertFileSrc("/path/to/video.mp4");
```

## Entry points

| Import | Contents |
| --- | --- |
| `@zturnlibs/ztron-api/core` | `invoke`, `Channel`, `convertFileSrc`, `Resource`, `transformCallback`, `isZtron` |
| `@zturnlibs/ztron-api/event` | `listen`, `once`, `emit`, `emitTo` |
| `@zturnlibs/ztron-api/window` / `webview` / `webviewWindow` | window & webview handles (`WebviewWindow` extends `Window`) |
| `@zturnlibs/ztron-api/menu` / `tray` | menu bar & system tray |
| `@zturnlibs/ztron-api/path` / `dpi` / `image` / `app` | path resolution, DPI scale, image utils, app metadata |
| `@zturnlibs/ztron-api/mocks` | test doubles for running frontend code outside a Ztron app |

## Docs

- [Documentation (zh / en)](https://zturnlibs.github.io/ztron/docs/)
- [Quick start](https://zturnlibs.github.io/ztron/docs/start/quick-start.html)
- [Showcase example](https://github.com/ZturnLibs/ztron/tree/main/examples/showcase) — every plugin API as interactive cards

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
