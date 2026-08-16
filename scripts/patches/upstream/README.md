# Upstream webview/webview PRs

Three fixes developed for Ztron's vendored `native/webview` library,
rebased onto upstream master (cbbdee4, zero drift) and proposed upstream.
The workspace lives in `~/Zturn/webview-pr/webview` (shallow clone);
the vendored copy still carries the Ztron-shaped versions applied via
`webview-local.patch` — these files are the upstreamable equivalents.

| # | Branch | PR | Status |
|---|--------|----|--------|
| 1 | `fix/cocoa-deplete-run-loop-deadlock` | https://github.com/webview/webview/pull/1368 | open |
| 2 | `fix/cocoa-script-message-handler-uaf` | https://github.com/webview/webview/pull/1369 | open |
| 3 | `feat/custom-url-scheme-handler` | https://github.com/webview/webview/pull/1370 | open |

## Upstream-vs-vendored differences (PR 3)

- Dropped `getenv("ZTRON_SCHEME_ROOT")` + post-create `webview_set_scheme_handler`
  (WKWebViewConfiguration ignores late registration — an honest upstream API must
  be creation-time). Introduced `webview_config_t` (size-prefixed) +
  `webview_create_from_config()` instead.
- ObjC class renamed `ZtronSchemeHandler` → `WebviewWKURLSchemeHandler`,
  registered once via the repo's lookUpClass-then-allocate pattern (the vendored
  copy re-allocated per engine — silently broken for the 2nd+ window).
- Root directory now travels as an associated NSString per handler instance
  (no static/global state).
- Added `..` path-component rejection (404) — traversal confinement the
  vendored copy lacked.
- Dropped the Ztron-specific `asset/<abs-path>` escape hatch; upstream contract
  is strictly `<root>/<path>`.
- gtk/win32 engines accept+ignore the new ctor params (source compatibility).

## Re-apply on the vendored copy (after acceptance)

```sh
cd native/webview
git fetch && git rebase origin/master   # then re-apply remaining local bits
git apply ../../scripts/patches/upstream/pr<N>-*.patch
```

## Verification (all three)

- cmake build clean (`-Wall`, macOS, zero warnings), clang-format clean.
- PR 1/2: exercised for months inside Ztron's host (shutdown path + multi-window
  destroy stress).
- PR 3: dedicated smoke test — page+CSS served through `testapp://host/...`,
  in-page fetch status codes: real file 200, `../../etc/passwd` 404, missing
  404 (`T=scheme-ok C=200 P=404 N=404`).
