/**
 * Packaging helpers for `ztron build` — pure, unit-testable pieces of the
 * app-bundle assembly (see tests/unit/cli-packaging.test.ts for the
 * contracts each function pins).
 */
import { cpSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectConfig } from "./index.js";

/**
 * Post-build frontend html shaping for packaged apps:
 *   1. vite emits `<script type="module">` but the bundle is IIFE — and
 *      module scripts fail CORS on file:// (null origin). Rewritten to
 *      classic scripts with `defer`: without it a head script executes
 *      before <body> is parsed, so any `getElementById("root")` mount
 *      crashes (React error #299) and the packaged app shows a white
 *      window.
 *   2. injects a Content-Security-Policy meta (configurable via
 *      ztron.conf.json) when the build doesn't carry one.
 */
export function finalizeFrontendHtml(html: string, csp: string): string {
  let out = html.replace(
    /<script type="module"(?:\s+crossorigin)? src="([^"]+)"><\/script>/g,
    (_, src: string) => `<script defer src="${src}"></script>`,
  );
  // vite ≥6 with output.format=iife emits the entry as a classic script
  // directly (no type="module" to rewrite) — still needs defer, or it
  // executes before <body> is parsed and every `getElementById("root")`
  // mount crashes (React error #299). Only relative-src bundle tags are
  // touched; the inline bootstrap and user-authored scripts stay as-is.
  out = out.replace(
    /<script([^>]*\ssrc="\.\/[^"]*")([^>]*)><\/script>/g,
    (m, pre: string, post: string) =>
      /\bdefer\b/.test(m) ? m : `<script defer${pre}${post}></script>`,
  );
  if (!/<meta[^>]+http-equiv="?Content-Security-Policy"?/i.test(out)) {
    out = out.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`,
    );
  }
  return out;
}

/**
 * Launcher: starts ztron-host, reads its PORT, then runs the backend.
 *
 * The backend lives in RESOURCES (tjs-compiled binaries fail codesign
 * strict validation, so they stay outside the app's main signature chain).
 * Project config and capabilities are staged next to it by
 * stageAppResources; both are exported only when present so backends that
 * ignore them (vanilla template) are unaffected.
 */
export function launcherScript(invokeKey: string): string {
  return `#!/bin/sh
DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(dirname "$DIR")"
RES="$APP_ROOT/Resources"
KEY="${invokeKey}"
HOST_LOG="$RES/.host.log"

"$DIR/ztron-host" 0 > "$HOST_LOG" 2>&1 &
HOST_PID=$!

PORT=""
i=0
while [ -z "$PORT" ] && [ $i -lt 100 ]; do
  PORT=$(sed -n 's/^PORT=//p' "$HOST_LOG" | head -1)
  [ -z "$PORT" ] && { sleep 0.1; i=$((i + 1)); }
done
if [ -z "$PORT" ]; then
  echo "ztron: host failed to start" >&2
  cat "$HOST_LOG" >&2
  exit 1
fi

# forward the declarative config + capabilities the backend reads at boot
set -a
[ -f "$RES/ztron.conf.json" ] && ZTRON_CONF="$(cat "$RES/ztron.conf.json")"
[ -d "$RES/capabilities" ] && ZTRON_CAPABILITIES_DIR="$RES/capabilities"
set +a

ZTRON_HOST=127.0.0.1 ZTRON_HOST_PORT="$PORT" ZTRON_INVOKE_KEY="$KEY" \\
ZTRON_DEV_URL="file://$RES/frontend/index.html" \\
"$RES/ztron-backend"

kill "$HOST_PID" 2>/dev/null
`;
}

/**
 * Locates the C launcher source. The committed copy under packages/cli is
 * what ships in the npm tarball (files: ["dist", "native"]); the repo-root
 * native/host copy remains a fallback for workspace builds. The two are
 * kept identical by tests/unit/cli-packaging.test.ts.
 */
export function findLauncherSource(): string | null {
  const packageLocal = fileURLToPath(
    new URL("../native/host/launcher_macos.c", import.meta.url),
  );
  if (existsSync(packageLocal)) return packageLocal;
  const repoRoot = fileURLToPath(
    new URL("../../../native/host/launcher_macos.c", import.meta.url),
  );
  if (existsSync(repoRoot)) return repoRoot;
  return null;
}

/** Same two-copy convention as findLauncherSource, for the Windows launcher. */
export function findWindowsLauncherSource(): string | null {
  const packageLocal = fileURLToPath(
    new URL("../native/host/launcher_windows.c", import.meta.url),
  );
  if (existsSync(packageLocal)) return packageLocal;
  const repoRoot = fileURLToPath(
    new URL("../../../native/host/launcher_windows.c", import.meta.url),
  );
  if (existsSync(repoRoot)) return repoRoot;
  return null;
}

/**
 * Last-resort Windows launcher when MSVC is unavailable on the packaging
 * machine: a generated .cmd doing the same host→PORT→backend dance in
 * batch. Ships alongside the app as ztron-launcher.cmd (NSIS shortcuts
 * point at whichever launcher exists). Best-effort — the compiled exe is
 * the real launcher (no console flash, reliable host cleanup).
 */
export function launcherCmdScript(invokeKey: string): string {
  return `@echo off
setlocal EnableDelayedExpansion
set "DIR=%~dp0"
set "LOG=%DIR%.host.log"
start "" /b "%DIR%ztron-host.exe" 0 > "%LOG%" 2>&1
set "PORT="
for /l %%i in (1,1,100) do (
  if not defined PORT (
    for /f "usebackq tokens=1,* delims==" %%a in (\`type "%LOG%" 2^>nul\`) do (
      if /i "%%a"=="PORT" set "PORT=%%b"
    )
    if not defined PORT ping -n 1 -w 100 127.0.0.1 >nul
  )
)
if not defined PORT (
  echo ztron: host failed to start ^(see %LOG%^)
  exit /b 1
)
set "ZTRON_HOST=127.0.0.1"
set "ZTRON_HOST_PORT=!PORT!"
set "ZTRON_INVOKE_KEY=${invokeKey}"
set "ZTRON_DEV_URL=file:///%DIR:\\=/%/frontend/index.html"
if exist "%DIR%ztron.conf.json" (
  set "ZTRON_CONF="
  for /f "usebackq delims=" %%z in ("%DIR%ztron.conf.json") do set "ZTRON_CONF=!ZTRON_CONF!%%z"
)
if exist "%DIR%capabilities\\" set "ZTRON_CAPABILITIES_DIR=%DIR%capabilities"
"%DIR%ztron-backend.exe"
taskkill /f /im ztron-host.exe >nul 2>&1
`;
}

/**
 * Stages the backend's boot inputs into the bundle's Resources: the
 * project config (windows/identifier/…) and the capabilities directory.
 * Without these the packaged app silently loses every declared window and
 * falls back to the host's default window.
 */
export function stageAppResources(
  resDir: string,
  conf: ProjectConfig,
  capabilitiesDir: string | null,
): void {
  writeFileSync(
    join(resDir, "ztron.conf.json"),
    JSON.stringify(conf, null, 2) + "\n",
  );
  if (capabilitiesDir && existsSync(capabilitiesDir)) {
    cpSync(capabilitiesDir, join(resDir, "capabilities"), {
      recursive: true,
    });
  }
}
