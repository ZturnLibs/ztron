#!/usr/bin/env bash
# Build the M0 native toolchain for the current platform:
#   1. txiki.js `tjs` runtime  -> native/libs/tjs (built in native/txiki.js/build/tjs)
#   2. webview shared library  -> native/libs/libwebview.<ext>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE="$ROOT/native"

echo "==> [1/2] building txiki.js (tjs)"
if [ ! -d "$NATIVE/txiki.js" ]; then
  git clone --depth 1 --recursive https://github.com/saghul/txiki.js.git "$NATIVE/txiki.js"
fi
(
  cd "$NATIVE/txiki.js"
  git submodule update --init --recursive
  cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_WITH_WASM=OFF
  cmake --build build -j "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
)

echo "==> [2/2] building webview shared library"
if [ ! -d "$NATIVE/webview" ]; then
  git clone --depth 1 https://github.com/webview/webview.git "$NATIVE/webview"
fi
(
  cd "$NATIVE/webview"
  # Local patches (scheme handler, deplete deadlock fix) — idempotent apply.
  if [ -f "$ROOT/scripts/patches/webview-local.patch" ]; then
    git apply --check "$ROOT/scripts/patches/webview-local.patch" 2>/dev/null \
      && git apply "$ROOT/scripts/patches/webview-local.patch" \
      && echo "    applied webview-local.patch" \
      || echo "    webview-local.patch already applied (or not needed)"
  fi
  cmake -B build -DCMAKE_BUILD_TYPE=Release \
    -DWEBVIEW_BUILD=ON -DWEBVIEW_BUILD_SHARED_LIBRARY=ON \
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
