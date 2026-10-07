#!/usr/bin/env bash
#
# ci.sh — one-shot regression pipeline for Ztron.
#
# Runs the full verification chain in order:
#   1. native build    (webview lib + ztron-host + launcher, -Wall -Werror)
#   2. TS build        (all workspace packages incl. examples)
#   3. unit tests      (node --test, ledger-enforced)
#   4. hello spike     (ztron check: 86 deterministic checks -> exit code)
#   5. multiwin spike  (ztron check --expect: window lifecycle + stress)
#   6. packaged spike  (platform e2e: darwin .app / win32 flat app + NSIS)
#
# Any step failing aborts with a clear marker. Exit 0 = whole chain green.
#
# Usage:
#   bash scripts/ci.sh                 # full chain
#   bash scripts/ci.sh --skip-native   # reuse existing native build
#   bash scripts/ci.sh --skip-packaged # skip the packaged e2e (also auto-
#                                      #   skipped on platforms without one)
#   bash scripts/ci.sh --spike-timeout 150000
#
# Environment:
#   ZTRON_TJS   path to the txiki tjs binary (required; see find below)

set -euo pipefail

ROOT="$(cd "$(dirname "$BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_NATIVE=0
SKIP_PACKAGED=0
SPIKE_TIMEOUT_MS=120000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-native) SKIP_NATIVE=1 ;;
    --skip-packaged) SKIP_PACKAGED=1 ;;
    --spike-timeout) SPIKE_TIMEOUT_MS="$2"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
# Print the marker, then sweep the children a failed stage may have left:
# a surviving vite/ztron child holds the job step's inherited stdio open and
# keeps the CI step "running" after ci.sh is gone (observed on macos
# runners). Patterns are specific — never matches this script's own cmdline.
fail() {
  printf '\n\033[1;31m✗ FAILED at: %s\033[0m\n' "$*" >&2
  pkill -f vite 2>/dev/null || true
  pkill -f ztron-host 2>/dev/null || true
  pkill -f ztron-backend 2>/dev/null || true
  pkill -f "ztron check" 2>/dev/null || true
  exit 1
}

# Portable bounded-run (macOS runners lack GNU timeout): run "$@" in its own
# process group; if it outlives $1 seconds, kill the GROUP — node/esbuild
# grandchildren survive a bare parent kill and then hold the CI step's stdio
# ("running" forever, observed on macos runners: 2.5h of silent step-10 with
# node+esbuild orphans). Bounds the unbounded toolchain stages only; the
# spikes carry their own internal timers.
run_bounded() {
  local secs="$1"; shift
  set -m
  "$@" &
  local pid=$!
  local i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt "$secs" ]; do
    sleep 1
    i=$((i + 1))
  done
  set +m
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM -- "-$pid" 2>/dev/null || true
    sleep 2
    kill -KILL -- "-$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
    printf 'ztron-ci: exceeded %ss, killed process group: %s\n' "$secs" "$*" >&2
    return 124
  fi
  wait "$pid"
}

