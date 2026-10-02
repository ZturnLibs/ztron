#!/usr/bin/env bash
# Sync the official @txikijs/types declarations from the vendored txiki.js
# checkout into packages/tjs-types/src, so the published types always match
# the tjs runtime ztron actually builds (native/txiki.js is the source of
# truth, not the npm-published @txikijs/types which may lag the checkout).
#
# ztron's own additions (web-globals.d.ts) live in the same directory and
# are never touched by this script.
#
# Usage: scripts/sync-tjs-types.sh   (run after updating native/txiki.js)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/native/txiki.js/types/src"
DST="$ROOT/packages/tjs-types/src"

if [ ! -d "$SRC" ]; then
  echo "error: $SRC not found — is native/txiki.js vendored?" >&2
  exit 1
fi

mkdir -p "$DST"
for f in "$SRC"/*.d.ts; do
  cp "$f" "$DST/"
done

TJS_VER="$(git -C "$ROOT/native/txiki.js" describe --tags 2>/dev/null || echo unknown)"
echo "synced txiki.js types ($TJS_VER) -> packages/tjs-types/src"
