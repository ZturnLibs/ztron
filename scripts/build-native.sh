#!/usr/bin/env bash
# Build the M0 native toolchain for the current platform:
#   1. txiki.js `tjs` runtime  -> native/libs/tjs (built in native/txiki.js/build/tjs)
#   2. webview shared library  -> native/libs/libwebview.<ext>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE="$ROOT/native"

echo "==> [1/2] building txiki.js (tjs)"
# Pinned upstream refs — unpinned `--depth 1` master clones drift between
# builds, and a drifted webview build shipped in 0.3.5 with a libwebview
# that never executed page scripts (silent white-window packaged apps).
# Bump a ref ONLY together with scripts/patches/webview-local.patch and a
# full packaged-app run (scripts/ci.sh packaged spike).
TJS_REF="c3587a729f1847beadd35ad63fc1bc9eab370b89"
WEBVIEW_REF="cbbdee44afff22867de9fd88a9fc8350d9bdd399"

if [ ! -d "$NATIVE/txiki.js" ]; then
  git clone --filter=blob:none --no-checkout \
    https://github.com/saghul/txiki.js.git "$NATIVE/txiki.js"
  git -C "$NATIVE/txiki.js" checkout "$TJS_REF"
fi
(
  cd "$NATIVE/txiki.js"
  git submodule update --init --recursive
  cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_WITH_WASM=OFF
  cmake --build build -j "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
)

echo "==> [2/2] building webview shared library"
if [ ! -d "$NATIVE/webview" ]; then
  git clone --filter=blob:none --no-checkout \
    https://github.com/webview/webview.git "$NATIVE/webview"
  git -C "$NATIVE/webview" checkout "$WEBVIEW_REF"
fi
(
  cd "$NATIVE/webview"
  # Local patches (scheme handler, deplete deadlock fix) — MANDATORY. A
  # silent `|| echo` fallback here shipped 0.3.5's broken libwebview, so
  # patch failure against the pinned ref is fatal, never skipped.
  if [ -f "$ROOT/scripts/patches/webview-local.patch" ]; then
    if git apply --check "$ROOT/scripts/patches/webview-local.patch" 2>/dev/null; then
      git apply "$ROOT/scripts/patches/webview-local.patch"
      echo "    applied webview-local.patch"
    elif grep -q "webview_set_scheme_handler" \
         "$NATIVE/webview/core/include/webview/api.h"; then
      echo "    webview-local.patch already applied"
    else
      echo "    FATAL: webview-local.patch does not apply to the pinned webview ($WEBVIEW_REF)." >&2
      echo "    Update scripts/patches/webview-local.patch, or bump WEBVIEW_REF and re-run the packaged spike." >&2
      exit 1
    fi
  fi
  # Build only what the chain needs: upstream's top-level defaults enable
  # amalgamation (requires python3 + clang-format), docs (doxygen), tests,
  # examples and format/tidy checks (clang-format + clang-tidy, REQUIRED on
  # CI) — none of which exist on CI runners / CLT-only contributor machines
  # (2026-09-07 v0.3.2 release failures). Shared library is the deliverable.
  cmake -B build -DCMAKE_BUILD_TYPE=Release \
    -DWEBVIEW_BUILD=ON -DWEBVIEW_BUILD_SHARED_LIBRARY=ON \
    -DWEBVIEW_ENABLE_CHECKS=OFF -DWEBVIEW_BUILD_AMALGAMATION=OFF \
    -DWEBVIEW_BUILD_DOCS=OFF -DWEBVIEW_BUILD_EXAMPLES=OFF -DWEBVIEW_BUILD_TESTS=OFF \
    ${WEBVIEW_CMAKE_ARGS:-}
  cmake --build build
)

mkdir -p "$NATIVE/libs"
case "$(uname -s)" in
  Darwin) cp "$NATIVE/webview/build/core/libwebview.dylib" "$NATIVE/libs/" ;;
  Linux)  cp "$NATIVE/webview/build/core/libwebview.so" "$NATIVE/libs/" ;;
  *)      cp "$NATIVE/webview/build/core/webview.dll" "$NATIVE/libs/" ;;
esac

echo "==> [3/3] building ztron-host (cross-platform: host.c + host_platform.<plat>.c)"
# macOS: embed an Info.plist so ATS allows http://127.0.0.1 (dev server)
case "$(uname -s)" in
  Darwin)
    cc -Wall -Werror "$NATIVE/host/host.c" "$NATIVE/host/host_macos.c" \
      -o "$NATIVE/libs/ztron-host" \
      -I "$NATIVE/webview/core/include" \
      -L "$NATIVE/libs" -lwebview \
      -pthread -Wl,-rpath,@loader_path \
      -Wl,-sectcreate,__TEXT,__info_plist,"$NATIVE/host/Info.plist" \
      -framework Foundation -framework AppKit -framework Carbon -framework UserNotifications
    # Mach-O app launcher (signing-friendly main executable for .app builds;
    # `ztron build` recompiles it with the real invoke key baked in).
    cc -Wall -Werror -O2 "$NATIVE/host/launcher_macos.c" \
      -o "$NATIVE/libs/ztron-launcher" \
      -framework Foundation
    ;;
  Linux)
    cc -Wall -Werror "$NATIVE/host/host.c" "$NATIVE/host/host_linux.c" \
      -o "$NATIVE/libs/ztron-host" \
      -I "$NATIVE/webview/core/include" \
      -L "$NATIVE/libs" -lwebview \
      $(pkg-config --cflags --libs gtk+-3.0 webkit2gtk-4.1) \
      -pthread -Wl,-rpath,'$ORIGIN'
    ;;
  *)
    cl -nologo "$NATIVE/host/host.c" "$NATIVE/host/host_windows.c" \
      /I "$NATIVE/webview/core/include" \
      /link "$NATIVE/libs/webview.lib" user32.lib shell32.lib \
      comdlg32.lib ws2_32.lib /OUT:"$NATIVE/libs/ztron-host.exe"
    ;;
esac

# Collect tjs into native/libs/ so it is the single artifacts directory
# (docs, `ztron init` guidance, and the doctor fixture all expect libs/tjs).
[ -f "$NATIVE/txiki.js/build/tjs" ] && cp "$NATIVE/txiki.js/build/tjs" "$NATIVE/libs/"

echo "==> done. tjs: $NATIVE/libs/tjs, host: $NATIVE/libs/ztron-host"
