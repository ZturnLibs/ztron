# Task 6 Report: docs start/ — quick-start.md rewrite (zh/en, core tutorial page)

**Status:** DONE
**Commit:** `8ab13cb` — `docs(start): first-app tutorial (try 3-liner, structure, first TS command, package)` (branch `feat/onboarding`)
**Files changed:** `docs/zh/start/quick-start.md`, `docs/en/start/quick-start.md` (2 files, +156/−38)

## What was written

- `docs/zh/start/quick-start.md` — the brief's core tutorial, with corrections where the implementation differs (see below): "Try Ztron（3 行）" 3-liner (`ztron init my-app && cd my-app` / `pnpm install` / `ztron dev`), project structure tree, 改前端 (h1 + button + `#out`), 加一个 TypeScript 命令 (`defineCommand("my:greet", …)` in `src/commands.ts` → registration in `src/main.ts` → `ztron codegen` → frontend `invoke`), 打包 (`ztron build`), footer links to `/start/examples` · `/guide/architecture` · `/reference/cli`.
- `docs/en/start/quick-start.md` — section-by-section en mirror. **Code blocks are verbatim identical to zh** (per brief), including the user-visible strings `我的第一个 Ztron 应用` / `打招呼` / `你好` in the HTML/TS snippets; en prose glosses the Chinese ("My First Ztron App") so English readers can follow.

## Tutorial corrections vs the brief (implementation is source of truth)

1. **`registerCommand` does not exist.** The init template registers commands inside `.setup((app) => …)` via `app.command("hello", …)` (untyped) / `app.commandDef(def)` (typed — `packages/core/src/app.ts:1397`, the same API `examples/hello/src/main.ts:258` uses). Brief text "init 模板已内置 registerCommand 调用处" replaced with: register inside the template's built-in `.setup((app) => …)` next to `app.command("hello", …)`, adding `import { greet } from "./commands.js"` + `app.commandDef(greet)`. A second ts snippet was added showing exactly that line.
2. **`pnpm i @zturnlibs/ztron-api` dropped** — `ztron init` already writes `@zturnlibs/ztron-api` into `dependencies` (verified in the scaffolded package.json), so the install is a no-op. Section now reads "生成类型化前端绑定（API 包 `@zturnlibs/ztron-api` 已由 `init` 写入 `dependencies`）" with only `ztron codegen`.
3. **Footer link `/reference/commands` → `/reference/cli`.** `docs/{zh,en}/reference/` contains only `cli.md`; a `/reference/commands` link would be a dead link in the docs build. Label changed to "CLI 参考"/"CLI Reference" to match the page.
4. **`dev` behavior line corrected**: brief said "Vite 构建前端"; reality is `runApp` prefers a **Vite dev server** (`startFrontendDevServer`, HMR) and only falls back to a build+reload watcher. Now: "`dev` 会启动 Vite dev server、拉起原生窗口并启动 tjs 后端；前端改动即时热重载（HMR）。"
5. **Packaging sentence extended**: `ztron build` also emits a `.dmg` by default (`packDmg`, verified). Added "（默认附带 `.dmg`）".
6. Dropped the old trailing `适用版本：ztron 0.3.0` line (not in the brief; Task 5 pages also dropped it).

## Step 3 verification — every snippet executed (tmpdir `/tmp/ztron-t6-adyPow`)

Env: worktree CLI rebuilt (`pnpm --dir packages/cli build` → tsc OK); native chain from the **main repo** (worktree has no `native/libs/`): `ZTRON_TJS=/Users/zyj/Zturn/Ztron/native/txiki.js/build/tjs`, `ZTRON_HOST_BIN=/Users/zyj/Zturn/Ztron/native/libs/ztron-host`, `ZTRON_WEBVIEW_LIB=…/libwebview.dylib`.