# Kill straggler ztron processes on Windows (Git Bash has no pkill). Needed
# at BOTH ends: a surviving ztron-host.exe keeps webview.dll locked and the
# next native build's `cp` fails with "Device or resource busy".
# PID/path-scoped, never image-wide: ztron apps share the exe image names
# across installs (a real app under %LOCALAPPDATA% must never be swept).
win_sweep() {
  command -v powershell >/dev/null 2>&1 || return 0
  ZTRON_SWEEP_ROOT="$(cygpath -w "$ROOT" 2>/dev/null || echo "$ROOT")" \
  ZTRON_SWEEP_TMP="$(cygpath -w "${TMPDIR:-/tmp}" 2>/dev/null || echo "${TMPDIR:-/tmp}")" \
  powershell -NoProfile -Command '
    $roots = @($env:ZTRON_SWEEP_ROOT, $env:ZTRON_SWEEP_TMP) | Where-Object { $_ }
    Get-CimInstance Win32_Process | Where-Object {
      $p = $_
      ($_.Name -in @("tjs.exe","ztron-host.exe","ztron-backend.exe","ztron-launcher.exe")) -and
      ($roots | Where-Object { $p.ExecutablePath -like "$_*" })
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  ' >/dev/null 2>&1 || true
}

# ---- 0. preflight ------------------------------------------------------------

step "preflight: tjs runtime"
TJS="${ZTRON_TJS:-$ROOT/native/txiki.js/build/tjs}"
if [[ ! -x "$TJS" ]]; then
  # Windows cmake output lands in build/Release/ with an .exe suffix.
  TJS="$ROOT/native/txiki.js/build/Release/tjs.exe"
fi
if [[ ! -x "$TJS" ]]; then
  echo "tjs not found (build txiki.js first or set ZTRON_TJS)" >&2
  exit 1
fi
echo "tjs: $TJS"

# Stale state from previous runs would poison persisted-scope / rotation
# determinism (and a stale host keeps webview.dll locked on Windows); wipe
# the known artifacts. (TMPDIR is set on macOS shells but often unset
# elsewhere — `set -u` would abort without the fallback.)
pkill -9 -f ztron-host 2>/dev/null || true
win_sweep
rm -rf ~/ztron-persisted-spike "${TMPDIR:-/tmp}/ztron_persisted_scope.json" || true

# ---- 1. native ---------------------------------------------------------------

if [[ "$SKIP_NATIVE" -eq 0 ]]; then
  step "native build (webview lib + host + launcher)"
  # bounded (30min vs ~5-8min normal): a stuck cmake child must fail the
  # stage loudly instead of eating the runner's 6h job timeout in silence.
  run_bounded 1800 bash scripts/build-native.sh || fail "native build"
  # The vendored webview copy carries local patches; make sure they are
  # fully exported so a fresh clone reproduces this exact build.
  ( cd native/webview \
    && if ! git diff --quiet -- core/; then \
         git diff core/ > /tmp/ci-webview.diff \
         && if ! diff -q /tmp/ci-webview.diff ../../scripts/patches/webview-local.patch >/dev/null 2>&1; then \
           echo "  (webview-local.patch outdated — re-exporting)"; \
           cp /tmp/ci-webview.diff ../../scripts/patches/webview-local.patch; \
         fi; \
       fi )
else
  step "native build: SKIPPED (--skip-native)"
fi

# ---- 2. TypeScript build -----------------------------------------------------

step "workspace build (core/api/cli/runtime-ffi/inject + examples)"
# bounded: an esbuild/vite hang here once stalled a macos runner step for
# 2.5h in total silence (run 37027110592) — with the bound the step fails
# visibly in ≤15min with the log tail instead.
run_bounded 900 npm run build >/tmp/ci-build.log 2>&1 \
  || { tail -30 /tmp/ci-build.log; fail "npm run build"; }

# ---- 3. unit tests -----------------------------------------------------------

step "unit tests (node --test)"
# Strip the chain locator env vars: the suite is hermetic (doctor tests
# assert the missing-chain path) and this script exports ZTRON_TJS for the
# spikes — leaking it would flip those assertions.
# env(1) can only exec binaries — the -u list goes INSIDE run_bounded's
# command, not in front of it (a function cannot be exec'd).
run_bounded 900 env -u ZTRON_TJS -u ZTRON_HOST_BIN -u ZTRON_WEBVIEW_LIB \
  npm test >/tmp/ci-unit.log 2>&1 \
  || { tail -30 /tmp/ci-unit.log; fail "unit tests"; }
tail -6 /tmp/ci-unit.log

# ---- 4. hello spike ----------------------------------------------------------

# `timeout` (GNU coreutils) is absent on stock macOS runners — and there the
# CLI's internal --timeout is NOT a sufficient backstop: without WindowServer
# a native window-creation call can block the tjs main thread, so event-loop
# timers never fire and `ztron check` never exits (dispatch runs
# 37010369951/37027110592 sat 6h/2.5h in silence). When GNU timeout is
# missing, run_bounded kills the whole process group instead.
run_ztron_check() {
  # $1 = example dir, rest = ztron args. GNU timeout guards only when both
  # it and a real bin exist (functions cannot be exec'd by timeout).
  local dir="$1"; shift
  local bound=$(( SPIKE_TIMEOUT_MS / 1000 + 30 ))
  if [ -n "$ZTRON_BIN" ] && command -v timeout >/dev/null 2>&1; then
    ( cd "$dir" && ZTRON_TJS="$TJS" timeout "$bound" "$ZTRON_BIN" "$@" )
  elif [ -n "$ZTRON_BIN" ]; then
    ( cd "$dir" && ZTRON_TJS="$TJS" run_bounded "$bound" "$ZTRON_BIN" "$@" )
  else
    ( cd "$dir" && ZTRON_TJS="$TJS" run_bounded "$bound" ztron "$@" )
  fi
}

ZTRON_BIN="$ROOT/examples/hello/node_modules/.bin/ztron"
if [ ! -x "$ZTRON_BIN" ]; then
  ZTRON_BIN="$ROOT/node_modules/.bin/ztron"
fi
if [ ! -x "$ZTRON_BIN" ]; then
  # Some CI pnpm layouts do not link example devDependency bins; the CLI is
  # plain node (built by the workspace step) — invoke its entry directly.
  CLI_ENTRY="$ROOT/packages/cli/dist/index.js"
  if [ -f "$CLI_ENTRY" ]; then
    ztron() { node "$CLI_ENTRY" "$@"; }
    ZTRON_BIN=""
    echo "(ztron bin link absent; invoking $CLI_ENTRY via node)"
  else
    echo "ztron bin not found and $CLI_ENTRY missing" >&2
    fail "ztron bin resolution"
  fi
else
  ztron() { "$ZTRON_BIN" "$@"; }
fi

step "hello spike (ztron check)"
run_ztron_check "$ROOT/examples/hello" check --timeout "$SPIKE_TIMEOUT_MS" \
  > /tmp/ci-hello.log 2>&1 \
  || { tail -30 /tmp/ci-hello.log; fail "hello ztron check"; }
tail -2 /tmp/ci-hello.log

# ---- 5. multiwin spike -------------------------------------------------------

step "multiwin spike (ztron check --expect)"
# GAP H15: APP_LIFECYCLE_OK carries real assertions on windows (hide/show
# visibility round-trip + dock-skip readback via app_diag); on mac the leg
# stays a smoke call, same marker. BG_COLOR_OK (GAP H16) samples the
# webview surface pixel via a PrintWindow readback — windows-only leg.
# BADGE_OK / GRAB_OK / ALLWS_OK (GAP H18): badge overlay accept hres,
# ClipCursor set/release readback, live WS_EX_TOPMOST flip.
run_ztron_check "$ROOT/examples/multiwin" check --timeout "$SPIKE_TIMEOUT_MS" \
    --expect SECOND_WINDOW_OK --expect SECOND_OPS_OK --expect STRESS_OK \
    --expect APP_LIFECYCLE_OK --expect BG_COLOR_OK \
    --expect BADGE_OK --expect GRAB_OK --expect ALLWS_OK \
  > /tmp/ci-multiwin.log 2>&1 \
  || { tail -30 /tmp/ci-multiwin.log; fail "multiwin ztron check"; }

step "menuprobe spike (ztron check --expect)"
# GAP H14: win32-only legs — per-window bar mount, bitmap icon, real
# Minimize role action (mac covers these through NSApp mounts above).
MENUPROBE_EXTRAS=""
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    # GAP H17: TRAY_EVENTS_OK drives the shell-callback path via tray_inject
    # (click/right/doubleClick + synthesized hover family + attribution).
    MENUPROBE_EXTRAS="--expect MENU_WINMENU_OK --expect MENU_ICON_OK --expect ROLE_MIN_OK --expect TRAY_EVENTS_OK" ;;
esac
run_ztron_check "$ROOT/examples/menuprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
    --expect MENU_V2_OK \
    --expect TRAY_V2_OK \
    --expect LOCALHOST_OK \
    --expect INNER_POS_OK \
    --expect IMG_READBACK_OK \
    $MENUPROBE_EXTRAS \
    > /tmp/ci-menuprobe.log 2>&1 \
  || { tail -30 /tmp/ci-menuprobe.log; fail "menuprobe ztron check"; }
tail -2 /tmp/ci-multiwin.log

# ---- 5.4b menu popup probe (win32; GAP H13 — mac popup is NSMenu-native) -----
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "popuprobe (win32 programmatic TrackPopupMenu + TPM_RETURNCMD)"
    run_ztron_check "$ROOT/examples/popuprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect POPUP_CANCEL_OK \
      --expect POPUP_LEAF_OK \
      --expect POPUP_SUB_OK \
      > /tmp/ci-popuprobe.log 2>&1 \
      || { tail -30 /tmp/ci-popuprobe.log; fail "popuprobe ztron check"; }
    tail -2 /tmp/ci-popuprobe.log
    ;;
  *) step "popuprobe: SKIPPED (windows only)" ;;
