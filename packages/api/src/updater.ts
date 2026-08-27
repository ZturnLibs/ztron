/** Updater API — mirrors `plugin:updater|*` (with the G3 security chain). */
import { invoke, Channel } from "./core.js";

/** Result shape mirroring the backend minisign gate (kept wire-aligned). */
export interface SignatureVerifyResult {
  ok: boolean;
  error?: "format" | "keyid-mismatch" | "message-signature" | "global-signature";
  trustedComment?: string;
  alg?: string;
}

export interface UpdateCheck {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  notes?: string;
  artifactUrl?: string;
  sha256?: string;
  /** minisign signature text over the artifact (present when published). */
  signature?: string;
}

export function check(url?: string): Promise<UpdateCheck> {
  return invoke<UpdateCheck>("plugin:updater|check", url ? { url } : {});
}

export function download(
  url: string,
  destination: string,
): Promise<{ bytes: number; path: string }> {
  return invoke("plugin:updater|download", { url, destination });
}

export function verify(
  file: string,
  sha256: string,
): Promise<{ ok: boolean; actual: string }> {
  return invoke("plugin:updater|verify", { file, sha256 });
}

/**
 * Verifies minisign signatures over inline data (no filesystem) — exposes
 * the updater's signature gate for tooling and tests.
 */
export function verifySignature(
  data: Uint8Array,
  signature: string,
  pubkey: string,
  opts: { allowLegacyPlain?: boolean } = {},
): Promise<SignatureVerifyResult> {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < data.length; i += chunk) {
    binary += String.fromCharCode(...data.subarray(i, i + chunk));
  }
  return invoke<SignatureVerifyResult>("plugin:updater|verify_signature", {
    data: btoa(binary),
    signature,
    pubkey,
    allowLegacyPlain: opts.allowLegacyPlain,
  });
}

export type UpdateProgress =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export type InstallResult =
  | { ok: false; reason: "no-update" }
  | { ok: true; bytes: number; path: string };

/**
 * Streaming download+install (Tauri `downloadAndInstall` parity): pushes
 * Started → Progress×N → Finished over a Channel while downloading, then
 * enforces sha256 AND (when a pubkey is configured) minisign verification
 * before relaunching.
 */
export async function downloadAndInstall(
  onEvent: (event: UpdateProgress) => void,
  url?: string,
): Promise<InstallResult> {
  const channel = new Channel<UpdateProgress>((msg) => onEvent(msg));
  return invoke<InstallResult>(
    "plugin:updater|install_stream",
    url ? { url, ch: channel } : { ch: channel },
  );
}

/**
 * One-shot update application (kept for back-compat): check → download →
 * both integrity gates → relaunch. `ok: false` = manifest had no newer
 * version.
 */
export function install(url?: string): Promise<InstallResult> {
  return invoke<InstallResult>("plugin:updater|install", url ? { url } : {});
}

export const updater = {
  check,
  download,
  verify,
  verifySignature,
  install,
  downloadAndInstall,
};
