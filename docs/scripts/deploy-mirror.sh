#!/usr/bin/env bash
# Sync the built docs to the China mirror (spec §8.2, pluggable target).
# No-op when CHINA_MIRROR_TARGET is unset so the workflow stays green
# before the mirror is provisioned. Run from the repo root.
set -euo pipefail

if [[ -z "${CHINA_MIRROR_TARGET:-}" ]]; then
  echo "[mirror] CHINA_MIRROR_TARGET not set - skipping"
  exit 0
fi

KEY_FILE="$(mktemp)"
printf '%s\n' "${CHINA_MIRROR_SSH_KEY:?CHINA_MIRROR_SSH_KEY required when target is set}" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
trap 'rm -f "$KEY_FILE"' EXIT

rsync -av --delete -e "ssh -i $KEY_FILE -o StrictHostKeyChecking=accept-new" \
  docs/doc_build/ "$CHINA_MIRROR_TARGET"
echo "[mirror] synced to $CHINA_MIRROR_TARGET"