| # | Tutorial snippet | Result |
| --- | --- | --- |
| 1 | `ztron init my-app && cd my-app` | exit 0; scaffold = `ztron.conf.json` (`entry: src/main.ts`, `identifier: com.example.app`, `windows[]`) + `src/main.ts` + `frontend/index.html` + `frontend/src/main.ts` — matches the doc's structure tree exactly; `frontend/index.html` contains the literal `<h1>Hello Ztron</h1>` the tutorial says to replace |
| 2 | `pnpm install` | exit 0 — but only with local `pnpm pack` tarballs + `pnpm-workspace.yaml` overrides; see Concern A |
| 3 | `ztron doctor` (prerequisite) | 5× PASS (`node/tjs/host/webview/platform`) + `doctor: OK`, exit 0 |
| 4 | 改前端 html edits | applied cleanly against the template (h1 replace target found verbatim) |
| 5 | `src/commands.ts` `defineCommand("my:greet", …)` | matches fact source `examples/hello/src/commands.ts:8` pattern |
| 6 | registration `app.commandDef(greet)` + import | compiles in the template's `.setup`; typed registration API confirmed at `packages/core/src/app.ts:1397` |
| 7 | `ztron codegen` | exit 0 → `[ztron] codegen: 1 command(s) -> src/ztron-commands.ts`; generated file maps `"my:greet": { args: { name: string }; result: string }` |
| 8 | `pnpm i @zturnlibs/ztron-api` | exit 0 ("Already up to date" — confirms it is redundant; removed from tutorial) |
| 9 | frontend `invoke("my:greet", { name: "Ztron" })` | proven pattern: `examples/hello/frontend/src/main.ts:105` invokes `my:greet`; hello regression below passes the codegen/invoke checks |
| 10 | `ztron build` | exit 0 → `dist/ZtronApp.app` (codesign `Signature=adhoc`) + `dist/ZtronApp.dmg` (3.1 MB); backend bundle `src/.ztron/app.mjs` greps `my:greet` + the `你好, ` handler; bundle layout: MacOS/{ztron, ztron-host, libwebview*.dylib}, Resources/{frontend, ztron-backend} |
| 11 | `ztron dev` (GUI) | per plan, replaced by the authorized smoke: **`ztron check` on `examples/hello`** → `SPIKE_RESULT: FULL_OK`, `[ztron check] 85 checks passed (FULL_OK)`, **exit 0** (real host + webview + tjs backend chain) |

## Step 4 — docs gates

- `pnpm --dir docs run check:locales:deploy` → `[check-locales] OK — zh/en trees match, no placeholders`, exit 0.
- `pnpm --dir docs run build` → `success Pages rendered`, exit 0. (docs/node_modules already present in this worktree; no reinstall needed.)

## Concerns / findings for the coordinator

- **A. `@zturnlibs/*` is not publicly installable yet.** `npm view --registry=https://registry.npmjs.org @zturnlibs/ztron-cli` → 404 (same for core/api/runtime-ffi); no GPR token in `~/.npmrc`. The tutorial's `pnpm install` therefore cannot work from a real registry today — I verified with `pnpm pack` tarballs + overrides instead. This is the W1 publish pipeline (Task 2's CI), not a docs defect, but the whole "Try Ztron (3 行)" journey stays blocked on the actual npmjs publish landing.
- **B. pnpm 11 ignores `pnpm.overrides` in package.json** (must live in `pnpm-workspace.yaml`) — only affected my test harness, not the docs. Separately: pnpm 10/11 ignore esbuild's postinstall by default (`ERR_PNPM_IGNORED_BUILDS`), which makes `pnpm exec ztron …` fail its deps-check until `onlyBuiltDependencies: [esbuild]` is configured. `pnpm install` itself still exits 0 (warning only). A scaffold-level fix (ship a `pnpm-workspace.yaml`/`.npmrc` from `ztron init`) would smooth onboarding on modern pnpm — CLI change, out of this docs task's scope.
- **C. `native/libs/tjs` does not exist on this machine** (neither worktree nor main repo); tjs is at `native/txiki.js/build/tjs`. Commit `2f0e300` updated `scripts/build-native.sh` to copy tjs into `native/libs/`, but it hasn't been re-run here. Doctor passes via `ZTRON_TJS`; no doc text needed changing (install.md already documents `native/libs/{tjs,…}` as the post-script layout).
- **D. hello check count drifted**: `ztron check` now prints **85** checks passed (old docs claimed 86). My new quick-start makes no count claim; but `docs/{zh,en}/start/examples.md` still says "86 检查/86 checks". examples.md is out of Task 6 scope — flagging for Task 7/final pass.
- **E. `.app` bundle identifier quirk**: `ztron build`'s macOS Info.plist uses `com.ztron.<appName>`, not `ztron.conf.json`'s `identifier` (which feeds AppBuilder identity + the nsis/msi/etc. targets). The tutorial's "分发前可修改 `identifier`" stays as the brief wrote it (still true config-wise); noting the plist detail here in case a later task wants `packMacApp` to honor `conf.identifier`.
- Working-tree `.superpowers/sdd/*` edits from other tasks were left untouched; only the two docs files were committed (matching Task 5's commit convention). The stale pre-existing `task-6-report.md` (from a previous journey iteration, about CONTRIBUTING.md) was overwritten by this report.