esac

# ---- 5.5 winevent probe (windows only; GAP H1–H4 regression) -----------------

# Window-event routing / prevent-close on the win32 host (host_windows.c).
# The hello spike never asserted per-window event delivery, so these P0s
# regressed silently until the probe existed (2026-10-03 batch: events were
# misrouted as tray_event, prevent_close was a stub, dialog ask/confirm
# hung, secondary windows had no attach). Needs an interactive desktop —
# windows runners qualify; skip elsewhere.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "winevent probe (win32 window events + prevent-close)"
    run_ztron_check "$ROOT/examples/winevent-probe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect WIN_EVENTS_OK \
      --expect CLOSE_PREVENT_OK \
      --expect WINDOW_ALIVE_OK \
      --expect CLOSE_DISARMED_OK \
      > /tmp/ci-winevent.log 2>&1 \
      || { tail -30 /tmp/ci-winevent.log; fail "winevent probe"; }
    tail -2 /tmp/ci-winevent.log
    ;;
  *) step "winevent probe: SKIPPED (windows only)" ;;
esac

# ---- 5.6 ztron:// scheme handler probe (win32; mac has WKURLSchemeHandler) ---
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "scheme probe (win32 ztron:// WebResourceRequested)"
    SCHEME_ROOT="$(cygpath -m "$(mktemp -d)")"
    mkdir -p "$SCHEME_ROOT"
    ZTRON_SCHEME_ROOT="$SCHEME_ROOT" \
      run_ztron_check "$ROOT/examples/schemeprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect SCHEME_PAGE_OK \
      --expect SCHEME_SUBRES_OK \
      --expect SCHEME_404_OK \
      --expect SCHEME_ASSET_OK \
      > /tmp/ci-scheme.log 2>&1 \
      || { tail -30 /tmp/ci-scheme.log; fail "scheme probe"; }
    tail -2 /tmp/ci-scheme.log
    rm -rf "$SCHEME_ROOT"
    ;;
  *) step "scheme probe: SKIPPED (windows only)" ;;
