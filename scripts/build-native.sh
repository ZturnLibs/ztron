#!/usr/bin/env bash
# Build the M0 native toolchain for the current platform:
#   1. txiki.js `tjs` runtime  -> native/libs/tjs (built in native/txiki.js/build/tjs)
#   2. webview shared library  -> native/libs/libwebview.<ext>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NATIVE="$ROOT/native"

# Install an artifact into native/libs. That tree is shared with running apps
# (junctioned projects keep loaded artifacts locked): skip the copy when the
# bits already match, and on a genuine lock keep the existing copy with a
# warning instead of failing the whole build.
install_lib_artifact() { # <src> <dst>
  local src="$1" dst="$2"
  if [ -f "$dst" ] && cmp -s "$src" "$dst"; then return 0; fi
  if cp "$src" "$dst" 2>/dev/null; then return 0; fi
  if [ -f "$dst" ]; then
    echo "WARN: ${dst##*/} is locked by a running app; keeping the existing copy" >&2
  else
    echo "FATAL: cannot install ${dst##*/} (copy failed and no existing copy)" >&2
    exit 1
  fi
}

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
  # BUILD_WITH_FFI must stay ON (txiki default): @zturnlibs/ztron-runtime-ffi
  # drives the webview through tjs:ffi — an ffi-less tjs kills every app at
  # startup. On Windows libffi comes from vcpkg: its `libffi` port exports
  # the `unofficial-libffi` config txiki's CMakeLists requires.
  VCPKG_ARGS=""
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
      VCPKG_DIR="${VCPKG_ROOT:-/c/vcpkg}"
      if [ ! -f "$VCPKG_DIR/scripts/buildsystems/vcpkg.cmake" ]; then
        echo "FATAL: tjs requires libffi (tjs:ffi). Install vcpkg and run:" >&2
        echo "  git clone https://github.com/microsoft/vcpkg C:/vcpkg && C:/vcpkg/bootstrap-vcpkg.bat" >&2
        echo "  C:/vcpkg/vcpkg install libffi:x64-windows" >&2
        echo "(or point VCPKG_ROOT at an existing checkout)" >&2
        exit 1
      fi
      VCPKG_ARGS="-DCMAKE_TOOLCHAIN_FILE=$(cygpath -w "$VCPKG_DIR/scripts/buildsystems/vcpkg.cmake") -DVCPKG_TARGET_TRIPLET=x64-windows"
      ;;
  esac
  # shellcheck disable=SC2086 — VCPKG_ARGS is intentionally word-split
  cmake -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_WITH_WASM=OFF $VCPKG_ARGS
  # --config Release: no-op on single-config generators, required on MSVC
  # multi-config (Visual Studio generator) where the binary lands in
  # build/Release/ rather than build/.
  cmake --build build --config Release -j "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
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
  # --config Release matters on MSVC multi-config generators: without it the
  # default Debug is built (webviewd.dll) and the Release dll the case below
  # copies is left stale. No-op on single-config generators.
  cmake --build build --config Release
)

