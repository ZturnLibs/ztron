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
#
# Any step failing aborts with a clear marker. Exit 0 = whole chain green.
#
# Usage:
#   bash scripts/ci.sh                 # full chain
#   bash scripts/ci.sh --skip-native   # reuse existing native build
#   bash scripts/ci.sh --spike-timeout 150000
#
# Environment:
#   ZTRON_TJS   path to the txiki tjs binary (required; see find below)

set -euo pipefail

ROOT="$(cd "$(dirname "$BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SKIP_NATIVE=0
SPIKE_TIMEOUT_MS=120000
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-native) SKIP_NATIVE=1 ;;
    --spike-timeout) SPIKE_TIMEOUT_MS="$2"; shift ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ FAILED at: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- 0. preflight ------------------------------------------------------------

step "preflight: tjs runtime"
TJS="${ZTRON_TJS:-$ROOT/native/txiki.js/build/tjs}"
if [[ ! -x "$TJS" ]]; then
  echo "tjs not found at $TJS (build txiki.js first or set ZTRON_TJS)" >&2
  exit 1
fi
echo "tjs: $TJS"

# Stale state from previous runs would poison persisted-scope / rotation
# determinism; wipe the known artifacts.
pkill -9 -f ztron-host 2>/dev/null || true
rm -rf ~/ztron-persisted-spike "${TMPDIR}ztron_persisted_scope.json" || true

# ---- 1. native ---------------------------------------------------------------

if [[ "$SKIP_NATIVE" -eq 0 ]]; then
  step "native build (webview lib + host + launcher)"
  bash scripts/build-native.sh || fail "native build"
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
npm run build >/dev/null || fail "npm run build"

# ---- 3. unit tests -----------------------------------------------------------

step "unit tests (node --test)"
npm test >/tmp/ci-unit.log 2>&1 || { tail -30 /tmp/ci-unit.log; fail "unit tests"; }
tail -6 /tmp/ci-unit.log

# ---- 4. hello spike ----------------------------------------------------------

# `timeout` (GNU coreutils) is absent on stock macOS runners — the spike's
# own --timeout already bounds the run; wrap with timeout only when present.
run_ztron_check() {
  # $1 = example dir, rest = ztron args. GNU timeout guards only when both
  # it and a real bin exist (functions cannot be exec'd by timeout).
  local dir="$1"; shift
  if [ -n "$ZTRON_BIN" ] && command -v timeout >/dev/null 2>&1; then
    ( cd "$dir" && ZTRON_TJS="$TJS" timeout $(( SPIKE_TIMEOUT_MS / 1000 + 30 )) \
        "$ZTRON_BIN" "$@" )
  else
    ( cd "$dir" && ZTRON_TJS="$TJS" ztron "$@" )
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
run_ztron_check "$ROOT/examples/multiwin" check --timeout "$SPIKE_TIMEOUT_MS" \
    --expect SECOND_WINDOW_OK --expect SECOND_OPS_OK --expect STRESS_OK \
  > /tmp/ci-multiwin.log 2>&1 \
  || { tail -30 /tmp/ci-multiwin.log; fail "multiwin ztron check"; }

step "menuprobe spike (ztron check --expect)"
run_ztron_check "$ROOT/examples/menuprobe" check --timeout "$SPIKE_TIMEOUT_MS" \
    --expect MENU_V2_OK \
    --expect TRAY_V2_OK \
    --expect LOCALHOST_OK \
    > /tmp/ci-menuprobe.log 2>&1 \
  || { tail -30 /tmp/ci-menuprobe.log; fail "menuprobe ztron check"; }
tail -2 /tmp/ci-multiwin.log

# ---- summary -----------------------------------------------------------------

# Kill any straggler dev servers / backends: the CLI's vite child holds the
# job shell's inherited stdio open, keeping headless CI steps "running"
# long after the checks finished (observed on macos runners).
pkill -f "vite" 2>/dev/null || true
pkill -f "ztron-host" 2>/dev/null || true
pkill -f "ztron check" 2>/dev/null || true

printf '\n\033[1;32m✓ FULL CI GREEN\033[0m  (native%s · build · units · hello · multiwin)\n' \
  "$([[ $SKIP_NATIVE -eq 1 ]] && echo ' [skipped]' || echo '')"