esac

# ---- 5.7 permission bridge probe (win32; mac has the WKUIDelegate bridge) ---
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "permission probe (win32 PermissionRequested bridge)"
    PERM_ROOT="$(cygpath -m "$(mktemp -d)")"
    mkdir -p "$PERM_ROOT"
    # Device-less hosts (windows-latest has no camera/mic) cannot run the
    # media deny/allow path: Chromium fails getUserMedia with NotFoundError
    # before PermissionRequested ever fires. The probe self-detects this and
    # reports PERM_NODEVICE_SKIPPED; on hosts WITH devices the full
    # four-assertion set must be present.
    if ZTRON_SCHEME_ROOT="$PERM_ROOT" \
      run_ztron_check "$ROOT/examples/permissionprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      > /tmp/ci-perm.log 2>&1; then
      if grep -q "PERM_REQ_OK" /tmp/ci-perm.log; then
        for t in PERM_REQ_OK PERM_DENY_OK PERM_ALLOW_OK PERM_KINDS_OK; do
          grep -q "$t" /tmp/ci-perm.log \
            || { tail -30 /tmp/ci-perm.log; fail "permission probe ($t missing)"; }
        done
      elif grep -q "PERM_NODEVICE_SKIPPED" /tmp/ci-perm.log; then
        echo "permission probe: host has no capture devices — skipped (bridge covered on device hosts)"
      else
        tail -30 /tmp/ci-perm.log; fail "permission probe (no REQ_OK, no skip marker)"
      fi
    else
      tail -30 /tmp/ci-perm.log; fail "permission probe"
    fi
    tail -2 /tmp/ci-perm.log
    rm -rf "$PERM_ROOT"
    ;;
  *) step "permission probe: SKIPPED (windows only)" ;;
esac

# ---- 5.8 window effects probe (win32; mac has NSVisualEffectView) -----------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "effects probe (win32 Mica/Acrylic backdrops)"
    run_ztron_check "$ROOT/examples/effectprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect EFFECTS_INIT_OK \
      --expect EFFECTS_ACRYLIC_OK \
      --expect EFFECTS_MICA_OK \
      --expect EFFECTS_GLASS_OK \
      --expect EFFECTS_CLEAR_OK \
      > /tmp/ci-effects.log 2>&1 \
      || { tail -30 /tmp/ci-effects.log; fail "effects probe"; }
    tail -2 /tmp/ci-effects.log
    # Legacy accent path (Win10 pre-22H2 analog), forced via env — the
    # DWMWA_SYSTEMBACKDROP_TYPE path always wins on 22H2+ runners.
    ZTRON_EFFECTS_LEGACY=1 \
      run_ztron_check "$ROOT/examples/effectprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect EFFECTS_LEGACY_OK \
      > /tmp/ci-effects-legacy.log 2>&1 \
      || { tail -30 /tmp/ci-effects-legacy.log; fail "effects probe (legacy)"; }
    tail -2 /tmp/ci-effects-legacy.log
    ;;
  *) step "effects probe: SKIPPED (windows only)" ;;
