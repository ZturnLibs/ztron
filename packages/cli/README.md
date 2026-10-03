# @zturnlibs/ztron-cli

The [Ztron](https://github.com/ZturnLibs/ztron) command line: scaffold, dev, build, verify. Ships with the prebuilt native chain (host binary + tjs runtime + libwebview) as platform-scoped optional dependencies — **no clone, no compiler, no environment variables**.

## Install

```sh
npm install -g @zturnlibs/ztron-cli
# or run once-off:
npx @zturnlibs/ztron-cli init my-app
```

## Commands

| Command | What it does |
| --- | --- |
| `ztron init my-app --template react-ts` | Scaffold a project (`vanilla` \| `react-ts` \| `vue-ts` \| `svelte`) |
| `ztron dev` | Vite dev server + native window, full-module HMR over the `ztron://` scheme |
| `ztron build` | `tjs compile` backend → standalone executable → .app/dmg (macOS) or flat dir + NSIS installer (Windows), ad-hoc/Developer ID signing |
| `ztron check` | 86 deterministic end-to-end checks + `FULL_OK` sentinel; exit-code regressable for CI |
| `ztron codegen` | Emit type-safe frontend invoke bindings from backend `defineCommand` exports |
| `ztron doctor` | 5-point environment check; every FAIL comes with a fix hint |
| `ztron bench --runs 3` | Cold/warm start, invoke P50/P95, Channel throughput, window create, RSS; `--record` persists the budget baseline |
| `ztron completions` | Shell completions |

## 30-second start

```sh
npx @zturnlibs/ztron-cli init my-app --template react-ts
cd my-app && npm install
npx ztron dev
```

## Platform status

- **macOS (Apple Silicon)** — ✅ fully verified
- **Windows (WebView2)** — 🚧 dev chain + NSIS packaging verified; prebuilt native chain publishing in progress (local dev currently needs vcpkg + MSVC)
- **Linux (WebKitGTK)** — 🚧 host skeleton in place

Run `ztron doctor` if anything looks off.

## Docs

- [Documentation (zh / en)](https://zturnlibs.github.io/ztron/docs/)
- [Install guide](https://zturnlibs.github.io/ztron/docs/start/install.html)

## License

[MIT](https://github.com/ZturnLibs/ztron/blob/main/LICENSE)
