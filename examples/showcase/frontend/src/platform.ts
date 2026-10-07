/**
 * 前端平台判定（同步、零依赖）。
 * WebView 里 navigator.platform 即宿主平台：WebView2="Win32"、
 * macOS WKWebView="MacIntel"、Linux WebKitGTK 含 "linux"。
 * 注意不能用 tjs.platform（Windows 上是 undefined）；后端侧用
 * @zturnlibs/ztron-core 的 detectPlatform()。
 */
export type Platform = "windows" | "macos" | "linux";

let cached: Platform | null = null;

export function getPlatform(): Platform {
  if (cached) return cached;
  const p = (navigator.platform || navigator.userAgent || "").toLowerCase();
  if (p.includes("mac")) cached = "macos";
  else if (p.includes("linux")) cached = "linux";
  else cached = "windows";
  return cached;
}

export function isMac(): boolean {
  return getPlatform() === "macos";
}