esac

# ---- 5.9 drag-drop probe (win32; mac drop events live in host_macos.c) -------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "dragdrop probe (win32 IDropTarget bridge)"
    run_ztron_check "$ROOT/examples/dragdrop-probe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect DRAG_SEQ_OK \
      --expect DRAG_PATHS_OK \
      --expect DRAG_DISABLE_OK \
      --expect DRAG_REENABLE_OK \
      > /tmp/ci-dragdrop.log 2>&1 \
      || { tail -30 /tmp/ci-dragdrop.log; fail "dragdrop probe"; }
    tail -2 /tmp/ci-dragdrop.log
    ;;
  *) step "dragdrop probe: SKIPPED (windows only)" ;;
esac

# ---- 5.10 deep-link probe (win32; mac has LSRegisterURL + Apple Events) ------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "deeplink probe (win32 ztron:// registry claim + hot activation)"
    run_ztron_check "$ROOT/examples/deeplinkprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect DEEPLINK_REG_OK \
      --expect DEEPLINK_LINE_OK \
      --expect DEEPLINK_HOT_OK \
      > /tmp/ci-deeplink.log 2>&1 \
      || { tail -30 /tmp/ci-deeplink.log; fail "deeplink probe"; }
    tail -2 /tmp/ci-deeplink.log
    ;;
  *) step "deeplink probe: SKIPPED (windows only)" ;;
esac

# ---- 5.11 clear-browsing-data probe (win32; mac clears WKWebsiteDataStore) --
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "cleardata probe (win32 ICoreWebView2Profile2::ClearBrowsingDataAll)"
    CLEAR_ROOT="$(cygpath -m "$(mktemp -d)")"
    mkdir -p "$CLEAR_ROOT"
    ZTRON_SCHEME_ROOT="$CLEAR_ROOT" \
      run_ztron_check "$ROOT/examples/cleardataprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect CLEAR_SEED_OK \
      --expect HTTP_SEED_OK \
      --expect CLEAR_DATA_OK \
      > /tmp/ci-cleardata.log 2>&1 \
      || { tail -30 /tmp/ci-cleardata.log; fail "cleardata probe"; }
    tail -2 /tmp/ci-cleardata.log
    rm -rf "$CLEAR_ROOT"
    ;;
  *) step "cleardata probe: SKIPPED (windows only)" ;;
esac

# ---- 5.12 theme probe (win32; mac has NSAppearance + distributed notif) ------
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "theme probe (win32 set_theme + WM_SETTINGCHANGE push)"
    run_ztron_check "$ROOT/examples/themeprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect THEME_GET_OK \
      --expect THEME_SET_OK \
      --expect THEME_PUSH_OK \
      --expect THEME_RESET_OK \
      > /tmp/ci-theme.log 2>&1 \
      || { tail -30 /tmp/ci-theme.log; fail "theme probe"; }
    tail -2 /tmp/ci-theme.log
    ;;
  *) step "theme probe: SKIPPED (windows only)" ;;
esac

# ---- 5.13 notification probe (win32 WinRT toast; mac UNUserNotificationCenter) --
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    step "notif probe (win32 WinRT ToastNotification via raw vtbl)"
    run_ztron_check "$ROOT/examples/notifprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
      --expect NOTIF_SETTING_OK \
      --expect NOTIF_SEND_OK \
      --expect NOTIF_GRANTED_OK \
      --expect NOTIF_REQUEST_OK \
      > /tmp/ci-notif.log 2>&1 \
      || { tail -30 /tmp/ci-notif.log; fail "notif probe"; }
    tail -2 /tmp/ci-notif.log
    ;;
  *) step "notif probe: SKIPPED (windows only)" ;;
esac

# ---- 6. packaged spike (platform e2e; skippable) ------------------------------

