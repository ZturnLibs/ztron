/**
 * Webview permission interception (tauri 2.12 `on_permission_request`,
 * commit 382dd6ccc). Kinds mirror `tauri_runtime::webview_permissions::
 * PermissionKind` Display strings verbatim.
 *
 * Platform support matrix (upstream parity):
 * - macOS: camera/microphone (WKUIDelegate media capture, macOS 12+).
 * - Windows: broad WebView2 PermissionRequested coverage (backend wiring
 *   pending — requests simply don't fire yet).
 * - Linux: webkitgtk permission-request signals (backend wiring pending).
 * Unrequested kinds never surface; handlers must tolerate "other".
 */

/** What a webview asked permission for (kebab-case, upstream verbatim). */
export type PermissionKind =
  | "microphone"
  | "camera"
  | "geolocation"
  | "notifications"
  | "clipboard-read"
  | "display-capture"
  | "midi"
  | "sensors"
  | "media-key-system-access"
  | "local-fonts"
  | "window-management"
  | "pointer-lock"
  | "automatic-downloads"
  | "file-system-access"
  | "autoplay"
  | "other";

/** The decision handed back to the webview. "default" defers to the
 *  platform's own behavior (WKUIDelegate Prompt). */
export type PermissionResponse = "allow" | "deny" | "default";

/** Delivered to an {@linkcode App.onPermissionRequest} handler. Call
 *  {@linkcode PermissionRequest.respond} exactly once (unanswered requests
 *  stay pending in the webview — same as upstream). */
export interface PermissionRequest {
  kind: PermissionKind;
  /** The security origin that triggered the request. */
  url: string;
  /** The webview (window label) that triggered the request. */
  label: string;
  respond(response: PermissionResponse): void;
}

/** Wire shape from the host line pump (host -> backend JSON line). */
export interface PermissionWireRequest {
  id: number;
  kind: PermissionKind;
  url: string;
  label: string;
}
