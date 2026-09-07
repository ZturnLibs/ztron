# Sweep Report: follow-up sweep (5 recorded review findings)

Branch: `chore/followup-sweep` · Commit: see git log (`chore: follow-up sweep - adapter test hygiene, network timeout, template dep pins`)

## Status: DONE

## Test counts
- `pnpm test:unit`: **182 → 185** (all pass; +1 vue dispose-unregister test, +2 new tests in the new `tests/unit/network.test.ts`)
- Full `pnpm test` (unit + core.test.ts): 198 tests, 197 pass, 1 pre-existing skip (PathScope $TMP test, untouched), 0 fail
- `pnpm typecheck`: all packages/examples exit 0

## Per-item one-liners

1. **ztron-vue channel disposal + useInvoke docstring** — `@zturnlibs/ztron-api`
   `Channel` got a public `dispose()` (client-side `end`: calls the existing
   private `cleanupCallback()` → `internals().unregisterCallback(id)`;
   idempotent; inject's `runCallback` already no-ops on unknown ids, so
   real-world late delivery is safe). `useChannelStream` now tracks the
   active channel and disposes it in `onScopeDispose` (disposal-only, per the
   brief). TDD: new headless test
   `useChannelStream disposal unregisters the channel callback from the
   bridge registry` uses a never-settling invoke (no backend `end` marker),
   so a mutant that only bumps `runId` fails. The existing disposal test's
   `runCallback`-after-stop assertion was upgraded to a registry-membership
   assertion (the harness `runCallback` throws on unregistered ids — that is
   the new teeth). useInvoke docstring + package README no longer claim
   "re-runs when `cmd` changes" (cmd is setup-time; args-only, reactive args
   by value).
2. **ztron-svelte throw-test scoping** — the `listenOnMount` throw-test now
   installs its own `mockIPC` (paired with `clearMocks` in `finally`)
   instead of leaning on the preceding race test's handler surviving
   `clearMocks` (`originalInvoke` is never captured because the harness
   registers no `invoke` to restore), and asserts the Svelte error shape
   (`TypeError` + `/Cannot read properties of null/` — empirically probed
   against svelte@5.57.0) instead of bare `instanceof Error`, so a transport
   error cannot masquerade as the onDestroy-context error.
3. **ztron-react jsdom teardown + comment** — the react test `after` now
   deletes `globalThis.window` / `globalThis.document` /
   `IS_REACT_ACT_ENVIRONMENT` (protects future non-isolated runs); added the
   one-line comment on `useChannelStream`'s `start` deps
   (`args` by reference, intentional) in `packages/ztron-react/src/index.ts`.
4. **network get_public_ip timeout** — `networkPlugin(options)` gained
   `NetworkPluginOptions { publicIpUrl?; publicIpTimeoutMs? }` (defaults
   `https://icanhazip.com` / 5000 ms) and the fetch is abort-capped via
   `AbortSignal.timeout(ms)` (the httpPlugin `timeoutMs` pattern), degrading
   to `null` in the existing catch. TDD: new `tests/unit/network.test.ts`
   (fetch-stubbed, network-free) proves (a) the injected endpoint is used
   and the IP trimmed, (b) a hanging endpoint aborts (signal `abort` event
   observed), returns `null` promptly. Verification contract 5: proven by
   test in the node test environment; tjs support documented
   (DESIGN.md:1190 "AbortSignal.timeout (txiki natively supported)", same
   pattern shipped in P19 http).
5. **Init template dep pins** — `packages/cli/src/templates.ts`: react/
   react-dom → `^19.0.0`, vue → `^3.5.0`, svelte → `^5.0.0`;
   `@zturnlibs/ztron-*` stay `latest` (release-train). Header comment updated
   to state the convention. Template tests now pin the three ranges (and
   keep `latest` only for ztron deps). cli.md zh/en make no `latest` claim —
   no docs change needed. Live-check: scaffolded all three templates to /tmp
   via the built CLI — react-ts `react@^19.0.0, react-dom@^19.0.0`, vue-ts
   `vue@^3.5.0`, svelte `svelte@^5.0.0`; /tmp trees deleted.

## Verification contract
1. `pnpm test:unit` — 185/185 green, with the new/changed assertions above. PASS
2. vue/svelte/react `build` — all exit 0. PASS
3. `pnpm docs:build` — exit 0 (214/216 sidebar pages, pre-existing ratio). PASS
4. Template live-check — ranges above. PASS
5. Timeout proven by test (+ txiki support documented). PASS

## Concerns / notes
- Restart path not disposed: `useChannelStream.start()` re-issue replaces
  the channel without disposing the previous one (pre-existing behavior on
  both vue and react; the brief scoped item 1a to scope disposal). The old
  callback unregisters when the backend's `end` marker arrives; if a
  backend command can stream forever, a restart leaks the registry entry
  until then. One-liner follow-up if desired (would need the restart test's
  late-message assertions reworked).
- The svelte message assertion pins svelte's current internal TypeError
  wording (`/Cannot read properties of null/`); a svelte major that changes
  the throw shape will fail this test loudly (acceptable: it guards the
  binding contract).
- Pre-existing uncommitted `.superpowers/sdd/task-*.md` edits and
  `.playwright-mcp/` in the working tree are not part of this sweep and were
  left untouched/uncommitted.