# Full packaged-chain e2e per platform: exercise exactly what an end user
# gets — the packaged native chain, launcher, staged conf and the IIFE
# frontend executing inside the webview (0.3.5 shipped a white-window
# packaged app that every other check passed). Needs a GUI session: headless
# macOS runners hang at window creation, so ci.yml's macos-spike job
# downgrades failures of THIS step (grep for its marker); windows runners
# have an interactive desktop, so windows-spike treats failures as fatal.

darwin_packaged_spike() {
step "packaged spike (scaffold → build → launch .app → HELLO_OK)"
PACK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/ztron-pack-spike-XXXXXX")"
for d in inject core runtime-ffi api cli; do
  ( cd "$ROOT/packages/$d" && pnpm pack --pack-destination "$PACK_DIR" >/dev/null ) \
    || fail "pack $d tarball"
done
( cd "$PACK_DIR" && ztron init smoke-app >/dev/null ) || fail "smoke init"
# bounded: the npm install is the one long network-bound stage on the
# packaged path — hang it and the whole step goes dark (see run_bounded).
smoke_install() {
  cd "$PACK_DIR/smoke-app" \
    && npm install --no-fund --no-audit >/dev/null \
    && npm install --no-fund --no-audit --no-save "$PACK_DIR"/zturnlibs-ztron-*.tgz >/dev/null
}
run_bounded 900 smoke_install || fail "smoke npm install"
# Force the spike onto the LOCAL native chain when a full build ran
# (--skip-native may leave native/libs empty — then whatever the published
# darwin package ships gets tested, which is still a valid gate).
DARWIN_DIR="$PACK_DIR/smoke-app/node_modules/@zturnlibs/ztron-darwin-arm64"
mkdir -p "$DARWIN_DIR/native/libs"
for f in tjs ztron-host libwebview.dylib libwebview.0.12.dylib libwebview.0.12.0.dylib; do
  [ -f "$ROOT/native/libs/$f" ] && cp "$ROOT/native/libs/$f" "$DARWIN_DIR/native/libs/$f"
done
# The spike's CLI runs from the repo workspace, whose `darwin-arm64` link
# ships WITHOUT native/ — point the locators at the smoke-app's resolved
# bundled chain explicitly.
export ZTRON_TJS="$DARWIN_DIR/native/libs/tjs"
export ZTRON_HOST_BIN="$DARWIN_DIR/native/libs/ztron-host"
export ZTRON_WEBVIEW_LIB="$DARWIN_DIR/native/libs/libwebview.dylib"
pack_build() { cd "$PACK_DIR/smoke-app" && ztron build; }
run_bounded 900 pack_build > /tmp/ci-pack-build.log 2>&1 \
  || { tail -20 /tmp/ci-pack-build.log; fail "packaged build"; }
( cd "$PACK_DIR/smoke-app/dist" && ./ZtronApp.app/Contents/MacOS/ztron ) \
  > /tmp/ci-pack-launch.log 2>&1 &
LAUNCH_PID=$!
PACK_OK=0
for _ in $(seq 1 30); do
  grep -q HELLO_OK /tmp/ci-pack-launch.log && PACK_OK=1 && break
  sleep 1
done
kill "$LAUNCH_PID" 2>/dev/null || true
pkill -f "ztron-backend" 2>/dev/null || true
if [ "$PACK_OK" -ne 1 ]; then
  tail -20 /tmp/ci-pack-launch.log || true
  fail "packaged spike (HELLO_OK missing — packaged webview did not execute the frontend)"
fi
tail -2 /tmp/ci-pack-launch.log
}

