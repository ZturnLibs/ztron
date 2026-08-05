#!/usr/bin/env bash
# Build the M0 native toolchain for the current platform:
#   1. txiki.js `tjs` runtime  -> native/txiki.js/build/tjs
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
  cmake -B build -DCMAKE_BUILD_TYPE=Release \
    -DWEBVIEW_BUILD=ON -DWEBVIEW_BUILD_SHARED_LIBRARY=ON
  cmake --build build
)

mkdir -p "$NATIVE/libs"
case "$(uname -s)" in
  Darwin) cp "$NATIVE/webview/build/core/libwebview.dylib" "$NATIVE/libs/" ;;
  Linux)  cp "$NATIVE/webview/build/core/libwebview.so" "$NATIVE/libs/" ;;
  *)      cp "$NATIVE/webview/build/core/webview.dll" "$NATIVE/libs/" ;;
esac

echo "==> [3/3] building ztron-host (webview + socket bridge)"
cc "$NATIVE/host/host.c" -o "$NATIVE/libs/ztron-host" \
  -I "$NATIVE/webview/core/include" \
  -L "$NATIVE/libs" -lwebview \
  -pthread

echo "==> done. tjs: $NATIVE/txiki.js/build/tjs, lib: $NATIVE/libs/, host: $NATIVE/libs/ztron-host"