mkdir -p "$NATIVE/libs"
case "$(uname -s)" in
  Darwin) install_lib_artifact "$NATIVE/webview/build/core/libwebview.dylib" "$NATIVE/libs/libwebview.dylib" ;;
  Linux)  install_lib_artifact "$NATIVE/webview/build/core/libwebview.so" "$NATIVE/libs/libwebview.so" ;;
  *)
    # MSVC multi-config puts artifacts under build/core/Release/; single-config
    # generators (Ninja) put them directly under build/core/.
    for cand in \
      "$NATIVE/webview/build/core/Release/webview.dll" \
      "$NATIVE/webview/build/core/webview.dll"; do
      if [ -f "$cand" ]; then install_lib_artifact "$cand" "$NATIVE/libs/webview.dll"; break; fi
    done
    # import library — required to link ztron-host below
    for cand in \
      "$NATIVE/webview/build/core/Release/webview.lib" \
      "$NATIVE/webview/build/core/webview.lib"; do
      if [ -f "$cand" ]; then install_lib_artifact "$cand" "$NATIVE/libs/webview.lib"; break; fi
    done
    ;;
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
    # Windows (MSVC): Git Bash does not inherit the VS developer environment,
    # so locate the toolchain with vswhere and drive cl through a batch
    # wrapper that calls vcvars64 first. Requires Git Bash / MSYS (cygpath).
    if ! command -v cygpath >/dev/null 2>&1; then
      echo "FATAL: Windows build requires Git Bash or MSYS2 (cygpath not found)." >&2
      exit 1
    fi
    VSWHERE="C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe"
    VSDIR="$("$VSWHERE" -latest -products '*' \
      -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 \
      -property installationPath | tr -d '\r')"
    if [ -z "$VSDIR" ]; then
      echo "FATAL: MSVC C++ toolchain not found — install Visual Studio Build Tools with the 'Desktop development with C++' workload." >&2
      exit 1
    fi
    BUILD_CMD="$NATIVE/.build-host-windows.cmd"
    # WebView2 SDK headers fetched by the webview build stage (FetchContent):
    # host_windows.c includes WebView2.h for ICoreWebView2Controller2
    # (put_DefaultBackgroundColor behind the Mica/Acrylic backdrops).
    SDK_INC="$NATIVE/webview/build/_deps/microsoft_web_webview2-src/build/native/include"
    if [ ! -f "$SDK_INC/WebView2.h" ]; then
      echo "FATAL: WebView2 SDK headers missing at $SDK_INC —" >&2
      echo "the webview build stage fetches them; run it before the host build." >&2
      exit 1
    fi
    {
      echo '@echo off'
      # Anchor to native/host so cl drops its .obj files beside the sources
      # (cl always writes them to the CWD — without this they land in
      # whatever directory the batch was invoked from, e.g. the repo root).
      echo 'cd /d "%~dp0host" || exit /b 1'
      # NOTE: do NOT redirect this call to >nul — vcvars64 resolves internal
      # helper paths via its own console output on some toolchains and fails
      # with "path not found" when stdout is nul (observed: VSBT 17.14).
      echo "call \"$VSDIR\\VC\\Auxiliary\\Build\\vcvars64.bat\" || exit /b 1"
      echo "cl -nologo /D_CRT_SECURE_NO_WARNINGS \"$(cygpath -w "$NATIVE/host/host.c")\" \"$(cygpath -w "$NATIVE/host/host_windows.c")\" /I \"$(cygpath -w "$NATIVE/webview/core/include")\" /I \"$(cygpath -w "$SDK_INC")\" /link \"$(cygpath -w "$NATIVE/libs/webview.lib")\" user32.lib shell32.lib comdlg32.lib ws2_32.lib gdi32.lib advapi32.lib comctl32.lib ole32.lib uuid.lib shcore.lib gdiplus.lib dwmapi.lib runtimeobject.lib /OUT:\"$(cygpath -w "$NATIVE/libs/ztron-host.exe")\" || exit /b 1"
    } > "$BUILD_CMD"
    cmd //c "$(cygpath -w "$BUILD_CMD")"
    RC=$?
    rm -f "$BUILD_CMD"
    if [ $RC -ne 0 ]; then
      echo "FATAL: ztron-host build failed (cl exit $RC)" >&2
      exit 1
    fi
    ;;
esac

# Collect tjs into native/libs/ so it is the single artifacts directory
# (docs, `ztron init` guidance, and the doctor fixture all expect libs/tjs).
# MSVC multi-config outputs build/Release/tjs.exe; single-config outputs
# build/tjs.
for tjs_bin in \
  "$NATIVE/txiki.js/build/tjs" \
  "$NATIVE/txiki.js/build/Release/tjs.exe"; do
  if [ -f "$tjs_bin" ]; then
    install_lib_artifact "$tjs_bin" "$NATIVE/libs/$(basename "$tjs_bin")"
    break
  fi
done

# Windows tjs links libffi dynamically (vcpkg): ship the DLL beside the exe
# or the runtime cannot load at all.
FFI_DLL="${VCPKG_ROOT:-/c/vcpkg}/installed/x64-windows/bin/ffi-8.dll"
[ -f "$FFI_DLL" ] && install_lib_artifact "$FFI_DLL" "$NATIVE/libs/ffi-8.dll"

echo "==> done. tjs: $NATIVE/libs/tjs, host: $NATIVE/libs/ztron-host"