# Windows counterpart: build the flat app (exercises the MSVC launcher
# compile), verify the payload, drive host+backend directly for the FULL_OK
# beacon, then prove the compiled launcher drives the same payload to
# self-exit, and build the NSIS installer when makensis is on PATH.
# The invoke key comes from the built frontend itself — a mismatched env
# key makes the backend reject every invoke silently (zero reports).
win_packaged_spike() {
local APP_DIR="$ROOT/examples/hello"
local DIST="$APP_DIR/dist/ZtronApp"
step "packaged spike (win32): ztron build -> flat app"
rm -rf "$DIST"
run_ztron_check "$APP_DIR" build > /tmp/ci-win-pack-build.log 2>&1 \
  || { tail -20 /tmp/ci-win-pack-build.log; fail "packaged build (win32)"; }
for f in ztron-launcher.exe ztron-host.exe ztron-backend.exe webview.dll \
         ffi-8.dll frontend/index.html ztron.conf.json capabilities; do
  [ -e "$DIST/$f" ] || fail "packaged payload missing $f (win32)"
done

local KEY
KEY=$(sed -n 's/.*var __KEY__ = "\([^"]*\)".*/\1/p' "$DIST/frontend/index.html" | head -1)
[ -n "$KEY" ] || fail "invoke key not found in packaged frontend (win32)"

step "packaged spike (win32): host+backend -> FULL_OK beacon"
"$DIST/ztron-host.exe" 0 > "$DIST/.ci-host.log" 2>&1 &
local HP=$!
local PORT=""
for _ in $(seq 1 50); do
  PORT=$(sed -n 's/^PORT=//p' "$DIST/.ci-host.log" | head -1)
  [ -n "$PORT" ] && break
  sleep 0.2
done
if [ -z "$PORT" ]; then
  cat "$DIST/.ci-host.log"
  fail "packaged host failed to bind (win32)"
fi
(
  cd "$DIST" \
    && ZTRON_HOST=127.0.0.1 ZTRON_HOST_PORT="$PORT" ZTRON_INVOKE_KEY="$KEY" \
       ZTRON_DEV_URL="file:///$(cygpath -m "$DIST")/frontend/index.html" \
       ZTRON_CONF="$(cat "$DIST/ztron.conf.json")" \
       ZTRON_CAPABILITIES_DIR="$(cygpath -w "$DIST/capabilities")" \
       ./ztron-backend.exe > "$DIST/.ci-backend.log" 2>&1
) &
local BP=$!
local OK=0
for _ in $(seq 1 90); do
  grep -q "SPIKE_RESULT: FULL_OK" "$DIST/.ci-backend.log" 2>/dev/null && OK=1 && break
  sleep 1
done
kill "$BP" "$HP" 2>/dev/null || true
win_sweep
if [ "$OK" -ne 1 ]; then
  tail -10 "$DIST/.ci-backend.log" 2>/dev/null || true
  fail "packaged spike (win32): FULL_OK beacon missing"
fi

step "packaged spike (win32): launcher drives the payload to self-exit"
( cd "$DIST" && ./ztron-launcher.exe ) &
local LP=$!
local DONE=0
for _ in $(seq 1 90); do
  kill -0 "$LP" 2>/dev/null || { DONE=1; break; }
  sleep 1
done
if [ "$DONE" -ne 1 ]; then
  kill -9 "$LP" 2>/dev/null || true
  win_sweep
  fail "packaged spike (win32): launcher did not self-exit (FULL_OK path)"
fi
wait "$LP" || fail "packaged spike (win32): launcher exited nonzero"
rm -f "$DIST/.ci-host.log" "$DIST/.ci-backend.log" "$DIST/.host.log"

if { [ -n "${ZTRON_MAKENSIS:-}" ] && [ -f "${ZTRON_MAKENSIS:-}" ]; } || \
   { command -v where >/dev/null 2>&1 && where makensis >/dev/null 2>&1; }; then
  step "packaged spike (win32): NSIS installer"
  local CONF="$APP_DIR/ztron.conf.json"
  cp "$CONF" "$CONF.bak"
  node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));c.bundle={targets:['nsis']};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+'\n')" "$CONF"
  if run_ztron_check "$APP_DIR" build > /tmp/ci-win-nsis-build.log 2>&1; then
    ls "$APP_DIR"/dist/nsis/*_setup.exe >/dev/null 2>&1 \
      || { mv "$CONF.bak" "$CONF"; fail "NSIS setup.exe missing (win32)"; }
  else
    tail -15 /tmp/ci-win-nsis-build.log
    mv "$CONF.bak" "$CONF"
    fail "NSIS build (win32)"
  fi
  mv "$CONF.bak" "$CONF"
else
  step "packaged spike (win32): NSIS SKIPPED (no makensis on PATH / ZTRON_MAKENSIS)"
fi

# MSI leg (GAP H20): same gated shape as NSIS — WiX3 resolves via ZTRON_WIX
# or `where candle`; light runs its full ICE validation (no -sval), so the
# build itself is the assertion. Signing is not asserted here: with no cert
# configured the bundle reports {signed:false, reason} and stays green
# (mac signMac philosophy).
if { [ -n "${ZTRON_WIX:-}" ] && [ -f "${ZTRON_WIX:-}/candle.exe" ]; } || \
   { command -v where >/dev/null 2>&1 && where candle >/dev/null 2>&1; }; then
  step "packaged spike (win32): MSI installer"
  local CONF="$APP_DIR/ztron.conf.json"
  cp "$CONF" "$CONF.bak"
  node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));c.bundle={targets:['msi']};fs.writeFileSync(process.argv[1],JSON.stringify(c,null,2)+'\n')" "$CONF"
  if run_ztron_check "$APP_DIR" build > /tmp/ci-win-msi-build.log 2>&1; then
    ls "$APP_DIR"/dist/msi/*.msi >/dev/null 2>&1 \
      || { mv "$CONF.bak" "$CONF"; fail "MSI .msi missing (win32)"; }
  else
    tail -15 /tmp/ci-win-msi-build.log
    mv "$CONF.bak" "$CONF"
    fail "MSI build (win32)"
  fi
  mv "$CONF.bak" "$CONF"
else
  step "packaged spike (win32): MSI SKIPPED (no WiX candle on PATH / ZTRON_WIX)"
fi
}

if [[ "$SKIP_PACKAGED" -eq 1 ]]; then
  step "packaged spike: SKIPPED (--skip-packaged)"
else
  case "$(uname -s)" in
    Darwin) darwin_packaged_spike ;;
    MINGW*|MSYS*|CYGWIN*) win_packaged_spike ;;
    *) step "packaged spike: SKIPPED (no packaged e2e for $(uname -s))" ;;
  esac
fi

# ---- single-instance probe (win32; GAP H22) -----------------------------------
# The packed chain end-to-end: `ztron build` produces the flat app, then the
# probe (dev chain, primary) spawns the packed launcher as a second instance
# with marker args from a different cwd, and asserts the forwarded argv/cwd
# plus the secondary's post-forward exit-0 (upstream parity). Needs the same
# GUI session as the packaged spike.
win_siprobe_spike() {
local APP_DIR="$ROOT/examples/siprobe"
local DIST="$APP_DIR/dist/ZtronApp"
step "single-instance probe (win32): ztron build -> flat app"
rm -rf "$APP_DIR/dist"
run_ztron_check "$APP_DIR" build > /tmp/ci-siprobe-build.log 2>&1 \
  || { tail -20 /tmp/ci-siprobe-build.log; fail "siprobe packaged build (win32)"; }
[ -e "$DIST/ztron-launcher.exe" ] \
  || fail "siprobe payload missing ztron-launcher.exe (win32)"
step "single-instance probe (win32): secondary argv/cwd -> primary + exit"
win_sweep
run_ztron_check "$APP_DIR" check --timeout "$SPIKE_TIMEOUT_MS" \
  --expect SIPROBE_PRIMARY_OK \
  --expect SIPROBE_SECOND_EXIT_OK \
  --expect SIPROBE_FWD_OK \
  > /tmp/ci-siprobe.log 2>&1 \
  || { tail -30 /tmp/ci-siprobe.log; win_sweep; fail "single-instance probe (win32)"; }
tail -2 /tmp/ci-siprobe.log
win_sweep
}

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    [[ "$SKIP_PACKAGED" -eq 1 ]] && step "single-instance probe: SKIPPED (--skip-packaged)" \
      || win_siprobe_spike ;;
  *) step "single-instance probe: SKIPPED (windows only)" ;;
esac

# ---- summary -----------------------------------------------------------------

# Kill any straggler dev servers / backends: the CLI's vite child holds the
# job shell's inherited stdio open, keeping headless CI steps "running"
# long after the checks finished (observed on macos runners).
pkill -f "vite" 2>/dev/null || true
pkill -f "ztron-host" 2>/dev/null || true
pkill -f "ztron check" 2>/dev/null || true
# Git Bash has no pkill — sweep the spawned processes instead (same straggler
# problem, otherwise the CI step never "finishes"). tjs/ztron-host are
# ztron-specific image names; vite runs as a bare node.exe child, so kill
# only node processes whose command line mentions vite (never blanket-kill
# node.exe — an interactive parent may itself be node).
win_sweep
if command -v taskkill >/dev/null 2>&1; then
  powershell -NoProfile -Command 'Get-CimInstance Win32_Process | Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "vite" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }' >/dev/null 2>&1 || true
fi

printf '\n\033[1;32m✓ FULL CI GREEN\033[0m  (native%s · build · units · spikes%s)\n' \
  "$([[ $SKIP_NATIVE -eq 1 ]] && echo ' [skipped]' || echo '')" \
  "$([[ $SKIP_PACKAGED -eq 1 ]] && echo '' || echo ' · packaged')"
