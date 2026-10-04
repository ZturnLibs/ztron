/*
 * host_windows.c — Windows platform implementation (Win32 + WebView2).
 *
 * Implements `zt_platform` for host.c. All native features reach the native
 * window (HWND) / WebView2 controller via `webview_get_native_handle`:
 *
 *   WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW        -> HWND
 *   WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER -> ICoreWebView2Controller*
 *
 * The underlying windowing/WebView come from webview/webview; this file only
 * adds platform-specific behaviours (window states, tray, menus, dialogs).
 *
 * Build (Windows, with webview/webview built for Win32):
 *   cl host.c host_windows.c /I <webview include> webview.lib
 *      user32.lib shell32.lib comdlg32.lib ws2_32.lib
 */
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h>
#ifndef _CRT_SECURE_NO_WARNINGS
#define _CRT_SECURE_NO_WARNINGS
#endif
#include <windows.h>
#include <commctrl.h>
#include <shellscalingapi.h>
#include <dwmapi.h>
/* IDropTarget / RegisterDragDrop for the file-drop bridge (GAP H8). */
#include <ole2.h>
#include <shellapi.h> /* DragQueryFileW (CF_HDROP extraction) */
#include <shlobj_core.h> /* DROPFILES layout (surprising home, not shellapi) */
#include <roapi.h>     /* RoInitialize / RoGetActivationFactory (WinRT) */
#include <winstring.h> /* HSTRING helpers */
/* Fetched by the webview build stage (build/_deps): COREWEBVIEW2_COLOR +
   ICoreWebView2Controller2 for the transparent default background the
   backdrops below need to be visible through (GAP H7). */
#include "WebView2.h"

#include "host_platform.h"


/* ---- JSON reply helpers ---- */

void zt_reply_query(int req_id, const char *json_value) {
  char buf[65536];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":%s}",
           req_id, json_value);
  zt_send_line(buf);
}
void zt_reply_string(int req_id, const char *s) {
  size_t need = strlen(s) * 2 + 64;
  char *buf = (char *)malloc(need);
  if (!buf) {
    zt_reply_null(req_id);
    return;
  }
  char *p = buf;
  char *end = buf + need - 1;
  p += sprintf(p,
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":\"",
               req_id);
  for (; *s && p < end; s++) {
    if (*s == '"' || *s == '\\') *p++ = '\\';
    else if (*s == '\n') { *p++ = '\\'; *p++ = 'n'; continue; }
    else if (*s == '\r') { *p++ = '\\'; *p++ = 'r'; continue; }
    else if (*s == '\t') { *p++ = '\\'; *p++ = 't'; continue; }
    else if ((unsigned char)*s < 0x20) { *p++ = '?'; continue; }
    *p++ = *s;
  }
  *p++ = '"';
  *p++ = '}';
  *p = '\0';
  zt_send_line(buf);
  free(buf);
}
void zt_reply_null(int req_id) { zt_reply_query(req_id, "null"); }

/* JSON-escape a C string into out (quotes, backslash, \n \r \t, ctrl chars). */
static size_t zt_json_escape(const char *s, char *out, size_t outsz) {
  size_t n = 0;
  for (; *s && n + 6 < outsz; s++) {
    if (*s == '"' || *s == '\\') {
      out[n++] = '\\';
      out[n++] = *s;
    } else if (*s == '\n') {
      out[n++] = '\\';
      out[n++] = 'n';
    } else if (*s == '\r') {
      out[n++] = '\\';
      out[n++] = 'r';
    } else if (*s == '\t') {
      out[n++] = '\\';
      out[n++] = 't';
    } else if ((unsigned char)*s < 0x20) {
      out[n++] = '?';
    } else {
      out[n++] = *s;
    }
  }
  out[n] = '\0';
  return n;
}

/* UTF-8 narrow string -> wide for NOTIFYICONDATAW / menus */
static void to_wide(const char *s, wchar_t *out, int n) {
  MultiByteToWideChar(CP_UTF8, 0, s, -1, out, n);
}

/* ---- window states ---- */

static HWND zt_hwnd(void) {
  return (HWND)webview_get_native_handle(zt_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

/* The HWND of the webview a message was routed to (host.c resolves
   m->win_label before dispatching). Window ops must act on this handle —
   not always on main — or per-window ops hit the wrong window. */
static HWND zt_hwnd_for(webview_t wv) {
  if (!wv) wv = zt_w;
  return (HWND)webview_get_native_handle(wv, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

/* Per-window state honored via WM_GETMINMAXINFO / WM_CLOSE (window_set_min/
   max_size, set_prevent_close; 0 = unconstrained/off). Keyed by HWND so
   secondary windows carry their own constraints (mac parity: per-label
   state); dropped on WM_DESTROY. */
typedef struct {
  HWND hwnd;
  int min_w, min_h, max_w, max_h;
  int prevent_close; /* WM_CLOSE intercepted -> "close" event, no destroy */
  int drop_disabled; /* set_file_drop_enabled=0 gate (default enabled) */
} WinState;
#define MAX_WIN_STATES 16
static WinState g_winstates[MAX_WIN_STATES];

static WinState *win_state(HWND w) {
  int i, slot = -1;
  if (!w) return NULL;
  for (i = 0; i < MAX_WIN_STATES; i++) {
    if (g_winstates[i].hwnd == w) return &g_winstates[i];
    if (slot < 0 && !g_winstates[i].hwnd) slot = i;
  }
  if (slot < 0) return NULL;
  memset(&g_winstates[slot], 0, sizeof(g_winstates[slot]));
  g_winstates[slot].hwnd = w;
  return &g_winstates[slot];
}

static void win_state_drop(HWND w) {
  int i;
  for (i = 0; i < MAX_WIN_STATES; i++)
    if (g_winstates[i].hwnd == w)
      memset(&g_winstates[i], 0, sizeof(g_winstates[i]));
}

/* ---- webview permission interception (GAP H6; mac bridge parity) --------
 * The webview lib defers camera/microphone PermissionRequested events and
 * hands them here; the decision round-trips through the backend
 * (permission_request line out, permission_response in, shared host.c
 * dispatch). Pending ids map to the engine that raised them — the backend's
 * permission_response carries no window (app-global, like macOS). */

#define MAX_PERM_TARGETS 64
static struct {
  long id;
  webview_t w;
} g_perm_target[MAX_PERM_TARGETS];

/* GUI thread (WebView2 event): park the id, push the request line. */
static void zt_perm_cb(const char *kind, const char *url, long id, void *arg) {
  int i;
  for (i = 0; i < MAX_PERM_TARGETS; i++) {
    if (!g_perm_target[i].w) {
      g_perm_target[i].id = id;
      g_perm_target[i].w = (webview_t)arg;
      break;
    }
  }
  /* Saturated table: forward anyway; the respond lookup just won't find it
     and the request stays pending in the webview (documented behavior). */
  {
    char esc[512];
    char buf[1024];
    zt_json_escape(url ? url : "", esc, sizeof(esc));
    snprintf(buf, sizeof(buf),
             "{\"type\":\"permission_request\",\"id\":%ld,\"kind\":\"%s\","
             "\"url\":\"%s\",\"label\":\"%s\"}",
             id, kind, esc, zt_label_for_window((void *)zt_hwnd_for((webview_t)arg)));
    zt_send_line(buf);
  }
}

static void install_permission_bridge(webview_t w) {
  if (w) {
    webview_set_permission_handler(w, zt_perm_cb, w);
  }
}

void zt_permission_respond(Msg *m) {
  /* 0 = platform default (COREWEBVIEW2_PERMISSION_STATE_DEFAULT), matching
     the macOS decision encoding (default/allow/deny = 0/1/2). */
  int decision = 0;
  if (strcmp(m->aux, "allow") == 0) decision = 1;
  else if (strcmp(m->aux, "deny") == 0) decision = 2;
  for (int i = 0; i < MAX_PERM_TARGETS; i++) {
    if (g_perm_target[i].w && g_perm_target[i].id == m->req_id) {
      webview_t w = g_perm_target[i].w;
      g_perm_target[i].w = NULL; /* claim before the async completion */
      webview_permission_respond(w, (long)m->req_id, decision);
      return;
    }
  }
  /* Unknown id (already answered / saturated out): ignore. */
}

static int g_cursor_visible = 1;

/* Always-on-top tracking: GetWindowLongPtr(GWL_EXSTYLE) does NOT report
   WS_EX_TOPMOST (verified empirically on Win11 — the bit lives in the
   window-manager z-order bands, not the window style), so window_get_state
   must consult what we set ourselves. */
#define MAX_TOPMOST_TRACK 16
static struct { HWND w; int topmost; } g_topmost[MAX_TOPMOST_TRACK];
static int g_topmost_n = 0;

static void track_topmost(HWND w, int on) {
  int i;
  for (i = 0; i < g_topmost_n; i++)
    if (g_topmost[i].w == w) { g_topmost[i].topmost = on; return; }
  if (g_topmost_n < MAX_TOPMOST_TRACK) {
    g_topmost[g_topmost_n].w = w;
    g_topmost[g_topmost_n].topmost = on;
    g_topmost_n++;
  }
}

static int tracked_topmost(HWND w) {
  int i;
  for (i = 0; i < g_topmost_n; i++)
    if (g_topmost[i].w == w) return g_topmost[i].topmost;
  return 0;
}

static int is_window_op(const char *t) {
  static const char *ops[] = {
      "minimize",         "unminimize",      "toggle_maximize",
      "is_maximized",     "is_minimized",    "set_fullscreen",
      "is_fullscreen",    "set_always_on_top", "center",
      "set_focus",        "set_visible",     "set_resizable",
      "set_opacity",      "set_transparent", "set_decorations",
      "set_shadow",       "set_enabled",
      "maximize",         "unmaximize",      "is_enabled",
      "set_always_on_bottom", "is_focused",  "is_decorated",
      "set_minimizable",  "is_minimizable",  "set_maximizable",
      "is_maximizable",   "set_closable",    "is_closable",
      "set_skip_taskbar", "set_content_protected",
      "set_background_color",
      "request_user_attention", "set_focusable",
      "set_cursor_visible", "set_cursor_grab",
      "window_set_icon",  "window_set_overlay_icon",
      "set_effects",      "clear_effects",   "window_effects_query",
      "set_file_drop_enabled", "dragdrop_simulate",
      "set_visible_on_all_workspaces", "set_simple_fullscreen",
      "window_set_min_size", "window_set_max_size",
      "set_progress_bar", "set_badge_count", "set_badge_label",
  };
  for (size_t i = 0; i < sizeof(ops) / sizeof(ops[0]); i++)
    if (strcmp(t, ops[i]) == 0) return 1;
  return 0;
}

static void apply_fullscreen(HWND w, int on) {
  if (on) {
    HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTOPRIMARY);
    MONITORINFO mi = { sizeof(mi) };
    GetMonitorInfo(mon, &mi);
    SetWindowLong(w, GWL_STYLE,
                  GetWindowLong(w, GWL_STYLE) & ~WS_OVERLAPPEDWINDOW);
    SetWindowPos(w, HWND_TOP, mi.rcMonitor.left, mi.rcMonitor.top,
                 mi.rcMonitor.right - mi.rcMonitor.left,
                 mi.rcMonitor.bottom - mi.rcMonitor.top,
                 SWP_NOOWNERZORDER | SWP_FRAMECHANGED);
  } else {
    SetWindowLong(w, GWL_STYLE,
                  GetWindowLong(w, GWL_STYLE) | WS_OVERLAPPEDWINDOW);
    ShowWindow(w, SW_RESTORE);
  }
}

/* Taskbar progress via ITaskbarList3 (set_progress_bar; v < 0 clears). */
#include <initguid.h>
#include <shobjidl.h>

static ITaskbarList3 *g_taskbar = NULL;

static void taskbar_progress(HWND w, double v) {
  if (!g_taskbar) {
    /* The WebView2 UI thread is already STA; a bare CoInitializeEx is a
       no-op there and harmless if not. */
    CoInitializeEx(NULL, COINIT_APARTMENTTHREADED);
    if (CoCreateInstance(&CLSID_TaskbarList, NULL, CLSCTX_ALL,
                         &IID_ITaskbarList3,
                         (void **)&g_taskbar) != S_OK) return;
    g_taskbar->lpVtbl->HrInit(g_taskbar);
  }
  if (v < 0) {
    g_taskbar->lpVtbl->SetProgressState(g_taskbar, w, TBPF_NOPROGRESS);
  } else {
    if (v > 1) v = 1;
    g_taskbar->lpVtbl->SetProgressState(g_taskbar, w, TBPF_NORMAL);
    g_taskbar->lpVtbl->SetProgressValue(g_taskbar, w,
                                        (ULONGLONG)(v * 100), 100);
  }
}

/* ---- image registry (GDI+ flat API, hand-declared) ----
   The Windows SDK ships GDI+ headers as C++-only (everything sits inside
   `namespace Gdiplus`), so the small flat surface we need is declared here.
   These stdcall exports from gdiplus.dll are ABI-stable. */
typedef int GpStatus;
typedef void GpImage;
typedef void GpBitmap;

typedef struct { INT X, Y, Width, Height; } GpRect;
typedef struct {
  UINT Width;
  UINT Height;
  INT Stride;
  INT PixelFormat;
  void *Scan0;
  UINT_PTR Reserved;
} GpBitmapData;
typedef struct {
  UINT32 GdiplusVersion;
  void *DebugEventCallback;
  BOOL SuppressBackgroundThread;
  BOOL SuppressExternalCodecs;
} GpStartupInput;

GpStatus __stdcall GdiplusStartup(ULONG_PTR *token,
                                  const GpStartupInput *input, void *output);
void __stdcall GdiplusShutdown(ULONG_PTR token);
GpStatus __stdcall GdipCreateBitmapFromFile(const wchar_t *filename,
                                            GpBitmap **bitmap);
GpStatus __stdcall GdipCreateBitmapFromStream(IStream *stream,
                                              GpBitmap **bitmap);
GpStatus __stdcall GdipDisposeImage(GpImage *image);
GpStatus __stdcall GdipCreateHICONFromBitmap(GpBitmap *bitmap, HICON *hicon);
GpStatus __stdcall GdipGetImageWidth(GpImage *image, UINT *width);
GpStatus __stdcall GdipGetImageHeight(GpImage *image, UINT *height);
GpStatus __stdcall GdipBitmapLockBits(GpBitmap *bitmap, const GpRect *rect,
                                      UINT flags, INT pixelFormat,
                                      GpBitmapData *lockedBitmapData);
GpStatus __stdcall GdipBitmapUnlockBits(GpBitmap *bitmap,
                                        GpBitmapData *lockedBitmapData);
GpStatus __stdcall GdipCreateHBITMAPFromBitmap(GpBitmap *bitmap,
                                               HBITMAP *hbmReturn,
                                               UINT32 background);
GpStatus __stdcall GdipCreateBitmapFromHBITMAP(HBITMAP hbm, HPALETTE hpal,
                                               GpBitmap **bitmap);
GpStatus __stdcall GdipSaveImageToStream(GpImage *image, IStream *stream,
                                         const CLSID *encoderClsID,
                                         const void *encoderParams);

/* PNG encoder CLSID (stable, documented). */
static const CLSID GP_CLSID_PNG_ENCODER = {
  0x557cf406, 0x1a04, 0x11d3, { 0x9a, 0x73, 0x0, 0x0, 0xf8, 0x1e, 0xf3, 0x2e } };

#define GP_PIXEL_FORMAT32ARGB 0x0026200A /* PixelFormat32bppARGB */
#define GP_LOCK_READ 1                   /* ImageLockModeRead */

static ULONG_PTR g_gdiplus_token = 0;

static void gdiplus_ensure(void) {
  if (!g_gdiplus_token) {
    GpStartupInput inp;
    inp.GdiplusVersion = 1;
    inp.DebugEventCallback = NULL;
    inp.SuppressBackgroundThread = FALSE;
    inp.SuppressExternalCodecs = FALSE;
    GdiplusStartup(&g_gdiplus_token, &inp, NULL);
  }
}

#define MAX_IMAGES 64
static GpBitmap *g_images[MAX_IMAGES];
static int g_image_count = 0;

static int image_add(GpBitmap *bmp) {
  int i;
  if (!bmp) return -1;
  for (i = 0; i < g_image_count; i++) {
    if (!g_images[i]) { g_images[i] = bmp; return i; }
  }
  if (g_image_count >= MAX_IMAGES) {
    GdipDisposeImage((GpImage *)bmp);
    return -1;
  }
  g_images[g_image_count] = bmp;
  return g_image_count++;
}

static GpBitmap *image_by_id(int img_id) {
  if (img_id >= 0 && img_id < g_image_count) return g_images[img_id];
  return NULL;
}

static void image_destroy(int img_id) {
  if (img_id >= 0 && img_id < g_image_count && g_images[img_id]) {
    GdipDisposeImage((GpImage *)g_images[img_id]);
    g_images[img_id] = NULL;
  }
}

/* Standard base64 decoder (RFC 4648, with padding). */
static size_t zt_b64_decode(const char *in, unsigned char *out, size_t outcap) {
  static signed char T[256];
  static int t_ready = 0;
  static const char tbl[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t o = 0;
  unsigned v = 0;
  int bits = 0;
  const unsigned char *s = (const unsigned char *)in;
  int i;
  if (!t_ready) {
    /* MSVC C mode has no designated initializers: build the table once. */
    memset(T, -1, sizeof(T));
    for (i = 0; tbl[i]; i++) T[(unsigned char)tbl[i]] = (signed char)i;
    t_ready = 1;
  }
  while (*s) {
    if (*s == '=') break;
    if (T[*s] < 0) { s++; continue; }
    v = (v << 6) | (unsigned)T[*s];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (o < outcap) out[o++] = (unsigned char)(v >> bits);
    }
    s++;
  }
  return o;
}

/* Standard base64 encoder (RFC 4648) for binary query replies. */
static void zt_b64_encode(const unsigned char *in, size_t n, char *out) {
  static const char tbl[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t i = 0, o = 0;
  while (i + 2 < n) {
    unsigned v = (unsigned)in[i] << 16 | (unsigned)in[i + 1] << 8 | in[i + 2];
    out[o++] = tbl[(v >> 18) & 63];
    out[o++] = tbl[(v >> 12) & 63];
    out[o++] = tbl[(v >> 6) & 63];
    out[o++] = tbl[v & 63];
    i += 3;
  }
  if (i + 1 < n) {
    unsigned v = (unsigned)in[i] << 16 | (unsigned)in[i + 1] << 8;
    out[o++] = tbl[(v >> 18) & 63];
    out[o++] = tbl[(v >> 12) & 63];
    out[o++] = tbl[(v >> 6) & 63];
    out[o++] = '=';
  } else if (i < n) {
    unsigned v = (unsigned)in[i] << 16;
    out[o++] = tbl[(v >> 18) & 63];
    out[o++] = tbl[(v >> 12) & 63];
    out[o++] = '=';
    out[o++] = '=';
  }
  out[o] = '\0';
}

/* Bitmap -> base64 RGBA payload (shared by image_rgba_query). Heap result. */
static char *image_rgba_b64(GpBitmap *bmp, UINT *w, UINT *h) {
  GpRect rect = { 0, 0, 0, 0 };
  GpBitmapData bd;
  char *b64;
  if (!bmp) return NULL;
  if (GdipGetImageWidth((GpImage *)bmp, w) != 0) return NULL;
  if (GdipGetImageHeight((GpImage *)bmp, h) != 0) return NULL;
  if (!*w || !*h || (size_t)*w * *h > (size_t)64 * 1024 * 1024) return NULL;
  rect.Width = (INT)*w;
  rect.Height = (INT)*h;
  memset(&bd, 0, sizeof(bd));
  if (GdipBitmapLockBits(bmp, &rect, GP_LOCK_READ, GP_PIXEL_FORMAT32ARGB,
                         &bd) != 0)
    return NULL;
  b64 = (char *)malloc(((size_t)*w * *h * 4 + 2) / 3 * 4 + 1);
  if (b64) {
    if (bd.Stride == (INT)*w * 4) {
      zt_b64_encode((const unsigned char *)bd.Scan0, (size_t)*w * *h * 4, b64);
    } else {
      /* Un-pad rows into a packed buffer first. */
      unsigned char *packed = (unsigned char *)malloc((size_t)*w * *h * 4);
      int y;
      for (y = 0; y < (INT)*h; y++) {
        memcpy(packed + (size_t)y * *w * 4,
               (const unsigned char *)bd.Scan0 + (size_t)y * bd.Stride,
               (size_t)*w * 4);
      }
      zt_b64_encode(packed, (size_t)*w * *h * 4, b64);
      free(packed);
    }
  }
  GdipBitmapUnlockBits(bmp, &bd);
  return b64;
}

/* ---- window effects: Mica/Acrylic system backdrops (GAP H7) ---- */

/* DWMWA_SYSTEMBACKDROP_TYPE / DWMSBT_* (Win11 22H2+; ABI-stable values —
   older SDK headers lack the definitions). */
#ifndef DWMWA_SYSTEMBACKDROP_TYPE
#define DWMWA_SYSTEMBACKDROP_TYPE 38
#endif
enum {
  ZT_DWMSBT_NONE = 1,
  ZT_DWMSBT_MAINWINDOW = 2,      /* Mica */
  ZT_DWMSBT_TRANSIENTWINDOW = 3, /* Acrylic */
  ZT_DWMSBT_TABBEDWINDOW = 4     /* Mica Alt */
};

/* mac material -> Windows system backdrop (mirror of host_macos.c
   effect_material()). DWM expresses only two backdrop families plus Mica
   Alt, so the mac taxonomy maps coarsely — the NSVisualEffectView blends
   have no true Windows analog:
     chrome/transient surfaces -> DWMSBT_TRANSIENTWINDOW (acrylic)
     whole-window backgrounds  -> DWMSBT_MAINWINDOW      (mica)
   The native names Tauri uses are accepted too (core's Tauri rule filters
   them out today, but they document intent). Unknown -> -1: no-op, like
   wry. */
static int effect_backdrop(const char *name) {
  if (strcmp(name, "mica") == 0 || strcmp(name, "liquidGlassRegular") == 0 ||
      strcmp(name, "liquidGlassClear") == 0)
    return ZT_DWMSBT_MAINWINDOW; /* closest Windows-native glass */
  if (strcmp(name, "acrylic") == 0 || strcmp(name, "blur") == 0 ||
      strcmp(name, "titlebar") == 0 || strcmp(name, "menu") == 0 ||
      strcmp(name, "popover") == 0 || strcmp(name, "sidebar") == 0 ||
      strcmp(name, "headerView") == 0 || strcmp(name, "sheet") == 0 ||
      strcmp(name, "toolTip") == 0 || strcmp(name, "selection") == 0 ||
      strcmp(name, "contentBackground") == 0)
    return ZT_DWMSBT_TRANSIENTWINDOW;
  if (strcmp(name, "tabbed") == 0) return ZT_DWMSBT_TABBEDWINDOW;
  if (strcmp(name, "appearanceBased") == 0 ||
      strcmp(name, "windowBackground") == 0 ||
      strcmp(name, "hudWindow") == 0 ||
      strcmp(name, "fullScreenUI") == 0 ||
      strcmp(name, "underWindowBackground") == 0 ||
      strcmp(name, "underPageBackground") == 0)
    return ZT_DWMSBT_MAINWINDOW;
  return -1;
}

/* The backdrop renders behind the window's redirection surface, so it is
   only visible where WebView2 stops painting an opaque background —
   put_DefaultBackgroundColor with alpha 0 (the recipe wry uses for Tauri's
   transparent:true). alpha 255 restores the opaque default. */
static HRESULT webview_background_rgba(webview_t wv, COREWEBVIEW2_COLOR col) {
  ICoreWebView2Controller *ctl;
  ICoreWebView2Controller2 *ctl2 = NULL;
  HRESULT hr = E_FAIL;
  if (!wv) wv = zt_w;
  ctl = (ICoreWebView2Controller *)webview_get_native_handle(
      wv, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER);
  if (!ctl) return hr;
  if (ctl->lpVtbl->QueryInterface(ctl, &IID_ICoreWebView2Controller2,
                                  (void **)&ctl2) != S_OK || !ctl2)
    return hr;
  hr = ctl2->lpVtbl->put_DefaultBackgroundColor(ctl2, col);
  ctl2->lpVtbl->Release(ctl2);
  return hr;
}

static void webview_background_alpha(webview_t wv, BYTE alpha) {
  COREWEBVIEW2_COLOR col;
  col.A = alpha;
  col.R = 255;
  col.G = 255;
  col.B = 255;
  webview_background_rgba(wv, col);
}

/* Parses a window background color (GAP H16): "transparent" → alpha 0
   (RGB channels are irrelevant to the compositors, white keeps the
   pre-22H2 accent blur tinted like wry), "#rrggbb"/"#rrggbbaa" hex →
   that color, anything else → opaque white (the WebView2 default, the
   analog of mac's windowBackgroundColor fallback). */
static COREWEBVIEW2_COLOR zt_parse_bg_color(const char *s) {
  COREWEBVIEW2_COLOR col;
  col.A = 255;
  col.R = 255;
  col.G = 255;
  col.B = 255;
  if (!s) return col;
  if (strcmp(s, "transparent") == 0) {
    col.A = 0;
    return col;
  }
  if (s[0] == '#' && (strlen(s) == 7 || strlen(s) == 9)) {
    unsigned int r = 255, g = 255, b = 255, a = 255;
    if (strlen(s) == 9) {
      if (sscanf(s, "#%2x%2x%2x%2x", &r, &g, &b, &a) != 4) return col;
    } else {
      if (sscanf(s, "#%2x%2x%2x", &r, &g, &b) != 3) return col;
    }
    col.R = (BYTE)r;
    col.G = (BYTE)g;
    col.B = (BYTE)b;
    col.A = (BYTE)a;
  }
  return col;
}

/* Win10 pre-22H2 fallback: the undocumented SetWindowCompositionAttribute
   acrylic-behind accent (same recipe as tao/wry). No readback exists, so
   window_effects_query reports mode "legacy" and probes verify by reply
   shape. On 22H2+ the DWM path always wins — this accent's blur is
   frozen-frame there (long-standing Windows bug). */
typedef struct {
  int AccentState;             /* 0 = disabled, 4 = ACRYLICBLURBEHIND */
  int AccentFlags;             /* tao's value (2) */
  unsigned long GradientColor; /* AABBGGRR tint over the blur */
  int AnimationId;
} ZT_ACCENT_POLICY;
typedef struct {
  int Attribute; /* 19 = WCA_ACCENT_POLICY */
  void *Data;
  SIZE_T SizeOfData;
} ZT_WCA_DATA;

static int effects_legacy_mode(void) {
  static int mode = -1;
  if (mode < 0) {
    char b[4] = {0};
    mode = GetEnvironmentVariableA("ZTRON_EFFECTS_LEGACY", b, sizeof(b)) > 0;
  }
  return mode;
}

static BOOL accent_apply(HWND w, int on, const char *color_hex) {
  static BOOL (WINAPI *pfn)(HWND, const ZT_WCA_DATA *);
  ZT_ACCENT_POLICY pol;
  ZT_WCA_DATA data;
  unsigned long tint = 0xCC000000UL; /* default smoky tint (alpha 80%) */
  if (!pfn) {
    pfn = (BOOL (WINAPI *)(HWND, const ZT_WCA_DATA *))GetProcAddress(
        GetModuleHandleW(L"user32.dll"), "SetWindowCompositionAttribute");
  }
  if (!pfn) return FALSE;
  if (color_hex && color_hex[0]) {
    unsigned r = 0, g = 0, b = 0;
    const char *hex = color_hex[0] == '#' ? color_hex + 1 : color_hex;
    if (strlen(hex) == 6 &&
        sscanf(hex, "%02x%02x%02x", &r, &g, &b) == 3)
      tint = (0xC8UL << 24) | (b << 16) | (g << 8) | r; /* AABBGGRR */
  }
  memset(&pol, 0, sizeof(pol));
  pol.AccentState = on ? 4 : 0; /* ACRYLICBLURBEHIND : DISABLED */
  pol.AccentFlags = 2;
  pol.GradientColor = tint;
  data.Attribute = 19; /* WCA_ACCENT_POLICY */
  data.Data = &pol;
  data.SizeOfData = sizeof(pol);
  return pfn(w, &data);
}

/* Sheet-of-glass margins so the backdrop spans the whole client area. */
static void effects_apply(HWND w, webview_t wv, int backdrop,
                          const char *color_hex) {
  MARGINS mg = {-1, -1, -1, -1};
  DwmExtendFrameIntoClientArea(w, &mg);
  if (!effects_legacy_mode()) {
    if (SUCCEEDED(DwmSetWindowAttribute(w, DWMWA_SYSTEMBACKDROP_TYPE,
                                        &backdrop, sizeof(backdrop)))) {
      webview_background_alpha(wv, 0);
      return;
    }
    /* pre-22H2: DWMWA_SYSTEMBACKDROP_TYPE rejected -> accent below */
  }
  accent_apply(w, 1, color_hex);
  webview_background_alpha(wv, 0);
}

static void effects_clear(HWND w, webview_t wv) {
  int none = ZT_DWMSBT_NONE;
  MARGINS mg = {0, 0, 0, 0};
  DwmSetWindowAttribute(w, DWMWA_SYSTEMBACKDROP_TYPE, &none, sizeof(none));
  DwmExtendFrameIntoClientArea(w, &mg);
  accent_apply(w, 0, NULL);
  webview_background_alpha(wv, 255);
}

/* Windows analog of host_macos.c window_set_effects: the material maps
   through effect_backdrop(); if DWMWA_SYSTEMBACKDROP_TYPE is unavailable
   the accent blur covers regardless of material, so `fallback` is a mac-
   only concept here — likewise state/radius/interactive (no DWM analog). */
static void window_set_effects(HWND w, webview_t wv, const char *name,
                               const char *color, const char *fallback) {
  int backdrop = effect_backdrop(name);
  (void)fallback;
  if (backdrop < 0) return; /* unsupported material: no-op like wry */
  effects_apply(w, wv, backdrop, color);
}

/* Diagnostics for the GAP H7 probe (host-only op; probed through
   HostRuntime.sendRequest("window_effects_query")): the DWM readback
   proves the OS accepted the backdrop, the WebView2 background alpha
   proves the composition can actually show it. */
static void effects_query(Msg *m, webview_t wv, HWND w) {
  char buf[160];
  int backdrop = ZT_DWMSBT_NONE;
  unsigned long hr = 0;
  BYTE alpha = 255;
  ICoreWebView2Controller *ctl;
  if (!wv) wv = zt_w;
  if (!effects_legacy_mode()) {
    hr = (unsigned long)DwmGetWindowAttribute(
        w, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop, sizeof(backdrop));
  }
  ctl = (ICoreWebView2Controller *)webview_get_native_handle(
      wv, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER);
  if (ctl) {
    ICoreWebView2Controller2 *ctl2 = NULL;
    COREWEBVIEW2_COLOR col;
    memset(&col, 0, sizeof(col));
    if (ctl->lpVtbl->QueryInterface(ctl, &IID_ICoreWebView2Controller2,
                                    (void **)&ctl2) == S_OK && ctl2) {
      if (SUCCEEDED(ctl2->lpVtbl->get_DefaultBackgroundColor(ctl2, &col)))
        alpha = col.A;
      ctl2->lpVtbl->Release(ctl2);
    }
  }
  snprintf(buf, sizeof(buf),
           "{\"backdrop\":%d,\"mode\":\"%s\",\"hr\":\"0x%08lx\",\"bg_alpha\":%u}",
           backdrop, effects_legacy_mode() ? "legacy" : "dwm", hr,
           (unsigned)alpha);
  zt_reply_query(m->req_id, buf);
}

/* ---- file drag-drop: IDropTarget on the WebView2 child (GAP H8) ----
   WebView2 hosts Chromium's own IDropTarget on one of its child HWNDs, so
   dropped files navigate instead of notifying. wry's recipe: find that
   child (RegisterDragDrop marks it with the OleDropTargetInterface prop),
   revoke there, register ours. Emissions mirror host_macos.c drop_emit:
   drag_enter/drag_drop carry paths+x/y, drag_over carries x/y, drag_leave
   is bare — all window-local physical pixels. */

/* Collect a JSON string array into a double-NUL-terminated UTF-16
   multi-string. Returns the element count. */
static int drop_json_paths_utf16(const char *arr, WCHAR *out, size_t outsz) {
  size_t o = 0;
  int n = 0;
  char tmp[1024];
  const char *p = arr ? arr : "";
  while (*p && o + 2 < outsz) {
    size_t t = 0;
    if (*p != '"') {
      p++;
      continue;
    }
    p++;
    while (*p && *p != '"' && t + 1 < sizeof(tmp)) {
      char c = *p++;
      if (c == '\\' && *p) {
        char e = *p++;
        if (e == 'n')
          c = '\n';
        else if (e == 't')
          c = '\t';
        else if (e == 'r')
          c = '\r';
        else
          c = e; /* \" \\ \/ stay literal */
      }
      tmp[t++] = c;
    }
    if (*p == '"')
      p++;
    tmp[t] = 0;
    if (t == 0)
      continue;
    {
      int w = MultiByteToWideChar(CP_UTF8, 0, tmp, -1, out + o,
                                  (int)(outsz - o));
      if (w <= 0)
        continue;
      o += (size_t)w - 1; /* drop the converter's NUL, re-add below */
    }
    out[o++] = 0;
    n++;
  }
  out[o] = 0;
  if (o + 1 < outsz)
    out[o + 1] = 0;
  return n;
}

/* CF_HDROP paths -> JSON array via zt_json_escape. Returns elements read. */
static int drop_hdrop_paths_json(HDROP hd, char *buf, size_t bufsz) {
  UINT n = DragQueryFileW(hd, 0xFFFFFFFF, NULL, 0);
  size_t off = 0;
  UINT i;
  int wrote = 0;
  if (bufsz < 3)
    return 0;
  buf[off++] = '[';
  buf[off] = 0;
  for (i = 0; i < n; i++) {
    WCHAR wpath[1024];
    char path[2048];
    char esc[2100];
    int k, w;
    if (DragQueryFileW(hd, i, wpath, 1024) == 0)
      continue;
    k = WideCharToMultiByte(CP_UTF8, 0, wpath, -1, path, sizeof(path), NULL,
                            NULL);
    if (k <= 0)
      continue;
    zt_json_escape(path, esc, sizeof(esc));
    w = snprintf(buf + off, bufsz - off, "%s\"%s\"", wrote ? "," : "", esc);
    if (w < 0 || (size_t)w >= bufsz - off)
      break;
    off += (size_t)w;
    wrote = 1;
  }
  buf[off++] = ']';
  buf[off] = 0;
  return wrote ? (int)n : 0;
}

static HRESULT drop_extract_paths_json(IDataObject *dto, char *buf,
                                       size_t bufsz) {
  FORMATETC fmt;
  STGMEDIUM med;
  HRESULT hr;
  buf[0] = 0;
  if (!dto)
    return E_INVALIDARG;
  memset(&fmt, 0, sizeof(fmt));
  fmt.cfFormat = CF_HDROP;
  fmt.dwAspect = DVASPECT_CONTENT;
  fmt.lindex = -1;
  fmt.tymed = TYMED_HGLOBAL;
  hr = dto->lpVtbl->GetData(dto, &fmt, &med);
  if (hr != S_OK)
    return hr;
  if (med.tymed != TYMED_HGLOBAL || !med.hGlobal) {
    ReleaseStgMedium(&med);
    return E_FAIL;
  }
  hr = drop_hdrop_paths_json((HDROP)med.hGlobal, buf, bufsz) > 0 ? S_OK
                                                                 : E_FAIL;
  ReleaseStgMedium(&med);
  return hr;
}

/* Emit with CLIENT-LOCAL physical coords (convert at the call site).
   paths_json NULL -> position-only line (drag_over). */
static void drop_emit(HWND main, const char *event, const char *paths_json,
                      long x, long y) {
  char buf[76800];
  if (paths_json)
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\","
             "\"paths\":%s,\"x\":%ld,\"y\":%ld}",
             zt_label_for_window((void *)main), event, paths_json, x, y);
  else
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\","
             "\"x\":%ld,\"y\":%ld}",
             zt_label_for_window((void *)main), event, x, y);
  zt_send_line(buf);
}

static int drop_disabled(HWND main) {
  WinState *st = win_state(main);
  return st ? st->drop_disabled : 0;
}

typedef struct {
  IDropTargetVtbl *vtbl;
  LONG refs;
  HWND main; /* owner top-level window: label + state + coord space */
} ZtDropTarget;

static HRESULT STDMETHODCALLTYPE drop_qi(IDropTarget *s, REFIID riid,
                                         void **ppv) {
  if (IsEqualIID(riid, &IID_IUnknown) || IsEqualIID(riid, &IID_IDropTarget)) {
    *ppv = (void *)s;
    s->lpVtbl->AddRef(s);
    return S_OK;
  }
  *ppv = NULL;
  return E_NOINTERFACE;
}

static ULONG STDMETHODCALLTYPE drop_addref(IDropTarget *s) {
  return (ULONG)InterlockedIncrement(&((ZtDropTarget *)s)->refs);
}

static ULONG STDMETHODCALLTYPE drop_release(IDropTarget *s) {
  ZtDropTarget *t = (ZtDropTarget *)s;
  LONG r = InterlockedDecrement(&t->refs);
  if (r == 0)
    free(t);
  return (ULONG)r;
}

static HRESULT STDMETHODCALLTYPE drop_drag_enter(IDropTarget *s,
                                                 IDataObject *dto, DWORD keys,
                                                 POINTL pt, DWORD *effect) {
  ZtDropTarget *t = (ZtDropTarget *)s;
  POINT c;
  char paths[65536];
  (void)keys;
  if (effect)
    *effect = drop_disabled(t->main) ? DROPEFFECT_NONE : DROPEFFECT_COPY;
  if (drop_disabled(t->main))
    return S_OK;
  if (drop_extract_paths_json(dto, paths, sizeof(paths)) != S_OK)
    return S_OK;
  c.x = pt.x;
  c.y = pt.y;
  ScreenToClient(t->main, &c);
  drop_emit(t->main, "drag_enter", paths, (long)c.x, (long)c.y);
  return S_OK;
}

static HRESULT STDMETHODCALLTYPE drop_drag_over(IDropTarget *s, DWORD keys,
                                                POINTL pt, DWORD *effect) {
  ZtDropTarget *t = (ZtDropTarget *)s;
  POINT c;
  (void)keys;
  if (effect)
    *effect = drop_disabled(t->main) ? DROPEFFECT_NONE : DROPEFFECT_COPY;
  if (drop_disabled(t->main))
    return S_OK;
  c.x = pt.x;
  c.y = pt.y;
  ScreenToClient(t->main, &c);
  drop_emit(t->main, "drag_over", NULL, (long)c.x, (long)c.y);
  return S_OK;
}

static HRESULT STDMETHODCALLTYPE drop_drag_leave(IDropTarget *s) {
  ZtDropTarget *t = (ZtDropTarget *)s;
  char buf[192];
  if (drop_disabled(t->main))
    return S_OK;
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":"
           "\"drag_leave\"}",
           zt_label_for_window((void *)t->main));
  zt_send_line(buf);
  return S_OK;
}

static HRESULT STDMETHODCALLTYPE drop_drop(IDropTarget *s, IDataObject *dto,
                                           DWORD keys, POINTL pt,
                                           DWORD *effect) {
  ZtDropTarget *t = (ZtDropTarget *)s;
  POINT c;
  char paths[65536];
  (void)keys;
  if (effect)
    *effect = drop_disabled(t->main) ? DROPEFFECT_NONE : DROPEFFECT_COPY;
  if (drop_disabled(t->main))
    return S_OK;
  if (drop_extract_paths_json(dto, paths, sizeof(paths)) != S_OK)
    return S_OK;
  c.x = pt.x;
  c.y = pt.y;
  ScreenToClient(t->main, &c);
  drop_emit(t->main, "drag_drop", paths, (long)c.x, (long)c.y);
  return S_OK;
}

static IDropTargetVtbl g_drop_vtbl = {
    drop_qi,       drop_addref, drop_release, drop_drag_enter,
    drop_drag_over, drop_drag_leave, drop_drop,
};

static BOOL CALLBACK drop_find_child(HWND child, LPARAM lp) {
  HWND *out = (HWND *)lp;
  if (GetPropW(child, L"OleDropTargetInterface")) {
    *out = child;
    return FALSE; /* the prop is RegisterDragDrop's marker — this is the one */
  }
  return TRUE;
}

/* Revoke Chromium's target and register ours on the same child. */
static void drop_install(webview_t wv) {
  HWND main = zt_hwnd_for(wv);
  HWND child = NULL;
  ZtDropTarget *t;
  if (!main)
    return;
  EnumChildWindows(main, drop_find_child, (LPARAM)&child);
  if (!child)
    child = FindWindowExW(main, NULL, L"Chrome_WidgetWin_0", NULL);
  if (!child)
    return;
  t = (ZtDropTarget *)malloc(sizeof(*t));
  if (!t)
    return;
  t->vtbl = &g_drop_vtbl;
  t->refs = 1;
  t->main = main;
  RevokeDragDrop(child);
  if (RegisterDragDrop(child, (IDropTarget *)t) != S_OK)
    free(t);
}

/* ---- deep-link: ztron:// scheme claim + hot activation (GAP H9) ----
   Windows has no LaunchServices: the scheme lives in HKCU\Software\Classes
   and an OS activation spawns a SECOND process with the URL in argv. That
   process forwards the URL to the running instance over WM_COPYDATA and
   exits (before any webview/backend exists); with no live instance it
   cold-starts and the URL is delivered on the first backend message. The
   wire line mirrors host_macos.c ae_geturl_handler exactly. */

#define ZT_DLCOPY_MAGIC 0x5A444C4B /* 'ZDLK' — COPYDATASTRUCT.dwData tag */

static char g_deeplink_pending[2048];
static int g_deeplink_pending_sent;

/* Same-line emitter as mac's ae_geturl_handler. */
static void dl_emit(const char *url) {
  char esc[4300];
  char out[4364];
  zt_json_escape(url, esc, sizeof(esc));
  snprintf(out, sizeof(out), "{\"type\":\"deep_link\",\"url\":\"%s\"}", esc);
  zt_send_line(out);
}

/* Claim HKCU\Software\Classes\ztron (the LSRegisterURL analog; HKCU needs
   no elevation). Last writer wins — same semantics as LSRegisterURL. */
static void dl_register_scheme(void) {
  WCHAR exe[MAX_PATH];
  char exeA[MAX_PATH * 2];
  char buf[MAX_PATH * 2 + 16];
  HKEY k1;
  DWORD n = GetModuleFileNameW(NULL, exe, MAX_PATH);
  int k;
  if (n == 0 || n >= MAX_PATH)
    return;
  k = WideCharToMultiByte(CP_UTF8, 0, exe, -1, exeA, sizeof(exeA), NULL, NULL);
  if (k <= 0)
    return;
  if (RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\Classes\\ztron", 0, NULL,
                      0, KEY_SET_VALUE, NULL, &k1, NULL) == ERROR_SUCCESS) {
    RegSetValueExA(k1, NULL, 0, REG_SZ, (const BYTE *)"URL:ztron", 10);
    RegSetValueExA(k1, "URL Protocol", 0, REG_SZ, (const BYTE *)"", 1);
    RegCloseKey(k1);
  }
  if (RegCreateKeyExA(HKEY_CURRENT_USER,
                      "Software\\Classes\\ztron\\shell\\open\\command", 0,
                      NULL, 0, KEY_SET_VALUE, NULL, &k1,
                      NULL) == ERROR_SUCCESS) {
    int w = snprintf(buf, sizeof(buf), "\"%s\" \"%%1\"", exeA);
    if (w > 0)
      RegSetValueExA(k1, NULL, 0, REG_SZ, (const BYTE *)buf,
                     (DWORD)strlen(buf) + 1);
    RegCloseKey(k1);
  }
}

/* A live instance of the SAME exe only: the registry command points at
   this exact binary, so forwarding anywhere else would misdeliver the URL
   to a different app that merely shares the "webview" window class. */
static BOOL CALLBACK dl_find_target(HWND w, LPARAM lp) {
  WCHAR cls[32];
  DWORD pid = 0;
  HANDLE p;
  WCHAR pth[MAX_PATH], own[MAX_PATH];
  DWORD sz = sizeof(pth);
  int same = 0;
  if (!GetClassNameW(w, cls, 32) || wcscmp(cls, L"webview") != 0)
    return TRUE;
  GetWindowThreadProcessId(w, &pid);
  if (pid == 0 || pid == GetCurrentProcessId())
    return TRUE;
  p = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
  if (p) {
    if (QueryFullProcessImageNameW(p, 0, pth, &sz)) {
      GetModuleFileNameW(NULL, own, MAX_PATH);
      same = lstrcmpiW(pth, own) == 0;
    }
    CloseHandle(p);
  }
  if (same) {
    *(HWND *)lp = w;
    return FALSE;
  }
  return TRUE;
}

/* Returns 1 when the URL was forwarded (caller must exit — a bare
   host with no port argument would strand in accept() otherwise). */
static int dl_forward_or_store(const char *url) {
  HWND target = NULL;
  EnumWindows(dl_find_target, (LPARAM)&target);
  if (target) {
    COPYDATASTRUCT cds;
    cds.dwData = ZT_DLCOPY_MAGIC;
    cds.cbData = (DWORD)strlen(url) + 1;
    cds.lpData = (void *)url;
    if (SendMessageW(target, WM_COPYDATA, 0, (LPARAM)&cds))
      return 1;
    /* target vanished or declined: fall through to a cold start */
  }
  snprintf(g_deeplink_pending, sizeof(g_deeplink_pending), "%s", url);
  return 0;
}

/* Runs first in main, before sockets/webview/backend (GAP H9). Claims the
   scheme, then scans argv for a ztron:// URL: forwards to the running
   instance (returns 0 -> main exits) or records it for cold-start
   delivery on the first backend message (returns 1 -> normal startup). */
int zt_deeplink_preinit(int argc, char **argv) {
  int i;
  dl_register_scheme();
  for (i = 1; i < argc; i++) {
    if (strncmp(argv[i], "ztron://", 8) == 0)
      return dl_forward_or_store(argv[i]) ? 0 : 1;
  }
  return 1;
}

/* ---- browsing-data clear (GAP H10) ----
   mac clears the default WKWebsiteDataStore (all types, all time,
   fire-and-forget). WebView2's analog is ICoreWebView2Profile2::
   ClearBrowsingDataAll — reachable as ICoreWebView2_13::get_Profile + QI.
   The vendored SDK header stops at ICoreWebView2_10, so the two hops past
   it are hand-rolled vtbl-slot calls: get_Profile sits at flat slot 105
   of _13 (IUnknown + the whole _2.._12 accumulation precede it; counted
   from the official 1.0.3xxx header where it is the only _13 addition),
   ClearBrowsingDataAll at slot 12 of Profile2 (3 IUnknown + 7 Profile
   methods precede it). Completed handler is a 4-method COM stub. */

static const IID zt_IID_CoreWebView2_13 = {
    0xf75f09a8, 0x667e, 0x4983, {0x88, 0xd6, 0xc8, 0x77, 0x3f, 0x31, 0x5e, 0x84}};
static const IID zt_IID_Profile2 = {
    0xfa740d4b, 0x5eae, 0x4344, {0xa8, 0xad, 0x74, 0xbe, 0x31, 0x92, 0x53, 0x97}};
static const IID zt_IID_ClearHandler = {
    0xe9710a06, 0x1d1d, 0x49b2, {0x82, 0x34, 0x22, 0x6f, 0x35, 0x84, 0x6a, 0xe5}};

typedef HRESULT (STDMETHODCALLTYPE *zt_get_profile_fn)(void *This,
                                                       void **profile);
typedef HRESULT (STDMETHODCALLTYPE *zt_qi_fn)(void *This, REFIID riid,
                                              void **out);
typedef ULONG (STDMETHODCALLTYPE *zt_ref_fn)(void *This);
typedef HRESULT (STDMETHODCALLTYPE *zt_clear_all_fn)(void *This,
                                                     void *handler);
typedef HRESULT (STDMETHODCALLTYPE *zt_clear_kinds_fn)(void *This,
                                                       DWORD kinds,
                                                       void *handler);
typedef HRESULT (STDMETHODCALLTYPE *zt_put_scheme_fn)(void *This, int scheme);
typedef HRESULT (STDMETHODCALLTYPE *zt_get_scheme_fn)(void *This, int *scheme);

typedef struct {
  void *vtbl;
  LONG refs;
  int tag; /* 1 = the All() handler, 2 = the explicit-kinds handler */
} ZtClearHandler;

static HRESULT STDMETHODCALLTYPE ztc_qi(void *s, REFIID riid, void **ppv) {
  if (IsEqualIID(riid, &IID_IUnknown) ||
      IsEqualIID(riid, &zt_IID_ClearHandler)) {
    *ppv = s;
    ((zt_ref_fn)(*(void ***)s)[1])(s); /* AddRef */
    return S_OK;
  }
  *ppv = NULL;
  return E_NOINTERFACE;
}

static ULONG STDMETHODCALLTYPE ztc_addref(void *s) {
  return (ULONG)InterlockedIncrement(&((ZtClearHandler *)s)->refs);
}

static ULONG STDMETHODCALLTYPE ztc_release(void *s) {
  ZtClearHandler *h = (ZtClearHandler *)s;
  LONG r = InterlockedDecrement(&h->refs);
  if (r == 0)
    free(h);
  return (ULONG)r;
}

/* fire-and-forget on the wire — the no-op body matches mac's noop block;
   the completion HRESULT is recorded for webview_clear_data_diag */
static void *zt_clear_vtbl[4]; /* QI / AddRef / Release / Invoke */

/* Per-hop diagnostics for the clear chain — the probe reads these back via
   webview_clear_data_diag because every failure mode here is silent
   (fire-and-forget on the wire, async completion). */
typedef struct {
  HRESULT hr_ctl, hr_core, hr_qi13, hr_profile, hr_qi2, hr_clear;
  int invoked; /* sticky: CompletedHandler::Invoke fired at least once */
  HRESULT invoke_hr;
  HRESULT hr_clear_kinds;
  int invoked_kinds;
  HRESULT invoke_hr_kinds;
} ZtClearDiag;
static ZtClearDiag g_clear_diag;

static HRESULT STDMETHODCALLTYPE ztc_invoke(void *s, HRESULT errorCode) {
  ZtClearHandler *h = (ZtClearHandler *)s;
  if (h->tag == 2) {
    g_clear_diag.invoked_kinds = 1;
    g_clear_diag.invoke_hr_kinds = errorCode;
  } else {
    g_clear_diag.invoked = 1;
    g_clear_diag.invoke_hr = errorCode;
  }
  return S_OK;
}

static void clear_data_core(webview_t wv, int kinds_too) {
  ICoreWebView2Controller *ctl;
  ICoreWebView2 *core = NULL;
  void *c13 = NULL, *profile = NULL, *profile2 = NULL;
  if (!zt_clear_vtbl[0]) {
    zt_clear_vtbl[0] = (void *)ztc_qi;
    zt_clear_vtbl[1] = (void *)ztc_addref;
    zt_clear_vtbl[2] = (void *)ztc_release;
    zt_clear_vtbl[3] = (void *)ztc_invoke;
  }
  if (!wv)
    wv = zt_w;
  ctl = (ICoreWebView2Controller *)webview_get_native_handle(
      wv, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER);
  if (!ctl)
    return;
  g_clear_diag.hr_ctl = S_OK;
  g_clear_diag.hr_core = ctl->lpVtbl->get_CoreWebView2(ctl, &core);
  if (g_clear_diag.hr_core != S_OK || !core)
    return;
  g_clear_diag.hr_qi13 =
      core->lpVtbl->QueryInterface(core, &zt_IID_CoreWebView2_13, &c13);
  if (g_clear_diag.hr_qi13 != S_OK) {
    core->lpVtbl->Release(core);
    return; /* runtime too old for profile-scoped clearing */
  }
  g_clear_diag.hr_profile =
      ((zt_get_profile_fn)(*(void ***)c13)[105])(c13, &profile);
  if (g_clear_diag.hr_profile == S_OK && profile) {
    g_clear_diag.hr_qi2 = ((zt_qi_fn)(*(void ***)profile)[0])(
        profile, &zt_IID_Profile2, &profile2);
    if (g_clear_diag.hr_qi2 == S_OK && profile2) {
      ZtClearHandler *h = (ZtClearHandler *)malloc(sizeof(*h));
      if (h) {
        h->vtbl = zt_clear_vtbl;
        h->refs = 1;
        h->tag = 1;
        /* WebView2 takes its own reference and Releases after Invoke. */
        g_clear_diag.hr_clear =
            ((zt_clear_all_fn)(*(void ***)profile2)[12])(profile2, (void *)h);
      }
      if (kinds_too) {
        /* Diag leg: slot 10 = ClearBrowsingData(kinds, handler). Explicit
           site-data kinds (file systems | indexed db | local storage |
           web sql | cache storage | all dom storage | cookies | disk
           cache) — cross-checks whether the All() variant's "all" covers
           the same ground on this runtime. */
        ZtClearHandler *h2 = (ZtClearHandler *)malloc(sizeof(*h));
        if (h2) {
          h2->vtbl = zt_clear_vtbl;
          h2->refs = 1;
          h2->tag = 2;
          g_clear_diag.hr_clear_kinds =
              ((zt_clear_kinds_fn)(*(void ***)profile2)[10])(
                  profile2, 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x100,
                  (void *)h2);
        }
      }
    }
    ((zt_ref_fn)(*(void ***)profile)[2])(profile);
  }
  if (profile2)
    ((zt_ref_fn)(*(void ***)profile2)[2])(profile2);
  ((zt_ref_fn)(*(void ***)c13)[2])(c13);
  core->lpVtbl->Release(core);
}

/* ---- system theme (GAP H11) ------------------------------------------ */
/* mac drives NSApp.appearance app-wide and observes
   AppleInterfaceThemeChangedNotification; the Windows analogs are
   DWMWA_USE_IMMERSIVE_DARK_MODE (title bar) + Profile2
   put_PreferredColorScheme (web content, slot 9 of the same Profile2 the
   clear chain reaches) and WM_SETTINGCHANGE("ImmersiveColorSet"). */

static int g_theme_override = -1; /* -1 follow system, 0 light, 1 dark */

static int zt_theme_sys_dark(void) {
  DWORD apps = 1;
  DWORD size = sizeof(apps);
  if (RegGetValueW(HKEY_CURRENT_USER,
                   L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\"
                   L"Personalize",
                   L"AppsUseLightTheme", RRF_RT_DWORD, NULL, &apps,
                   &size) == ERROR_SUCCESS)
    return apps ? 0 : 1;
  return 0;
}

static int zt_theme_effective_dark(void) {
  return g_theme_override >= 0 ? g_theme_override : zt_theme_sys_dark();
}

/* Profile lives off ICoreWebView2_13::get_Profile — a direct QI of
   ICoreWebView2Profile2 on the core FAILS (independent interface level).
   Returns a ref the caller must Release, or NULL. */
static void *zt_profile2_of_webview(webview_t wv) {
  ICoreWebView2Controller *ctl =
      (ICoreWebView2Controller *)webview_get_native_handle(
          wv, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER);
  ICoreWebView2 *core = NULL;
  void *c13 = NULL, *profile = NULL, *profile2 = NULL;
  if (!ctl || ctl->lpVtbl->get_CoreWebView2(ctl, &core) != S_OK || !core)
    return NULL;
  if (core->lpVtbl->QueryInterface(core, &zt_IID_CoreWebView2_13, &c13) ==
          S_OK &&
      c13) {
    if (((zt_get_profile_fn)(*(void ***)c13)[105])(c13, &profile) == S_OK &&
        profile) {
      ((zt_qi_fn)(*(void ***)profile)[0])(profile, &zt_IID_Profile2,
                                          &profile2);
      ((zt_ref_fn)(*(void ***)profile)[2])(profile);
    }
    ((zt_ref_fn)(*(void ***)c13)[2])(c13);
  }
  core->lpVtbl->Release(core);
  return profile2;
}

static void theme_apply_webview(webview_t wv, int dark) {
  HWND w = zt_hwnd_for(wv);
  if (w) {
    BOOL on = dark ? TRUE : FALSE;
    DwmSetWindowAttribute(w, 20 /* DWMWA_USE_IMMERSIVE_DARK_MODE */, &on,
                          sizeof(on));
  }
  {
    void *profile2 = zt_profile2_of_webview(wv);
    if (profile2) {
      int scheme = dark ? 2 : 1; /* auto / light / dark */
      ((zt_put_scheme_fn)(*(void ***)profile2)[9])(profile2, scheme);
      ((zt_ref_fn)(*(void ***)profile2)[2])(profile2);
    }
  }
}

static void theme_apply_all(int dark) {
  theme_apply_webview(zt_w, dark);
  for (int i = 0; i < zt_webview_count(); i++) {
    const char *lb = zt_webview_label_at(i);
    if (lb && strcmp(lb, "main") == 0) continue; /* zt_w already applied */
    theme_apply_webview(zt_webview(lb), dark);
  }
}

/* Line shape identical to host_macos.c emit_theme_change_all: main first,
   then every registered webview (main skipped in the registry walk). */
static void emit_theme_change_all(void) {
  const char *t = zt_theme_effective_dark() ? "dark" : "light";
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"main\",\"event\":\"theme_"
           "change\",\"theme\":\"%s\"}",
           t);
  zt_send_line(buf);
  for (int i = 0; i < zt_webview_count(); i++) {
    const char *lb = zt_webview_label_at(i);
    if (!lb || strcmp(lb, "main") == 0) continue;
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"theme_"
             "change\",\"theme\":\"%s\"}",
             lb, t);
    zt_send_line(buf);
  }
}

static void theme_system_changed(void) {
  if (g_theme_override < 0) theme_apply_all(zt_theme_sys_dark());
  emit_theme_change_all();
}

static void reply_image_id(Msg *m, GpBitmap *bmp) {
  char buf[32];
  int idn = image_add(bmp);
  snprintf(buf, sizeof(buf), "%d", idn);
  zt_reply_string(m->req_id, buf);
}

static void handle_window_op(Msg *m, webview_t wv) {
  HWND w = zt_hwnd_for(wv);
  if (!w) {
    /* Window gone (e.g. mid-destroy): answer queries so callers never hang. */
    if (m->req_id >= 0) zt_reply_query(m->req_id, "false");
    return;
  }
  int result = 0;

  if (strcmp(m->type, "minimize") == 0) {
    ShowWindow(w, SW_MINIMIZE);
  } else if (strcmp(m->type, "unminimize") == 0) {
    ShowWindow(w, SW_RESTORE);
  } else if (strcmp(m->type, "toggle_maximize") == 0) {
    ShowWindow(w, IsZoomed(w) ? SW_RESTORE : SW_MAXIMIZE);
  } else if (strcmp(m->type, "is_maximized") == 0) {
    result = IsZoomed(w);
  } else if (strcmp(m->type, "is_minimized") == 0) {
    result = IsIconic(w);
  } else if (strcmp(m->type, "is_fullscreen") == 0) {
    RECT wr;
    MONITORINFO mi = { sizeof(mi) };
    HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTOPRIMARY);
    GetMonitorInfo(mon, &mi);
    GetWindowRect(w, &wr);
    result = wr.left == mi.rcMonitor.left && wr.top == mi.rcMonitor.top &&
             wr.right == mi.rcMonitor.right && wr.bottom == mi.rcMonitor.bottom;
  } else if (strcmp(m->type, "set_fullscreen") == 0 ||
             strcmp(m->type, "set_fullscreen_on_monitor") == 0 ||
             strcmp(m->type, "set_simple_fullscreen") == 0) {
    /* Monitor targeting pending (HMONITOR match); fullscreen for now. */
    apply_fullscreen(w, m->bool_val);
  } else if (strcmp(m->type, "maximize") == 0) {
    ShowWindow(w, SW_MAXIMIZE);
  } else if (strcmp(m->type, "unmaximize") == 0) {
    ShowWindow(w, SW_RESTORE);
  } else if (strcmp(m->type, "is_enabled") == 0) {
    result = IsWindowEnabled(w);
  } else if (strcmp(m->type, "set_always_on_bottom") == 0) {
    if (m->bool_val) track_topmost(w, 0);
    SetWindowPos(w, m->bool_val ? HWND_BOTTOM : HWND_NOTOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  } else if (strcmp(m->type, "is_focused") == 0) {
    result = GetForegroundWindow() == w;
  } else if (strcmp(m->type, "is_decorated") == 0) {
    result = (GetWindowLongPtr(w, GWL_STYLE) & WS_CAPTION) != 0;
  } else if (strcmp(m->type, "set_minimizable") == 0) {
    LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
    if (m->bool_val) style |= WS_MINIMIZEBOX; else style &= ~WS_MINIMIZEBOX;
    SetWindowLongPtr(w, GWL_STYLE, style);
    SetWindowPos(w, 0, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
  } else if (strcmp(m->type, "is_minimizable") == 0) {
    result = (GetWindowLongPtr(w, GWL_STYLE) & WS_MINIMIZEBOX) != 0;
  } else if (strcmp(m->type, "set_maximizable") == 0) {
    LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
    if (m->bool_val) style |= WS_MAXIMIZEBOX; else style &= ~WS_MAXIMIZEBOX;
    SetWindowLongPtr(w, GWL_STYLE, style);
    SetWindowPos(w, 0, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
  } else if (strcmp(m->type, "is_maximizable") == 0) {
    result = (GetWindowLongPtr(w, GWL_STYLE) & WS_MAXIMIZEBOX) != 0;
  } else if (strcmp(m->type, "set_closable") == 0) {
    EnableMenuItem(GetSystemMenu(w, FALSE), SC_CLOSE,
                   MF_BYCOMMAND | (m->bool_val ? MF_ENABLED : MF_GRAYED));
  } else if (strcmp(m->type, "is_closable") == 0) {
    UINT st = GetMenuState(GetSystemMenu(w, FALSE), SC_CLOSE, MF_BYCOMMAND);
    result = (st & (MF_GRAYED | MF_DISABLED)) == 0;
  } else if (strcmp(m->type, "set_skip_taskbar") == 0) {
    LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
    if (m->bool_val) ex |= WS_EX_TOOLWINDOW; else ex &= ~WS_EX_TOOLWINDOW;
    SetWindowLongPtr(w, GWL_EXSTYLE, ex);
    SetWindowPos(w, 0, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
  } else if (strcmp(m->type, "set_background_color") == 0) {
    /* GAP H16: the webview surface color, not the HWND's — the browser
       paints over the redirection surface everywhere except where its
       own background is transparent. */
    COREWEBVIEW2_COLOR col = zt_parse_bg_color(m->str2);
    HRESULT hr = webview_background_rgba(wv, col);
    fprintf(stderr, "[zt] bg_color str2='%s' argb=%02x%02x%02x%02x hr=0x%08lx\n",
            m->str2, col.A, col.R, col.G, col.B, (unsigned long)hr);
  } else if (strcmp(m->type, "set_content_protected") == 0) {
    SetWindowDisplayAffinity(w, m->bool_val ? WDA_MONITOR : WDA_NONE);
  } else if (strcmp(m->type, "request_user_attention") == 0) {
    FLASHWINFO fi = { sizeof(fi), w,
                      m->bool_val ? (FLASHW_ALL | FLASHW_TIMERNOFG) : FLASHW_STOP,
                      5, 0 };
    FlashWindowEx(&fi);
  } else if (strcmp(m->type, "set_focusable") == 0) {
    LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
    if (m->bool_val) ex &= ~WS_EX_NOACTIVATE; else ex |= WS_EX_NOACTIVATE;
    SetWindowLongPtr(w, GWL_EXSTYLE, ex);
  } else if (strcmp(m->type, "set_cursor_visible") == 0) {
    if ((m->bool_val != 0) != (g_cursor_visible != 0)) {
      ShowCursor(m->bool_val);
      g_cursor_visible = m->bool_val != 0;
    }
  } else if (strcmp(m->type, "window_set_min_size") == 0) {
    WinState *st = win_state(zt_hwnd_for(wv));
    if (st) { st->min_w = m->width; st->min_h = m->height; }
  } else if (strcmp(m->type, "window_set_max_size") == 0) {
    WinState *st = win_state(zt_hwnd_for(wv));
    if (st) { st->max_w = m->width; st->max_h = m->height; }
  } else if (strcmp(m->type, "set_progress_bar") == 0) {
    taskbar_progress(w, m->opacity_val);
  } else if (strcmp(m->type, "set_badge_count") == 0 ||
             strcmp(m->type, "set_badge_label") == 0) {
    /* Badge: Windows analog is a taskbar overlay icon rendered from text —
       needs GDI text-to-HICON; round-trip only for now. */
  } else if (strcmp(m->type, "set_cursor_grab") == 0) {
    /* No Win32 grab without a raw-input capture loop; accepted no-op. */
  } else if (strcmp(m->type, "window_set_icon") == 0) {
    /* Image registry id in m->id ("-1" clears). */
    GpBitmap *bmp = image_by_id(m->id[0] ? atoi(m->id) : -1);
    HICON icon = NULL;
    if (bmp) {
      gdiplus_ensure();
      if (GdipCreateHICONFromBitmap(bmp, &icon) != 0) icon = NULL;
    }
    SendMessage(w, WM_SETICON, ICON_BIG, (LPARAM)icon);
    SendMessage(w, WM_SETICON, ICON_SMALL, (LPARAM)icon);
  } else if (strcmp(m->type, "window_set_overlay_icon") == 0) {
    GpBitmap *bmp = image_by_id(m->id[0] ? atoi(m->id) : -1);
    HICON icon = NULL;
    if (bmp) {
      gdiplus_ensure();
      if (GdipCreateHICONFromBitmap(bmp, &icon) != 0) icon = NULL;
    }
    if (!g_taskbar) taskbar_progress(w, -1); /* ensures COM + instance */
    if (g_taskbar)
      g_taskbar->lpVtbl->SetOverlayIcon(g_taskbar, w, icon, NULL);
  } else if (strcmp(m->type, "set_effects") == 0 ||
             /* legacy alias (nothing emits it today; kept for symmetry
                with the window_* op family) */
             strcmp(m->type, "window_set_effects") == 0) {
    window_set_effects(w, wv, m->str2, m->aux, m->str);
  } else if (strcmp(m->type, "clear_effects") == 0 ||
             strcmp(m->type, "window_clear_effects") == 0) {
    effects_clear(w, wv);
  } else if (strcmp(m->type, "window_effects_query") == 0) {
    effects_query(m, wv, w);
    return; /* replied inline; skip the generic true/false reply */
  } else if (strcmp(m->type, "set_file_drop_enabled") == 0) {
    WinState *st = win_state(w);
    if (st)
      st->drop_disabled = !m->bool_val; /* gate checked by the drop target */
  } else if (strcmp(m->type, "dragdrop_simulate") == 0) {
    /* H8 probe vehicle (host-only op): build a real CF_HDROP payload from
       m->str (JSON path array) and run the production extractor + emitters
       for the full enter/over/drop/leave sequence. Coords arrive already
       client-local (m->x/m->y), so no ScreenToClient here. The OLE drag
       loop itself is OS plumbing a terminal CI cannot drive. */
    HWND main = w;
    WCHAR *wide;
    char paths[65536];
    if (drop_disabled(main)) {
      /* Same contract as the live drop target: gated = fully silent. */
      zt_reply_query(m->req_id, "true");
      return;
    }
    wide = (WCHAR *)malloc(4096 * sizeof(WCHAR));
    if (wide) {
      int n = drop_json_paths_utf16(m->str, wide, 4096);
      if (n > 0) {
        size_t len = 0, bytes;
        while (wide[len])
          len += wcslen(wide + len) + 1;
        len++; /* second terminator */
        bytes = sizeof(DROPFILES) + len * sizeof(WCHAR);
        HGLOBAL g = GlobalAlloc(GMEM_MOVEABLE, bytes);
        if (g) {
          DROPFILES *df = (DROPFILES *)GlobalLock(g);
          if (df) {
            memset(df, 0, sizeof(*df));
            df->pFiles = sizeof(DROPFILES);
            df->fWide = TRUE;
            memcpy(df + 1, wide, len * sizeof(WCHAR));
            GlobalUnlock(g);
            if (drop_hdrop_paths_json((HDROP)g, paths, sizeof(paths)) > 0) {
              drop_emit(main, "drag_enter", paths, (long)m->x, (long)m->y);
              drop_emit(main, "drag_over", NULL, (long)m->x, (long)m->y);
              drop_emit(main, "drag_drop", paths, (long)m->x, (long)m->y);
            }
            GlobalFree(g);
          }
        }
      }
      free(wide);
    }
    /* bare leave closes the sequence regardless of path count */
    {
      char buf[192];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":"
               "\"drag_leave\"}",
               zt_label_for_window((void *)main));
      zt_send_line(buf);
    }
    zt_reply_query(m->req_id, "true");
    return;
  } else if (strcmp(m->type, "set_visible_on_all_workspaces") == 0) {
    /* No Win32 equivalent; accepted no-op. */
  } else if (strcmp(m->type, "set_always_on_top") == 0) {
    track_topmost(w, m->bool_val);
    SetWindowPos(w, m->bool_val ? HWND_TOPMOST : HWND_NOTOPMOST, 0, 0, 0, 0,
                 SWP_NOMOVE | SWP_NOSIZE);
  } else if (strcmp(m->type, "center") == 0) {
    RECT r;
    GetWindowRect(w, &r);
    int ww = r.right - r.left, wh = r.bottom - r.top;
    int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
    SetWindowPos(w, 0, (sw - ww) / 2, (sh - wh) / 2, 0, 0,
                 SWP_NOSIZE | SWP_NOZORDER);
  } else if (strcmp(m->type, "set_focus") == 0) {
    SetForegroundWindow(w);
  } else if (strcmp(m->type, "set_visible") == 0) {
    ShowWindow(w, m->bool_val ? SW_SHOW : SW_HIDE);
  } else if (strcmp(m->type, "set_resizable") == 0) {
    LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
    if (m->bool_val) style |= WS_THICKFRAME | WS_MAXIMIZEBOX;
    else style &= ~(WS_THICKFRAME | WS_MAXIMIZEBOX);
    SetWindowLongPtr(w, GWL_STYLE, style);
  } else if (strcmp(m->type, "set_opacity") == 0) {
    SetWindowLongPtr(w, GWL_EXSTYLE,
                     GetWindowLongPtr(w, GWL_EXSTYLE) | WS_EX_LAYERED);
    SetLayeredWindowAttributes(w, 0, (BYTE)(m->opacity_val * 255), LWA_ALPHA);
  } else if (strcmp(m->type, "set_transparent") == 0) {
    LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
    if (m->bool_val) ex |= WS_EX_LAYERED | WS_EX_TRANSPARENT;
    else ex &= ~(WS_EX_LAYERED | WS_EX_TRANSPARENT);
    SetWindowLongPtr(w, GWL_EXSTYLE, ex);
  } else if (strcmp(m->type, "set_decorations") == 0) {
    LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
    if (m->bool_val) style |= WS_OVERLAPPEDWINDOW;
    else style &= ~WS_OVERLAPPEDWINDOW;
    SetWindowLongPtr(w, GWL_STYLE, style);
  } else if (strcmp(m->type, "set_shadow") == 0) {
    LONG_PTR cls = GetClassLongPtr(w, GCL_STYLE);
    if (m->bool_val) cls |= CS_DROPSHADOW;
    else cls &= ~CS_DROPSHADOW;
    SetClassLongPtr(w, GCL_STYLE, cls);
  } else if (strcmp(m->type, "set_enabled") == 0) {
    EnableWindow(w, m->bool_val);
  }

  if (m->req_id >= 0) zt_reply_query(m->req_id, result ? "true" : "false");
}

/* ---- tray (Shell_NotifyIcon) ---- */

/* H13 menu-popup cancel probe: WM_TIMER id that unwinds the modal
   TrackPopupMenu loop from the outside (see zt_proc WM_TIMER). */
#define ZT_MENU_CANCEL_TIMER 4711

static HWND g_tray_hwnd = NULL;
static NOTIFYICONDATAW g_nid;

static void emit_tray_event(const char *event) {
  char buf[128];
  snprintf(buf, sizeof(buf), "{\"type\":\"tray_event\",\"event\":\"%s\"}", event);
  zt_send_line(buf);
}

/* Window lifecycle events route per-label like macOS (emit_window_event_
   labeled): the runtime resolves the label and fans out to the Window
   handle; unknown labels are dropped there. Never routed as tray_event —
   the two consumers expect different payloads. */
static void emit_window_event(HWND h, const char *event) {
  char buf[192];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\"}",
           zt_label_for_window((void *)h), event);
  zt_send_line(buf);
}

/* Window proc forwarding tray/menu/window messages; the host's main window
 * proc (in webview/webview) may already handle some; we hook via subclass. */
static void zt_shortcut_pressed(int id);
static void tray_popup_menu(void); /* menu registry lives below */
static void menu_emit_for_cmd(int cmd);

static LRESULT CALLBACK zt_proc(HWND h, UINT msg, WPARAM wp, LPARAM lp,
                                UINT_PTR id, DWORD_PTR ref) {
  (void)id;
  (void)ref;
  switch (msg) {
    case WM_APP + 1: /* tray callback */
      if (LOWORD(lp) == WM_LBUTTONUP) {
        emit_tray_event("click");
        tray_popup_menu();
      }
      return 0;
    case WM_TIMER:
      /* menu_popup cancel probe (H13): end the modal TrackPopupMenu loop
         from outside — DefWindowProc's WM_CANCELMODE handling unwinds it. */
      if (wp == ZT_MENU_CANCEL_TIMER) {
        KillTimer(h, wp);
        SendMessage(h, WM_CANCELMODE, 0, 0);
        return 0;
      }
      break;
    case WM_COMMAND:
      if (lp == 0) menu_emit_for_cmd(LOWORD(wp));
      break;
    case WM_HOTKEY:
      zt_shortcut_pressed((int)wp);
      return 0;
    case WM_SETTINGCHANGE:
      /* GAP H11: the OS broadcasts this with lParam = "ImmersiveColorSet"
         when the personalization theme flips (mac
         AppleInterfaceThemeChangedNotification analog). */
      if (lp && lstrcmpiW((LPCWSTR)lp, L"ImmersiveColorSet") == 0)
        theme_system_changed();
      break;
    case WM_COPYDATA: {
      /* Deep-link hot activation (GAP H9): the second process the OS
         spawned for ztron:// hands the URL over here. WM_COPYDATA maps
         lpData into our address space for the handler's duration. */
      COPYDATASTRUCT *cds = (COPYDATASTRUCT *)lp;
      if (cds && cds->dwData == ZT_DLCOPY_MAGIC && cds->lpData &&
          cds->cbData > 0 && cds->cbData < 2048 &&
          strncmp((const char *)cds->lpData, "ztron://", 8) == 0) {
        char url[2048];
        snprintf(url, sizeof(url), "%s", (const char *)cds->lpData);
        dl_emit(url);
        return TRUE;
      }
      break; /* foreign payload: let the subclass chain handle it */
    }
    case WM_ACTIVATE:
      emit_window_event(h, LOWORD(wp) == WA_INACTIVE ? "blur" : "focus");
      break;
    case WM_MOVE:
      emit_window_event(h, "move");
      break;
    case WM_SIZE:
      emit_window_event(h, "resize");
      break;
    case WM_CLOSE: {
      /* mac zt_should_close parity: with prevent_close armed the close is
         intercepted and surfaced as a "close" window event (-> ztron://
         close-requested); the backend decides whether to destroy. Without
         it the default engine path runs (WM_CLOSE -> DestroyWindow). */
      WinState *st = win_state(h);
      if (st && st->prevent_close) {
        emit_window_event(h, "close");
        return 0;
      }
      break;
    }
    case WM_DESTROY:
      win_state_drop(h);
      break;
    case WM_GETMINMAXINFO: {
      WinState *st = win_state(h);
      MINMAXINFO *mmi = (MINMAXINFO *)lp;
      if (st && st->min_w > 0) mmi->ptMinTrackSize.x = st->min_w;
      if (st && st->min_h > 0) mmi->ptMinTrackSize.y = st->min_h;
      if (st && st->max_w > 0) mmi->ptMaxTrackSize.x = st->max_w;
      if (st && st->max_h > 0) mmi->ptMaxTrackSize.y = st->max_h;
      return 0;
    }
  }
  return DefSubclassProc(h, msg, wp, lp);
}

static void tray_create(const char *title, const char *tid);
static void tray_remove_by_id(const char *tid);
static void tray_get_by_id(const char *tid, int req_id);

/* Single-instance tray (Shell_NotifyIconW holds one icon): the id of the
   live icon backs getById / remove_by_id, mirroring the darwin registry's
   query surface without a full multi-icon registry. */
static char g_tray_id[64] = "";

static void tray_create(const char *title, const char *tid) {
  HWND w = zt_hwnd();
  if (!w) return;
  snprintf(g_tray_id, sizeof(g_tray_id), "%s", tid ? tid : "");
  g_tray_hwnd = w;
  memset(&g_nid, 0, sizeof(g_nid));
  g_nid.cbSize = sizeof(g_nid);
  g_nid.hWnd = w;
  g_nid.uID = 1;
  g_nid.uFlags = NIF_MESSAGE | NIF_TIP;
  g_nid.uCallbackMessage = WM_APP + 1;
  to_wide(title, g_nid.szTip, sizeof(g_nid.szTip) / sizeof(wchar_t));
  Shell_NotifyIconW(NIM_ADD, &g_nid);
}
static void tray_set_title(const char *title) {
  if (g_tray_hwnd) {
    g_nid.uFlags = NIF_TIP;
    to_wide(title, g_nid.szTip, sizeof(g_nid.szTip) / sizeof(wchar_t));
    Shell_NotifyIconW(NIM_MODIFY, &g_nid);
  }
}
static void tray_set_tooltip(const char *tooltip) { tray_set_title(tooltip); }
static void tray_set_icon(const char *path) {
  if (g_tray_hwnd && path && path[0]) {
    HICON icon = (HICON)LoadImageA(NULL, path, IMAGE_ICON, 0, 0,
                                   LR_LOADFROMFILE | LR_DEFAULTSIZE);
    if (icon) {
      g_nid.hIcon = icon;
      g_nid.uFlags = NIF_ICON;
      Shell_NotifyIconW(NIM_MODIFY, &g_nid);
    }
  }
}
static void tray_set_icon_id(int image_id) {
  GpBitmap *bmp = image_by_id(image_id);
  if (g_tray_hwnd && bmp) {
    HICON icon = NULL;
    gdiplus_ensure();
    if (GdipCreateHICONFromBitmap(bmp, &icon) == 0 && icon) {
      g_nid.hIcon = icon;
      g_nid.uFlags = NIF_ICON;
      Shell_NotifyIconW(NIM_MODIFY, &g_nid);
    }
  }
}
static void tray_destroy(void) {
  if (g_tray_hwnd) Shell_NotifyIconW(NIM_DELETE, &g_nid);
  g_tray_hwnd = NULL;
  g_tray_id[0] = '\0';
}

static void tray_remove_by_id(const char *tid) {
  if (g_tray_hwnd && tid && strcmp(tid, g_tray_id) == 0) {
    Shell_NotifyIconW(NIM_DELETE, &g_nid);
    g_tray_hwnd = NULL;
    g_tray_id[0] = '\0';
  }
}

static void tray_get_by_id(const char *tid, int req_id) {
  if (req_id >= 0) {
    int found = g_tray_hwnd && tid && strcmp(tid, g_tray_id) == 0;
    zt_reply_query(req_id, found ? "true" : "false");
  }
}

/* ---- menu (Win32 HMENU, registry-backed multi-menu) ----
   Roots and submenus are both MenuRecs; a bar menu rebuilds from its item
   registry (small menus, mutations are rare). Item command ids are 1000+index
   so WM_COMMAND maps straight back to the item. */

#define MAX_MENUS 16
#define MAX_MENU_ITEMS 128

typedef struct {
  char id[128];
  char title[256];
  int enabled;
  int checked; /* -1 = not checkable */
  int separator;
  int has_submenu;
  char kind[24];      /* predefined role (quit/minimize/copy/…; "" = plain) */
  HBITMAP bmp;        /* SetMenuItemBitmaps icon; ours; deleted with item */
} MenuItemRec;

typedef struct MenuRec_ {
  char id[64];
  HMENU hmenu; /* owned; rebuilt from items */
  HWND attached_hwnd; /* per-window menu bar (menu_set_app / set_window_menu) */
  int cmd_base; /* unique WM_COMMAND base (monotonic; 256 slots per menu) */
  MenuItemRec items[MAX_MENU_ITEMS];
  int count;
  struct MenuRec_ *parent; /* non-NULL for submenu recs */
} MenuRec;

static MenuRec g_menus[MAX_MENUS];
static int g_menu_count = 0;
static int g_menu_cmd_next = 1000; /* WORD-safe: 16*256+128 << 65536 */
static char g_tray_menu_id[64] = "";

static MenuRec *menu_by_id(const char *id) {
  int i;
  if (!id || !id[0]) return NULL;
  for (i = 0; i < g_menu_count; i++)
    if (strcmp(g_menus[i].id, id) == 0) return &g_menus[i];
  return NULL;
}

/* Submenu item children register under the submenu id with a parent — find
   that rec (or a root) for an incoming menu_id. */
static MenuRec *menu_resolve(const char *id) {
  MenuRec *m = menu_by_id(id);
  if (!m && g_menu_count > 0 && (!id || !id[0])) m = &g_menus[0];
  return m;
}

static MenuRec *menu_item_owner(MenuRec *root, const char *item_id, int *idx_out) {
  int i;
  for (i = 0; i < root->count; i++) {
    if (strcmp(root->items[i].id, item_id) == 0) {
      if (idx_out) *idx_out = i;
      return root;
    }
    if (root->items[i].has_submenu) {
      MenuRec *child = menu_by_id(root->items[i].id);
      if (child) {
        MenuRec *hit = menu_item_owner(child, item_id, idx_out);
        if (hit) return hit;
      }
    }
  }
  return NULL;
}

static void menu_rebuild(MenuRec *m);

static void menu_rebuild(MenuRec *m) {
  int i;
  if (!m) return;
  for (i = 0; i < m->count; i++) {
    MenuItemRec *it = &m->items[i];
    if (it->has_submenu) {
      MenuRec *child = menu_by_id(it->id);
      if (child) menu_rebuild(child);
    }
  }
  if (m->attached_hwnd) SetMenu(m->attached_hwnd, NULL);
  if (m->hmenu) DestroyMenu(m->hmenu);
  m->hmenu = m->parent ? CreatePopupMenu() : CreateMenu();
  for (i = 0; i < m->count; i++) {
    MenuItemRec *it = &m->items[i];
    UINT flags;
    if (it->has_submenu) {
      MenuRec *child = menu_by_id(it->id);
      if (child && child->hmenu)
        AppendMenuA(m->hmenu, MF_POPUP | MF_STRING, (UINT_PTR)child->hmenu,
                    it->title);
      continue;
    }
    if (it->separator) {
      AppendMenuA(m->hmenu, MF_SEPARATOR, 0, NULL);
      continue;
    }
    flags = MF_STRING | (it->enabled ? MF_ENABLED : MF_GRAYED);
    if (it->checked == 1) flags |= MF_CHECKED;
    AppendMenuA(m->hmenu, flags, m->cmd_base + i, it->title);
    /* SetMenuItemBitmaps associations die with the HMENU — reapply. */
    if (it->bmp)
      SetMenuItemBitmaps(m->hmenu, i, MF_BYPOSITION, it->bmp, it->bmp);
  }
  if (m->attached_hwnd) {
    SetMenu(m->attached_hwnd, m->hmenu);
    DrawMenuBar(m->attached_hwnd);
  }
}

static void menu_items_clear(MenuRec *m) {
  int i;
  for (i = 0; i < m->count; i++)
    if (m->items[i].bmp) {
      DeleteObject(m->items[i].bmp);
      m->items[i].bmp = NULL;
    }
  /* drop child submenu recs first */
  for (i = 0; i < m->count; i++) {
    if (m->items[i].has_submenu) {
      MenuRec *child = menu_by_id(m->items[i].id);
      int j;
      if (!child) continue;
      for (j = 0; j < g_menu_count; j++)
        if (&g_menus[j] == child) {
          memmove(&g_menus[j], &g_menus[j + 1],
                  (size_t)(g_menu_count - j - 1) * sizeof(MenuRec));
          g_menu_count--;
          break;
        }
    }
  }
  m->count = 0;
}

static MenuRec *menu_create(const char *menu_id) {
  MenuRec *m = menu_by_id(menu_id);
  if (!m) {
    if (g_menu_count >= MAX_MENUS) return NULL;
    m = &g_menus[g_menu_count++];
    memset(m, 0, sizeof(*m));
    snprintf(m->id, sizeof(m->id), "%s", menu_id);
    m->cmd_base = g_menu_cmd_next;
    g_menu_cmd_next += 256;
  } else {
    menu_items_clear(m);
  }
  menu_rebuild(m);
  return m;
}

static void menu_item_insert_kind(MenuRec *m, int at, const char *item_id,
                                  const char *text, int enabled,
                                  int separator, int checked, int has_submenu,
                                  const char *kind) {
  int i;
  MenuItemRec *it;
  if (!m || m->count >= MAX_MENU_ITEMS) return;
  if (at < 0 || at > m->count) at = m->count;
  for (i = m->count; i > at; i--) m->items[i] = m->items[i - 1];
  m->count++;
  it = &m->items[at];
  memset(it, 0, sizeof(*it));
  snprintf(it->id, sizeof(it->id), "%s", item_id);
  snprintf(it->title, sizeof(it->title), "%s", text ? text : "");
  it->enabled = enabled;
  it->checked = checked;
  it->separator = separator;
  it->has_submenu = has_submenu;
  snprintf(it->kind, sizeof(it->kind), "%s", kind ? kind : "");
  menu_rebuild(m);
}

static void menu_item_insert(MenuRec *m, int at, const char *item_id,
                             const char *text, int enabled, int separator,
                             int checked, int has_submenu) {
  menu_item_insert_kind(m, at, item_id, text, enabled, separator, checked,
                        has_submenu, "");
}

static void menu_item_remove(MenuRec *m, int idx) {
  int i;
  MenuItemRec *it = &m->items[idx];
  if (it->bmp) {
    DeleteObject(it->bmp);
    it->bmp = NULL;
  }
  if (it->has_submenu) {
    MenuRec *child = menu_by_id(it->id);
    int j;
    if (child) {
      for (j = 0; j < g_menu_count; j++)
        if (&g_menus[j] == child) {
          memmove(&g_menus[j], &g_menus[j + 1],
                  (size_t)(g_menu_count - j - 1) * sizeof(MenuRec));
          g_menu_count--;
          break;
        }
    }
  }
  for (i = idx; i < m->count - 1; i++) m->items[i] = m->items[i + 1];
  m->count--;
  menu_rebuild(m);
}

/* Attaches a menu as one window's menu bar (per-window document model;
   menu_set_app is the main-window special case). Only one menu bar per
   window and one window per menu — the previous holder is detached. */
static void menu_attach_to(const char *menu_id, HWND w) {
  MenuRec *m = menu_resolve(menu_id);
  int i;
  if (!m || !w) return;
  for (i = 0; i < g_menu_count; i++) {
    if (g_menus[i].attached_hwnd == w && &g_menus[i] != m) {
      g_menus[i].attached_hwnd = NULL; /* window loses its old bar */
      break;
    }
  }
  if (m->attached_hwnd && m->attached_hwnd != w)
    SetMenu(m->attached_hwnd, NULL); /* menu leaves its old window */
  m->attached_hwnd = w;
  menu_rebuild(m);
}

static void menu_set_app(const char *menu_id) {
  menu_attach_to(menu_id, zt_hwnd());
}

/* GAP H14: per-window menu bar (mac setMenu: document-window model). */
static void menu_set_window_menu(const char *menu_id, const char *label) {
  webview_t wv = zt_webview(label);
  menu_attach_to(menu_id, wv ? zt_hwnd_for(wv) : NULL);
}

/* GAP H14: set a bitmap icon on an existing item (IconMenuItem.setIcon —
   SetMenuItemBitmaps keeps system text drawing, no owner-draw). Spec:
   numeric = image-registry id (GDI+ GpBitmap -> HBITMAP), else a file
   path. Mac stock-kind names ("Copy") have no Win32 analog: no-op. */
static void menu_set_item_icon(const char *menu_id, const char *item_id,
                               const char *spec) {
  MenuRec *root = menu_resolve(menu_id);
  MenuRec *owner;
  MenuItemRec *it;
  GpBitmap *src = NULL;
  HBITMAP hb = NULL;
  int idx = -1, numeric = 1;
  const char *s;
  if (!root || !spec[0]) return;
  owner = menu_item_owner(root, item_id, &idx);
  if (!owner || idx < 0) return;
  it = &owner->items[idx];
  for (s = spec; *s; s++)
    if (*s < '0' || *s > '9') { numeric = 0; break; }
  gdiplus_ensure();
  if (numeric) {
    src = image_by_id(atoi(spec));
    if (src) GdipCreateHBITMAPFromBitmap(src, &hb, 0xFFFFFFFF);
  } else if (strchr(spec, '/') || strchr(spec, '\\') || strchr(spec, '.')) {
    GpBitmap *file = NULL;
    WCHAR wpath[MAX_PATH];
    to_wide(spec, wpath, MAX_PATH);
    if (GdipCreateBitmapFromFile(wpath, &file) == 0 && file) {
      GdipCreateHBITMAPFromBitmap(file, &hb, 0xFFFFFFFF);
      GdipDisposeImage((GpImage *)file);
    }
  }
  if (!hb) return;
  if (it->bmp) DeleteObject(it->bmp);
  it->bmp = hb;
  if (owner->hmenu) SetMenuItemBitmaps(owner->hmenu, idx, MF_BYPOSITION,
                                       hb, hb);
}

static void menu_destroy(const char *menu_id) {
  MenuRec *m = menu_by_id(menu_id);
  if (!m) return;
  if (m->attached_hwnd) {
    SetMenu(m->attached_hwnd, NULL);
    DrawMenuBar(m->attached_hwnd);
  }
  m->attached_hwnd = NULL;
  menu_items_clear(m);
  if (m->hmenu) DestroyMenu(m->hmenu);
  m->hmenu = NULL;
}

/* Registers a submenu rec + popup item (same shape as the
   menu_add_submenu_item dispatch branch, callable from C). */
static void menu_default_submenu(const char *root, const char *sid,
                                 const char *title) {
  MenuRec *parent = menu_resolve(root);
  MenuRec *child = menu_by_id(sid);
  if (!child && g_menu_count < MAX_MENUS) {
    child = &g_menus[g_menu_count++];
    memset(child, 0, sizeof(*child));
    snprintf(child->id, sizeof(child->id), "%s", sid);
    child->cmd_base = g_menu_cmd_next;
    g_menu_cmd_next += 256;
    child->parent = parent;
    menu_rebuild(child);
  }
  if (parent) menu_item_insert(parent, -1, sid, title, 1, 0, -1, 1);
}

/* GAP H14: standard application menu tree under one root id (mac
   menu_create_default parity: App/Edit/View/Window with the same item
   ids). Role items carry their kind for menu_role_action at click time. */
static void menu_create_default(const char *root) {
  char sid[128], iid[192];
  if (!menu_resolve(root)) menu_create(root);
#define ZD_PRE(PARENT, TAG, TEXT, KIND)                                     \
  do {                                                                      \
    snprintf(iid, sizeof(iid), "%s." TAG, PARENT);                          \
    menu_item_insert_kind(menu_resolve(PARENT), -1, iid, TEXT, 1, 0, -1, 0, \
                          KIND);                                            \
  } while (0)
#define ZD_SEP(PARENT, TAG)                                                 \
  do {                                                                      \
    snprintf(iid, sizeof(iid), "%s.$sep" TAG, PARENT);                      \
    menu_item_insert_kind(menu_resolve(PARENT), -1, iid, "", 1, 1, -1, 0,   \
                          "");                                              \
  } while (0)
  snprintf(sid, sizeof(sid), "%s.app", root);
  menu_default_submenu(root, sid, "App");
  ZD_PRE(sid, "about", "About", "about");
  ZD_SEP(sid, "0");
  ZD_PRE(sid, "hide", "Hide", "hide");
  ZD_PRE(sid, "hideOthers", "Hide Others", "hideOthers");
  ZD_PRE(sid, "showAll", "Show All", "showAll");
  ZD_SEP(sid, "1");
  ZD_PRE(sid, "quit", "Quit", "quit");
  snprintf(sid, sizeof(sid), "%s.edit", root);
  menu_default_submenu(root, sid, "Edit");
  ZD_PRE(sid, "undo", "Undo", "undo");
  ZD_PRE(sid, "redo", "Redo", "redo");
  ZD_SEP(sid, "0");
  ZD_PRE(sid, "cut", "Cut", "cut");
  ZD_PRE(sid, "copy", "Copy", "copy");
  ZD_PRE(sid, "paste", "Paste", "paste");
  ZD_PRE(sid, "selectAll", "Select All", "selectAll");
  snprintf(sid, sizeof(sid), "%s.view", root);
  menu_default_submenu(root, sid, "View");
  ZD_PRE(sid, "fullscreen", "Toggle Full Screen", "fullscreen");
  snprintf(sid, sizeof(sid), "%s.window", root);
  menu_default_submenu(root, sid, "Window");
  ZD_PRE(sid, "minimize", "Minimize", "minimize");
  ZD_PRE(sid, "maximize", "Zoom", "maximize");
  ZD_SEP(sid, "0");
  ZD_PRE(sid, "front", "Bring All to Front", "bringAllToFront");
#undef ZD_PRE
#undef ZD_SEP
}

static void menu_set_item_enabled(const char *menu_id, const char *item_id, int enabled) {
  MenuRec *root = menu_resolve(menu_id);
  int idx = -1;
  MenuRec *owner = root ? menu_item_owner(root, item_id, &idx) : NULL;
  if (owner) {
    owner->items[idx].enabled = enabled;
    menu_rebuild(owner);
  }
}

static void menu_set_item_title(const char *menu_id, const char *item_id, const char *title) {
  MenuRec *root = menu_resolve(menu_id);
  int idx = -1;
  MenuRec *owner = root ? menu_item_owner(root, item_id, &idx) : NULL;
  if (owner) {
    snprintf(owner->items[idx].title, sizeof(owner->items[idx].title), "%s", title);
    menu_rebuild(owner);
  }
}

static void menu_set_item_checked(const char *menu_id, const char *item_id, int checked) {
  MenuRec *root = menu_resolve(menu_id);
  int idx = -1;
  MenuRec *owner = root ? menu_item_owner(root, item_id, &idx) : NULL;
  if (owner) {
    owner->items[idx].checked = checked ? 1 : 0;
    menu_rebuild(owner);
  }
}

/* Structured snapshot for plugin:menu|items. */
static void menu_reply_items(Msg *m) {
  MenuRec *mn = menu_resolve(m->str);
  static char buf[16384];
  size_t len;
  int i;
  buf[0] = '[';
  len = 1;
  if (mn) {
    for (i = 0; i < mn->count; i++) {
      MenuItemRec *it = &mn->items[i];
      char id_e[300], title_e[600], menu_e[130];
      char tmp[1200];
      int n;
      zt_json_escape(it->id, id_e, sizeof(id_e));
      zt_json_escape(it->title, title_e, sizeof(title_e));
      zt_json_escape(mn->id, menu_e, sizeof(menu_e));
      n = snprintf(tmp, sizeof(tmp),
          "%s{\"id\":\"%s\",\"menuId\":\"%s\",\"title\":\"%s\","
          "\"enabled\":%s,\"checked\":%s,\"separator\":%s,\"hasSubmenu\":%s}",
          len > 1 ? "," : "", id_e, menu_e, title_e,
          it->enabled ? "true" : "false",
          it->checked == 1 ? "true" : "false",
          it->separator ? "true" : "false",
          it->has_submenu ? "true" : "false");
      if (len + (size_t)n + 2 >= sizeof(buf)) break;
      memcpy(buf + len, tmp, (size_t)n);
      len += (size_t)n;
    }
  }
  buf[len] = ']';
  buf[len + 1] = '\0';
  zt_reply_query(m->req_id, buf);
}

/* Command dispatch: WM_COMMAND (bar / tray popup) and TrackPopupMenu's
   TPM_RETURNCMD both funnel here. Command bases are unique per registered
   menu (roots AND submenu recs), so the owning menu is exact — a click in
   a submenu or a popup no longer misattributes to an attached bar menu.
   Predefined role items additionally run their built-in behavior. */
static void menu_role_action(const char *kind);

static void menu_emit_for_cmd(int cmd) {
  int i;
  for (i = 0; i < g_menu_count; i++) {
    MenuRec *m = &g_menus[i];
    int idx = cmd - m->cmd_base;
    if (idx >= 0 && idx < m->count && !m->items[idx].separator &&
        !m->items[idx].has_submenu) {
      char ei[300], em[130], buf[700];
      zt_json_escape(m->items[idx].id, ei, sizeof(ei));
      zt_json_escape(m->id, em, sizeof(em));
      snprintf(buf, sizeof(buf),
               "{\"type\":\"menu_event\",\"menu_id\":\"%s\",\"item_id\":\"%s\"}",
               em, ei);
      zt_send_line(buf);
      menu_role_action(m->items[idx].kind);
      return;
    }
  }
}

/* Built-in behavior for predefined role items (GAP H14). mac routes these
   through first-responder selectors; Windows gets direct analogs where
   Win32 has one. Every role ALSO emits its menu_event (above) so apps can
   observe/override. Best-effort: clipboard/edit messages go to the focused
   HWND (WebView2 child handles the classics; no cross-process focus
   guarantees). */
static void menu_role_action(const char *kind) {
  HWND w = zt_hwnd();
  GUITHREADINFO gi;
  if (!kind[0]) return;
  if (strcmp(kind, "minimize") == 0) {
    if (w) ShowWindow(w, SW_MINIMIZE);
    return;
  }
  if (strcmp(kind, "maximize") == 0) {
    if (w) ShowWindow(w, IsZoomed(w) ? SW_RESTORE : SW_MAXIMIZE);
    return;
  }
  if (strcmp(kind, "quit") == 0) {
    if (w) PostMessage(w, WM_CLOSE, 0, 0);
    return;
  }
  if (strcmp(kind, "hide") == 0) {
    if (w) ShowWindow(w, SW_HIDE);
    return;
  }
  if (strcmp(kind, "showAll") == 0 || strcmp(kind, "bringAllToFront") == 0) {
    int i;
    for (i = 0; i < zt_webview_count(); i++) {
      HWND hw = zt_hwnd_for(zt_webview(zt_webview_label_at(i)));
      if (hw) ShowWindow(hw, SW_SHOW);
    }
    return;
  }
  if (strcmp(kind, "hideOthers") == 0) {
    int i;
    for (i = 0; i < zt_webview_count(); i++) {
      HWND hw = zt_hwnd_for(zt_webview(zt_webview_label_at(i)));
      if (hw && hw != w) ShowWindow(hw, SW_HIDE);
    }
    return;
  }
  if (strcmp(kind, "undo") == 0 || strcmp(kind, "cut") == 0 ||
      strcmp(kind, "copy") == 0 || strcmp(kind, "paste") == 0 ||
      strcmp(kind, "selectAll") == 0) {
    UINT msg = 0;
    memset(&gi, 0, sizeof(gi));
    gi.cbSize = sizeof(gi);
    if (!GetGUIThreadInfo(0, &gi) || !gi.hwndFocus) return;
    if (strcmp(kind, "undo") == 0) msg = WM_UNDO;
    else if (strcmp(kind, "cut") == 0) msg = WM_CUT;
    else if (strcmp(kind, "copy") == 0) msg = WM_COPY;
    else if (strcmp(kind, "paste") == 0) msg = WM_PASTE;
    else if (strcmp(kind, "selectAll") == 0) {
      PostMessage(gi.hwndFocus, EM_SETSEL, 0, -1);
      return;
    }
    PostMessage(gi.hwndFocus, msg, 0, 0);
    return;
  }
  /* about / hideOthers-style roles without a Win32 analog stay
     event-only; fullscreen toggling is window-state territory (existing
     set_fullscreen op), not a menu role. */
}

/* Shared TrackPopupMenu core for programmatic popups (GAP H13). Returns
   the selected command id (0 = dismissed/cancelled, -1 = bad args).
   Coordinates are client coords of w; (0,0) means "at the cursor" — mac
   parity (popUpMenuPositioningItem at the mouse location). TPM_RETURNCMD
   keeps the selection attribution exact instead of merging into
   WM_COMMAND. */
static int menu_popup_track(MenuRec *pm, HWND w, int x, int y) {
  POINT pt;
  int cmd;
  if (!pm || !pm->hmenu || !w) return -1;
  if (x != 0 || y != 0) {
    pt.x = x;
    pt.y = y;
    ClientToScreen(w, &pt);
  } else {
    GetCursorPos(&pt);
  }
  /* A background host (CI job, launched-but-unfocused app) is denied
     SetForegroundWindow, and the popup then never sees keyboard input —
     attach to the foreground thread to borrow its activation rights
     (the standard trick; mac popUp menus surface the same way). */
  {
    DWORD fg_tid = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
    DWORD my_tid = GetCurrentThreadId();
    BOOL attached = fg_tid && fg_tid != my_tid &&
                    AttachThreadInput(my_tid, fg_tid, TRUE);
    SetForegroundWindow(w);
    SetActiveWindow(w);
    if (attached) AttachThreadInput(my_tid, fg_tid, FALSE);
  }
  cmd = (int)TrackPopupMenu(pm->hmenu,
                            TPM_RETURNCMD | TPM_LEFTALIGN | TPM_TOPALIGN,
                            pt.x, pt.y, 0, w, NULL);
  PostMessage(w, WM_NULL, 0, 0);
  return cmd;
}

/* GAP H15: whole-app hide/show — the NSApp hide:/unhide analog. Windows
   has no per-app visibility, so cover the main window FIRST (it is not
   in the registry — add_webview only registers non-main labels) and then
   every registered extra window; each keeps its own state and just goes
   off-screen. Show uses SW_SHOWNA so restoring z-order/focus is a
   separate, deliberate step. */
static void app_hide_all(void) {
  int i;
  if (zt_hwnd()) ShowWindow(zt_hwnd(), SW_HIDE);
  for (i = 0; i < zt_webview_count(); i++) {
    const char *lb = zt_webview_label_at(i);
    webview_t wv2 = lb ? zt_webview(lb) : NULL;
    HWND hw = (wv2 && wv2 != zt_w) ? zt_hwnd_for(wv2) : NULL;
    if (hw) ShowWindow(hw, SW_HIDE);
  }
}

static void app_show_all(void) {
  int i;
  if (zt_hwnd() && !IsWindowVisible(zt_hwnd()))
    ShowWindow(zt_hwnd(), SW_SHOWNA);
  for (i = 0; i < zt_webview_count(); i++) {
    const char *lb = zt_webview_label_at(i);
    webview_t wv2 = lb ? zt_webview(lb) : NULL;
    HWND hw = (wv2 && wv2 != zt_w) ? zt_hwnd_for(wv2) : NULL;
    if (hw && !IsWindowVisible(hw)) ShowWindow(hw, SW_SHOWNA);
  }
  /* mac app_show ends with activateIgnoringOtherApps — borrow foreground
     rights the same way menu_popup_track does (H13), best-effort: a
     background host without a foreground peer still just shows. */
  {
    HWND w = zt_hwnd();
    DWORD fg_tid = GetWindowThreadProcessId(GetForegroundWindow(), NULL);
    DWORD my_tid = GetCurrentThreadId();
    BOOL attached = fg_tid && fg_tid != my_tid &&
                    AttachThreadInput(my_tid, fg_tid, TRUE);
    if (w) {
      SetForegroundWindow(w);
      SetActiveWindow(w);
    }
    if (attached) AttachThreadInput(my_tid, fg_tid, FALSE);
  }
}

/* Probe support: inject arrow/enter keys into the foreground menu's input
   queue from a side thread while the GUI thread sits in TrackPopupMenu's
   modal loop. leaf: DOWN,ENTER (first item). sub: DOWN,DOWN,RIGHT,ENTER —
   highlight the submenu title (2nd item) then RIGHT opens it with its
   first child highlighted. */
static int g_menu_keys_sub = 0;

static void menu_probe_send_key(WORD vk) {
  INPUT in[2];
  memset(in, 0, sizeof(in));
  in[0].type = INPUT_KEYBOARD;
  in[0].ki.wVk = vk;
  in[1].type = INPUT_KEYBOARD;
  in[1].ki.wVk = vk;
  in[1].ki.dwFlags = KEYEVENTF_KEYUP;
  SendInput(2, in, sizeof(INPUT));
}

static DWORD WINAPI menu_keys_thread(LPVOID p) {
  (void)p;
  Sleep(600);
  menu_probe_send_key(VK_DOWN);
  Sleep(300);
  if (g_menu_keys_sub) {
    menu_probe_send_key(VK_DOWN);
    Sleep(300);
    menu_probe_send_key(VK_RIGHT);
    Sleep(300);
  }
  menu_probe_send_key(VK_RETURN);
  return 0;
}

/* Left-click tray popup (called from the subclassed window proc). */
static void tray_popup_menu(void) {
  if (g_tray_menu_id[0]) {
    MenuRec *tm = menu_by_id(g_tray_menu_id);
    HWND w = zt_hwnd();
    if (tm && tm->hmenu && w) {
      POINT pt;
      GetCursorPos(&pt);
      SetForegroundWindow(w);
      TrackPopupMenu(tm->hmenu, TPM_BOTTOMALIGN | TPM_LEFTALIGN,
                     pt.x, pt.y, 0, w, NULL);
      PostMessage(w, WM_NULL, 0, 0);
    }
  }
}

/* ---- dialogs (COM IFileDialog) ---- */

static void dialog_open(Msg *m) {
  OPENFILENAMEA ofn = { 0 };
  char path[MAX_PATH] = { 0 };
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = zt_hwnd();
  ofn.lpstrFile = path;
  ofn.nMaxFile = sizeof(path);
  ofn.lpstrTitle = m->id;
  ofn.Flags = OFN_FILEMUSTEXIST;
  if (GetOpenFileNameA(&ofn)) zt_reply_string(m->req_id, path);
  else zt_reply_null(m->req_id);
}
static void dialog_save(Msg *m) {
  OPENFILENAMEA ofn = { 0 };
  char path[MAX_PATH] = { 0 };
  if (m->id[0]) strncpy(path, m->id, sizeof(path) - 1);
  ofn.lStructSize = sizeof(ofn);
  ofn.hwndOwner = zt_hwnd();
  ofn.lpstrFile = path;
  ofn.nMaxFile = sizeof(path);
  ofn.lpstrTitle = m->str;
  ofn.Flags = OFN_OVERWRITEPROMPT;
  if (GetSaveFileNameA(&ofn)) zt_reply_string(m->req_id, path);
  else zt_reply_null(m->req_id);
}
static void dialog_message(Msg *m) {
  int r = MessageBoxA(zt_hwnd(), m->str2[0] ? m->str2 : m->id, m->id,
                      MB_OKCANCEL);
  char tmp[16];
  snprintf(tmp, sizeof(tmp), "%d", r == IDOK ? 0 : 1);
  zt_reply_string(m->req_id, tmp);
}

/* ask/confirm parity with mac dialog_confirm_like: JSON true on the first
   button. ask = OK/Cancel, confirm = Yes/No; kind maps to the message icon.
   Unhandled here meant the backend promise never resolved (GAP H1). */
static void dialog_confirm_like(Msg *m, UINT buttons) {
  UINT icon = m->kind == 2   ? MB_ICONERROR
              : m->kind == 1 ? MB_ICONWARNING
                             : MB_ICONINFORMATION;
  int r = MessageBoxA(zt_hwnd(), m->str2[0] ? m->str2 : m->id, m->id,
                      buttons | icon);
  zt_reply_query(m->req_id, (r == IDOK || r == IDYES) ? "true" : "false");
}

static void zt_reply_frame(int req_id, const RECT *r) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":{\"x\":%d,"
           "\"y\":%d,\"width\":%d,\"height\":%d}}",
           req_id, (int)r->left, (int)r->top,
           (int)(r->right - r->left), (int)(r->bottom - r->top));
  zt_send_line(buf);
}

/* ---- notifications (WinRT toast, GAP H12) ----------------------------- */
/* mac uses UNUserNotificationCenter (bundle-gated, dev no-ops). Windows
   analog: ToastNotificationManager with an explicit AUMID — no tray icon
   needed, the toast lands in the Action Center like a first-class app
   (Tauri/wry pass a bare AUMID for unpackaged exes the same way). The SDK
   ships no C ABI header for this namespace, so the vtbl hops are hand-
   rolled against the .NET-projection interface GUIDs; IInspectable puts
   every interface's own methods at slot 6+. */

static const IID zt_IID_TNManagerStatics = {
    0x50ac103f, 0xd235, 0x4598, {0xbb, 0xef, 0x98, 0xfe, 0x4d, 0x1a, 0x3a, 0xd4}};
static const IID zt_IID_TNFactory = {
    0x04124b20, 0x82c6, 0x4229, {0xb1, 0x09, 0xfd, 0x9e, 0xd4, 0x66, 0x2b, 0x53}};
static const IID zt_IID_TNotifier = {
    0x75927b93, 0x03f3, 0x41ec, {0x91, 0xd3, 0x6e, 0x5b, 0xac, 0x1b, 0x38, 0xe7}};
static const IID zt_IID_XmlDocIO = {
    0x6cd0e74e, 0xee65, 0x4489, {0x9e, 0xbf, 0xca, 0x43, 0xe8, 0x7b, 0xa6, 0x37}};

typedef HRESULT (STDMETHODCALLTYPE *zt_gettemplate_fn)(void *, int, void **);
typedef HRESULT (STDMETHODCALLTYPE *zt_loadxml_fn)(void *, void * /*HSTRING*/);
typedef HRESULT (STDMETHODCALLTYPE *zt_createtoast_fn)(void *, void *, void **);
typedef HRESULT (STDMETHODCALLTYPE *zt_createnotifier_fn)(void *, void *,
                                                          void **);
typedef HRESULT (STDMETHODCALLTYPE *zt_show_fn)(void *, void *);
typedef HRESULT (STDMETHODCALLTYPE *zt_getsetting_fn)(void *, int *);

static void toast_xml_escape(const char *s, char *out, size_t outsz) {
  size_t o = 0;
  for (; *s && o + 8 < outsz; s++) {
    unsigned char c = (unsigned char)*s;
    switch (c) {
      case '&':  o += (size_t)snprintf(out + o, outsz - o, "&amp;");   break;
      case '<':  o += (size_t)snprintf(out + o, outsz - o, "&lt;");    break;
      case '>':  o += (size_t)snprintf(out + o, outsz - o, "&gt;");    break;
      case '"':  o += (size_t)snprintf(out + o, outsz - o, "&quot;");  break;
      case '\'': o += (size_t)snprintf(out + o, outsz - o, "&apos;");  break;
      default:
        if (c >= 0x20) out[o++] = (char)c; /* UTF-8 passes through verbatim */
        else out[o++] = '?';
    }
  }
  out[o] = 0;
}

static HSTRING toast_hstring(const wchar_t *w) {
  HSTRING h = NULL;
  if (WindowsCreateString(w, (UINT32)wcslen(w), &h) != S_OK) return NULL;
  return h;
}

/* Per-hop diagnostics for the notification_diag probe op. */
static struct {
  long hr_fac;      /* RoGetActivationFactory(ManagerStatics) */
  long hr_notifier; /* CreateToastNotifierWithId */
  long hr_tpl;      /* GetTemplateContent */
  long hr_docio;    /* QI IXmlDocumentIO */
  long hr_loadxml;  /* LoadXml */
  long hr_fac_tn;   /* RoGetActivationFactory(ToastNotificationFactory) */
  long hr_toast;    /* CreateToastNotification */
  long hr_show;     /* notifier Show */
  long hr_setting;  /* notifier get_Setting */
} g_toast_diag;

/* WinRT activation requires an MTA apartment; our dispatch/UI threads
   are already STA (WebView2 COM), so every toast call runs on a fresh
   MTA thread and the caller blocks until it finishes. Notifications are
   rare, user-facing events — thread churn is cheaper than keeping a
   resident worker. */
typedef struct ZtToastTask {
  int (*fn)(void *ctx);
  void *ctx;
  int rc;
} ZtToastTask;

static DWORD WINAPI zt_toast_thread(LPVOID p) {
  ZtToastTask *t = (ZtToastTask *)p;
  HRESULT hr = RoInitialize(RO_INIT_MULTITHREADED);
  if (SUCCEEDED(hr)) t->rc = t->fn(t->ctx);
  if (hr == S_OK) RoUninitialize(); /* S_FALSE: the MTA outlives us */
  return 0;
}

static int toast_on_mta(int (*fn)(void *), void *ctx) {
  ZtToastTask t;
  HANDLE h;
  t.fn = fn;
  t.ctx = ctx;
  t.rc = 0;
  h = CreateThread(NULL, 0, zt_toast_thread, &t, 0, NULL);
  if (!h) return 0;
  WaitForSingleObject(h, INFINITE);
  CloseHandle(h);
  return t.rc;
}

/* IToastNotifier for our AUMID — MTA thread only; the caller Releases. */
static void *toast_notifier_get(void) {
  void *mgr_statics = NULL, *notifier = NULL;
  HSTRING haumid = NULL;
  g_toast_diag.hr_fac = g_toast_diag.hr_notifier = E_FAIL;
  {
    HSTRING hcls = toast_hstring(L"Windows.UI.Notifications.ToastNotificationManager");
    if (!hcls) return NULL;
    g_toast_diag.hr_fac = RoGetActivationFactory(hcls,
                                                 &zt_IID_TNManagerStatics,
                                                 &mgr_statics);
    WindowsDeleteString(hcls);
    if (g_toast_diag.hr_fac != S_OK || !mgr_statics) return NULL;
  }
  haumid = toast_hstring(L"ztron-host");
  /* statics slot 7 = CreateToastNotifierWithId(String, out notifier) —
     slot 6 is the no-arg CreateToastNotifier (packaged apps only), slot
     8 is GetTemplateContent. */
  if (haumid)
    g_toast_diag.hr_notifier =
      ((zt_createnotifier_fn)(*(void ***)mgr_statics)[7])(mgr_statics,
                                                          haumid, &notifier);
  if (haumid) WindowsDeleteString(haumid);
  ((zt_ref_fn)(*(void ***)mgr_statics)[2])(mgr_statics);
  return notifier;
}

/* ToastNotificationSetting: 0 Enabled, 1 Disabled, 2 DisabledForApplication,
   3 DisabledForUser; -1 = the query itself failed. */
static int toast_query_setting_task(void *ctx) {
  int *out = (int *)ctx;
  void *notifier = toast_notifier_get();
  *out = -1;
  g_toast_diag.hr_setting = E_FAIL;
  if (notifier) {
    /* notifier slot 8 = get_Setting (Show=6 and Hide=7 precede) */
    g_toast_diag.hr_setting =
      ((zt_getsetting_fn)(*(void ***)notifier)[8])(notifier, out);
    if (g_toast_diag.hr_setting == S_OK &&
        (*out < 0 || *out > 3))
      *out = -1;
    ((zt_ref_fn)(*(void ***)notifier)[2])(notifier);
  }
  return 0;
}

static int toast_setting(void) {
  int s = -1;
  toast_on_mta(toast_query_setting_task, &s);
  return s;
}

typedef struct ZtToastShowArgs {
  const char *title;
  const char *body;
  int ok;
} ZtToastShowArgs;

static int toast_show_task(void *ctx) {
  ZtToastShowArgs *a = (ZtToastShowArgs *)ctx;
  void *mgr_statics = NULL, *tn_factory = NULL;
  void *xmldoc = NULL, *docio = NULL, *notifier = NULL, *toast = NULL;
  HSTRING hcls_mgr = NULL, hcls_tn = NULL, hx = NULL;
  char xml[2048], tesc[512], besc[1024];
  wchar_t wxml[2048];
  a->ok = 0;
  toast_xml_escape(a->title, tesc, sizeof(tesc));
  toast_xml_escape(a->body, besc, sizeof(besc));
  snprintf(xml, sizeof(xml),
           "<toast><visual><binding template=\"ToastGeneric\">"
           "<text>%s</text><text>%s</text></binding></visual></toast>",
           tesc, besc);
  MultiByteToWideChar(CP_UTF8, 0, xml, -1, wxml,
                      (int)(sizeof(wxml) / sizeof(wxml[0])));
  hcls_mgr = toast_hstring(L"Windows.UI.Notifications.ToastNotificationManager");
  hcls_tn = toast_hstring(L"Windows.UI.Notifications.ToastNotification");
  if (!hcls_mgr || !hcls_tn) goto out;
  g_toast_diag.hr_fac = RoGetActivationFactory(hcls_mgr,
                                               &zt_IID_TNManagerStatics,
                                               &mgr_statics);
  if (g_toast_diag.hr_fac != S_OK || !mgr_statics)
    goto out;
  /* statics slot 8 = GetTemplateContent(type, out XmlDocument) — the
     template is immediately overwritten by LoadXml below. Slot 6 is
     CreateToastNotifier() and MUST NOT be called with our (this, 0,
     &doc) shape: it writes its single out param into the second
     register, i.e. into NULL. */
  g_toast_diag.hr_tpl =
    ((zt_gettemplate_fn)(*(void ***)mgr_statics)[8])(mgr_statics, 0,
                                                     &xmldoc);
  if (g_toast_diag.hr_tpl != S_OK || !xmldoc)
    goto out;
  g_toast_diag.hr_docio =
    ((zt_qi_fn)(*(void ***)xmldoc)[0])(xmldoc, &zt_IID_XmlDocIO, &docio);
  if (g_toast_diag.hr_docio != S_OK || !docio)
    goto out;
  hx = toast_hstring(wxml);
  if (!hx) goto out;
  /* IXmlDocumentIO slot 6 = LoadXml(HSTRING) */
  g_toast_diag.hr_loadxml =
    ((zt_loadxml_fn)(*(void ***)docio)[6])(docio, hx);
  if (g_toast_diag.hr_loadxml != S_OK) {
    WindowsDeleteString(hx);
    goto out;
  }
  WindowsDeleteString(hx);
  hx = NULL;
  g_toast_diag.hr_fac_tn = RoGetActivationFactory(hcls_tn,
                                                  &zt_IID_TNFactory,
                                                  &tn_factory);
  if (g_toast_diag.hr_fac_tn != S_OK || !tn_factory)
    goto out;
  /* factory slot 6 = CreateToastNotification(XmlDocument, out) */
  g_toast_diag.hr_toast =
    ((zt_createtoast_fn)(*(void ***)tn_factory)[6])(tn_factory, xmldoc,
                                                    &toast);
  if (g_toast_diag.hr_toast != S_OK || !toast)
    goto out;
  notifier = toast_notifier_get();
  if (!notifier) goto out;
  /* notifier slot 6 = Show(toast) */
  g_toast_diag.hr_show = ((zt_show_fn)(*(void ***)notifier)[6])(notifier,
                                                                toast);
  a->ok = g_toast_diag.hr_show == S_OK;
out:
  if (hx) WindowsDeleteString(hx);
  if (toast) ((zt_ref_fn)(*(void ***)toast)[2])(toast);
  if (notifier) ((zt_ref_fn)(*(void ***)notifier)[2])(notifier);
  if (docio) ((zt_ref_fn)(*(void ***)docio)[2])(docio);
  if (xmldoc) ((zt_ref_fn)(*(void ***)xmldoc)[2])(xmldoc);
  if (tn_factory) ((zt_ref_fn)(*(void ***)tn_factory)[2])(tn_factory);
  if (mgr_statics) ((zt_ref_fn)(*(void ***)mgr_statics)[2])(mgr_statics);
  if (hcls_mgr) WindowsDeleteString(hcls_mgr);
  if (hcls_tn) WindowsDeleteString(hcls_tn);
  return 0;
}

static int toast_show(const char *title, const char *body) {
  ZtToastShowArgs a;
  a.title = title;
  a.body = body;
  a.ok = 0;
  toast_on_mta(toast_show_task, &a);
  return a.ok;
}

static void notification_send(const char *title, const char *body) {
  if (toast_show(title, body)) return;
  /* legacy fallback: tray balloon (needs a live tray icon) */
  if (g_tray_hwnd) {
    g_nid.uFlags = NIF_INFO;
    to_wide(title, g_nid.szInfoTitle, sizeof(g_nid.szInfoTitle) / sizeof(wchar_t));
    to_wide(body, g_nid.szInfo, sizeof(g_nid.szInfo) / sizeof(wchar_t));
    Shell_NotifyIconW(NIM_MODIFY, &g_nid);
  }
}

/* ---- global shortcuts (RegisterHotKey) ---- */

#define MAX_SHORTCUTS 16
static char g_shortcuts[MAX_SHORTCUTS][64];
static int g_shortcut_count = 0;

static void zt_shortcut_pressed(int id) {
  if (id < 0 || id >= MAX_SHORTCUTS || !g_shortcuts[id][0]) return;
  char buf[512];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"shortcut_event\",\"shortcut_id\":\"%s\"}",
           g_shortcuts[id]);
  zt_send_line(buf);
}

static int parse_accel_mods(const char *accel, int *mods, int *vk) {
  *mods = 0;
  const char *key = accel;
  char tmp[256];
  snprintf(tmp, sizeof(tmp), "%s", accel);
  char *save = NULL;
  for (char *tok = strtok_s(tmp, "+", &save); tok;
       tok = strtok_s(NULL, "+", &save)) {
    if (!_stricmp(tok, "ctrl") || !_stricmp(tok, "control")) { *mods |= MOD_CONTROL; continue; }
    if (!_stricmp(tok, "shift")) { *mods |= MOD_SHIFT; continue; }
    if (!_stricmp(tok, "alt") || !_stricmp(tok, "option")) { *mods |= MOD_ALT; continue; }
    if (!_stricmp(tok, "cmd") || !_stricmp(tok, "super") || !_stricmp(tok, "meta")) { *mods |= MOD_WIN; continue; }
    key = tok;
  }
  if (strlen(key) == 1 && key[0] >= 'A' && key[0] <= 'Z') { *vk = key[0]; return 0; }
  if (strlen(key) == 1 && key[0] >= '0' && key[0] <= '9') { *vk = key[0]; return 0; }
  return -1;
}

static int shortcut_register(const char *name, const char *accel) {
  HWND w = zt_hwnd();
  if (!w || g_shortcut_count >= MAX_SHORTCUTS) return 0;
  int mods = 0, vk = 0;
  if (parse_accel_mods(accel, &mods, &vk) != 0) return 0;
  if (!RegisterHotKey(w, g_shortcut_count, mods, vk)) return 0;
  snprintf(g_shortcuts[g_shortcut_count], sizeof(g_shortcuts[0]), "%s", name);
  g_shortcut_count++;
  return 1;
}

static int shortcut_unregister(const char *name) {
  for (int i = 0; i < g_shortcut_count; i++) {
    if (strcmp(g_shortcuts[i], name) == 0) {
      HWND w = zt_hwnd();
      if (w) UnregisterHotKey(w, i);
      for (int j = i; j < g_shortcut_count - 1; j++)
        strncpy(g_shortcuts[j], g_shortcuts[j + 1], sizeof(g_shortcuts[0]));
      g_shortcut_count--;
      return 1;
    }
  }
  return 0;
}

/* ---- platform ops ---- */

/* ---- monitor enumeration (available/primary/current/from_point) ---- */


typedef struct {
  char *buf;
  size_t cap;
  size_t len;
  int count;
  int only_primary;
} MonEnumCtx;

static BOOL CALLBACK mon_enum_cb(HMONITOR mon, HDC dc, LPRECT rc, LPARAM lp) {
  MonEnumCtx *ctx = (MonEnumCtx *)lp;
  MONITORINFO mi = { sizeof(mi) };
  UINT dpi = 96;
  char tmp[640];
  size_t n;
  (void)dc;
  (void)rc;
  if (!GetMonitorInfo(mon, &mi)) return TRUE;
  if (ctx->only_primary && !(mi.dwFlags & MONITORINFOF_PRIMARY)) return TRUE;
  GetDpiForMonitor(mon, MDT_EFFECTIVE_DPI, &dpi, &dpi);
  n = (size_t)snprintf(tmp, sizeof(tmp),
      "%s{\"name\":null,\"position\":{\"x\":%d,\"y\":%d},"
      "\"size\":{\"width\":%d,\"height\":%d},"
      "\"workArea\":{\"x\":%d,\"y\":%d,\"width\":%d,\"height\":%d},"
      "\"scaleFactor\":%g}",
      ctx->count ? "," : "",
      (int)mi.rcMonitor.left, (int)mi.rcMonitor.top,
      (int)(mi.rcMonitor.right - mi.rcMonitor.left),
      (int)(mi.rcMonitor.bottom - mi.rcMonitor.top),
      (int)mi.rcWork.left, (int)mi.rcWork.top,
      (int)(mi.rcWork.right - mi.rcWork.left),
      (int)(mi.rcWork.bottom - mi.rcWork.top),
      dpi / 96.0);
  if (ctx->len + n + 2 < ctx->cap) {
    memcpy(ctx->buf + ctx->len, tmp, n);
    ctx->len += n;
    ctx->count++;
  }
  return TRUE;
}

static void reply_monitors(Msg *m, webview_t wv) {
  static char mon_buf[8192];
  MonEnumCtx ctx;
  HMONITOR mon;
  ctx.buf = mon_buf; ctx.cap = sizeof(mon_buf); ctx.len = 1; ctx.count = 0;
  ctx.only_primary = 0;
  mon_buf[0] = '[';
  if (strcmp(m->type, "monitor_from_point") == 0) {
    POINT pt = { m->x, m->y };
    mon = MonitorFromPoint(pt, MONITOR_DEFAULTTONEAREST);
    if (mon) mon_enum_cb(mon, NULL, NULL, (LPARAM)&ctx);
  } else if (strcmp(m->type, "current_monitor") == 0) {
    mon = MonitorFromWindow(zt_hwnd_for(wv), MONITOR_DEFAULTTOPRIMARY);
    if (mon) mon_enum_cb(mon, NULL, NULL, (LPARAM)&ctx);
  } else {
    if (strcmp(m->type, "primary_monitor") == 0) ctx.only_primary = 1;
    EnumDisplayMonitors(NULL, NULL, mon_enum_cb, (LPARAM)&ctx);
  }
  mon_buf[ctx.len] = ']';
  mon_buf[ctx.len + 1] = '\0';
  zt_reply_query(m->req_id, mon_buf);
}

/* ---- clipboard helpers (images via GDI+, HTML via CF_HTML) ---- */

static UINT g_cf_png = 0;
static UINT g_cf_html = 0;

static void clipboard_formats_ensure(void) {
  if (!g_cf_png) g_cf_png = RegisterClipboardFormatA("PNG");
  if (!g_cf_html) g_cf_html = RegisterClipboardFormatA("HTML Format");
}

/* CF_HTML with a self-computed header (StartHTML/EndHTML offsets). */
static void clipboard_write_html(const char *html) {
  static const char *prefix = "Version:0.9\r\nStartHTML:";
  static const char *mid = "\r\nEndHTML:";
  static const char *suffix = "\r\n\r\n";
  size_t hlen = strlen(html);
  size_t start = strlen(prefix) + 10 + strlen(mid) + 10 + strlen(suffix);
  size_t total = start + hlen + 1;
  HGLOBAL hg;
  clipboard_formats_ensure();
  hg = GlobalAlloc(GMEM_MOVEABLE, total);
  if (!hg) return;
  {
    char *p = (char *)GlobalLock(hg);
    int n = sprintf(p, "%s%010u%s%010u%s%s", prefix, (unsigned)start, mid,
                    (unsigned)(start + hlen), suffix, html);
    (void)n;
    GlobalUnlock(hg);
  }
  if (OpenClipboard(NULL)) {
    EmptyClipboard();
    SetClipboardData(g_cf_html, hg);
    CloseClipboard();
  } else {
    GlobalFree(hg);
  }
}

static long clip_parse_offset(const char *s, const char *key) {
  const char *p = strstr(s, key);
  if (!p) return -1;
  p += strlen(key);
  return strtol(p, NULL, 10);
}

/* Caller frees. NULL when no HTML is on the clipboard. */
static char *clipboard_read_html(void) {
  char *out = NULL;
  clipboard_formats_ensure();
  if (!OpenClipboard(NULL)) return NULL;
  if (IsClipboardFormatAvailable(g_cf_html)) {
    HANDLE h = GetClipboardData(g_cf_html);
    if (h) {
      const char *s = (const char *)GlobalLock(h);
      if (s) {
        long start = clip_parse_offset(s, "StartHTML:");
        long end = clip_parse_offset(s, "EndHTML:");
        size_t avail = GlobalSize(h);
        if (start >= 0 && end > start && (size_t)end <= avail) {
          size_t n = (size_t)end - (size_t)start;
          out = (char *)malloc(n + 1);
          if (out) {
            memcpy(out, s + start, n);
            out[n] = '\0';
          }
        }
        GlobalUnlock(h);
      }
    }
  }
  CloseClipboard();
  return out;
}

/* Encode a bitmap as PNG into a base64 string. Caller frees. */
static char *bitmap_png_b64(GpBitmap *bmp) {
  HGLOBAL hg = NULL;
  IStream *st = NULL;
  char *b64 = NULL;
  if (CreateStreamOnHGlobal(NULL, TRUE, &st) != S_OK) return NULL;
  if (GdipSaveImageToStream((GpImage *)bmp, st, &GP_CLSID_PNG_ENCODER,
                            NULL) == 0) {
    STATSTG ss;
    if (st->lpVtbl->Stat(st, &ss, STATFLAG_NONAME) == S_OK && ss.cbSize.QuadPart > 0) {
      HGLOBAL inner = NULL;
      if (GetHGlobalFromStream(st, &inner) == S_OK) {
        SIZE_T n = (SIZE_T)ss.cbSize.QuadPart;
        const unsigned char *p = (const unsigned char *)GlobalLock(inner);
        if (p) {
          b64 = (char *)malloc((n + 2) / 3 * 4 + 1);
          if (b64) zt_b64_encode(p, n, b64);
          GlobalUnlock(inner);
        }
      }
    }
  }
  st->lpVtbl->Release(st);
  (void)hg;
  return b64;
}

/* PNG bytes (registered "PNG" format) preferred; CF_BITMAP encoded via GDI+
   as fallback. Caller frees. */
static char *clipboard_read_image_b64(void) {
  char *b64 = NULL;
  clipboard_formats_ensure();
  if (!OpenClipboard(NULL)) return NULL;
  if (IsClipboardFormatAvailable((UINT)g_cf_png)) {
    HANDLE h = GetClipboardData((UINT)g_cf_png);
    if (h) {
      SIZE_T n = GlobalSize(h);
      const unsigned char *p = (const unsigned char *)GlobalLock(h);
      if (p) {
        b64 = (char *)malloc((n + 2) / 3 * 4 + 1);
        if (b64) zt_b64_encode(p, n, b64);
        GlobalUnlock(h);
      }
    }
  } else if (IsClipboardFormatAvailable(CF_BITMAP)) {
    HBITMAP hbm = (HBITMAP)GetClipboardData(CF_BITMAP);
    if (hbm) {
      GpBitmap *bmp = NULL;
      gdiplus_ensure();
      if (GdipCreateBitmapFromHBITMAP(hbm, NULL, &bmp) == 0 && bmp) {
        b64 = bitmap_png_b64(bmp);
        GdipDisposeImage((GpImage *)bmp);
      }
    }
  }
  CloseClipboard();
  return b64;
}

static int dispatch(Msg *m, webview_t wv) {
  /* `wv` is the label-resolved target webview (host.c resolves m->win_label
     before dispatching); window ops must act on it, not always on main —
     label-blind routing made WebviewWindow("x").destroy() kill the MAIN
     window and the whole check hang. */
  /* Cold-start deep-link delivery (GAP H9): a URL recorded in preinit sits
     here until the backend proves it is listening (its first message). */
  if (g_deeplink_pending[0] && !g_deeplink_pending_sent) {
    g_deeplink_pending_sent = 1;
    dl_emit(g_deeplink_pending);
  }
  if (strcmp(m->type, "deeplink_registry_query") == 0) {
    /* H9 probe readback: what the OS will actually run for ztron://. */
    char cmd[MAX_PATH * 2 + 16];
    DWORD sz = sizeof(cmd);
    char esc[(MAX_PATH * 2 + 16) * 2];
    char buf[(MAX_PATH * 2 + 16) * 2 + 32];
    if (RegGetValueA(HKEY_CURRENT_USER,
                     "Software\\Classes\\ztron\\shell\\open\\command", NULL,
                     RRF_RT_REG_SZ, NULL, cmd, &sz) == ERROR_SUCCESS) {
      zt_json_escape(cmd, esc, sizeof(esc));
      snprintf(buf, sizeof(buf), "{\"command\":\"%s\"}", esc);
    } else {
      snprintf(buf, sizeof(buf), "{\"command\":null}");
    }
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "deeplink_emit_test") == 0) {
    /* H9 probe vehicle: drive the production emitter for the deep_link
       wire line (the OS leg — registry, second process, WM_COPYDATA — is
       covered by the hot-activation stage of the probe). */
    if (m->str[0]) dl_emit(m->str);
    zt_reply_query(m->req_id, "true");
    return 1;
  }
  if (strcmp(m->type, "webview_clear_data") == 0) {
    /* GAP H10: profile-wide browsing-data clear, fire-and-forget on the
       wire (mac clears defaultDataStore the same way). */
    clear_data_core(wv, 0);
    return 1;
  }
  if (strcmp(m->type, "webview_clear_data_diag") == 0) {
    /* H10 probe vehicle: run BOTH clear variants (All + explicit kinds)
       and read back every hop's HRESULT plus which completed-handlers
       fired with what errorCode. */
    char buf[384];
    clear_data_core(wv, 1);
    snprintf(buf, sizeof(buf),
             "{\"ctl\":%ld,\"core\":%ld,\"qi13\":%ld,\"profile\":%ld,"
             "\"qi2\":%ld,\"clear\":%ld,\"invoked\":%d,\"invoke_hr\":%ld,"
             "\"clear_kinds\":%ld,\"invoked_kinds\":%d,"
             "\"invoke_hr_kinds\":%ld}",
             (long)g_clear_diag.hr_ctl, (long)g_clear_diag.hr_core,
             (long)g_clear_diag.hr_qi13, (long)g_clear_diag.hr_profile,
             (long)g_clear_diag.hr_qi2, (long)g_clear_diag.hr_clear,
             g_clear_diag.invoked, (long)g_clear_diag.invoke_hr,
             (long)g_clear_diag.hr_clear_kinds, g_clear_diag.invoked_kinds,
             (long)g_clear_diag.invoke_hr_kinds);
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "set_theme") == 0) {
    /* GAP H11: app-wide like NSApp.appearance — "dark"/"light" override,
       "" (core null) re-follows the system. */
    g_theme_override = strcmp(m->str2, "dark") == 0   ? 1
                       : strcmp(m->str2, "light") == 0 ? 0
                                                       : -1;
    theme_apply_all(zt_theme_effective_dark());
    return 1;
  }
  if (strcmp(m->type, "theme_diag") == 0) {
    /* H11 probe readback: the DWM title-bar bit and the Profile scheme
       as applied to the main window right now. */
    char buf[160];
    BOOL on = FALSE;
    unsigned long hr = 0;
    int scheme = -1;
    HWND w = zt_hwnd_for(zt_w);
    if (w)
      hr = (unsigned long)DwmGetWindowAttribute(w, 20, &on, sizeof(on));
    {
      void *profile2 = zt_profile2_of_webview(zt_w);
      if (profile2) {
        ((zt_get_scheme_fn)(*(void ***)profile2)[8])(profile2, &scheme);
        ((zt_ref_fn)(*(void ***)profile2)[2])(profile2);
      }
    }
    snprintf(buf, sizeof(buf), "{\"dwm\":%s,\"scheme\":%d,\"hr\":\"0x%08lx\"}",
             on ? "true" : "false", scheme, hr);
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "theme_settingchange_test") == 0) {
    /* H11 probe vehicle: drive the REAL WM_SETTINGCHANGE message path
       ("ImmersiveColorSet" through zt_proc) without flipping the user's
       actual global theme — the OS broadcast carries exactly this message
       + string, nothing more. */
    HWND w = zt_hwnd_for(zt_w);
    if (w)
      SendMessageW(w, WM_SETTINGCHANGE, 0,
                   (LPARAM)L"ImmersiveColorSet");
    zt_reply_query(m->req_id, "true");
    return 1;
  }
  if (is_window_op(m->type)) { handle_window_op(m, wv); return 1; }
  if (strcmp(m->type, "window_get_frame") == 0) {
    RECT r;
    HWND w = zt_hwnd_for(wv);
    if (w && m->req_id >= 0 && GetWindowRect(w, &r)) zt_reply_frame(m->req_id, &r);
    else if (m->req_id >= 0) zt_reply_null(m->req_id);
    return 1;
  }
  if (strcmp(m->type, "inner_size") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w && m->req_id >= 0) {
      RECT r;
      GetClientRect(w, &r);
      char buf[128];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
               "{\"width\":%d,\"height\":%d}}",
               m->req_id, (int)(r.right - r.left), (int)(r.bottom - r.top));
      zt_send_line(buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "get_inner_position") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w && m->req_id >= 0) {
      POINT pt = { 0, 0 };
      ClientToScreen(w, &pt);
      char buf[128];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
               "{\"x\":%d,\"y\":%d}}",
               m->req_id, (int)pt.x, (int)pt.y);
      zt_send_line(buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "cursor_position") == 0) {
    if (m->req_id >= 0) {
      POINT pt;
      if (GetCursorPos(&pt)) {
        char buf[128];
        snprintf(buf, sizeof(buf),
                 "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
                 "{\"x\":%d,\"y\":%d}}",
                 m->req_id, (int)pt.x, (int)pt.y);
        zt_send_line(buf);
      } else {
        zt_reply_null(m->req_id);
      }
    }
    return 1;
  }
  if (strcmp(m->type, "set_cursor_position") == 0) {
    SetCursorPos(m->x, m->y);
    return 1;
  }
  if (strcmp(m->type, "window_set_position") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w) SetWindowPos(w, 0, m->x, m->y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    return 1;
  }
  if (strcmp(m->type, "set_prevent_close") == 0) {
    /* Arms the WM_CLOSE intercept in zt_proc (mac zt_should_close parity):
       close becomes a "close" event the backend answers via destroy. */
    WinState *st = win_state(zt_hwnd_for(wv));
    if (st) st->prevent_close = m->bool_val;
    return 1;
  }
  if (strcmp(m->type, "window_destroy") == 0) {
    /* Non-main windows: destroy the webview itself and drop the registry
       entry. The main window is torn down by "quit" — never here. */
    if (m->win_label[0] && strcmp(m->win_label, "main") != 0) {
      webview_t nw = zt_webview(m->win_label);
      if (nw && nw != zt_w) {
        zt_remove_webview_label(m->win_label);
        webview_destroy(nw);
        return 1;
      }
    }
    HWND w = zt_hwnd_for(wv);
    if (w) DestroyWindow(w);
    return 1;
  }
  if (strcmp(m->type, "window_set_bounds") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w) SetWindowPos(w, 0, m->x, m->y, m->width, m->height, SWP_NOZORDER);
    return 1;
  }
  if (strcmp(m->type, "window_get_state") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w && m->req_id >= 0) {
      RECT wr;
      MONITORINFO mi = { sizeof(mi) };
      HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTOPRIMARY);
      GetMonitorInfo(mon, &mi);
      GetWindowRect(w, &wr);
      LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
      int fullscreen = wr.left == mi.rcMonitor.left && wr.top == mi.rcMonitor.top &&
                       wr.right == mi.rcMonitor.right && wr.bottom == mi.rcMonitor.bottom;
      char buf[256];
      snprintf(buf, sizeof(buf),
               "{\"maximized\":%s,\"minimized\":%s,\"fullscreen\":%s,"
               "\"always_on_top\":%s,\"visible\":%s,\"resizable\":%s}",
               IsZoomed(w) ? "true" : "false",
               IsIconic(w) ? "true" : "false",
               fullscreen ? "true" : "false",
               tracked_topmost(w) ? "true" : "false",
               IsWindowVisible(w) ? "true" : "false",
               (style & WS_THICKFRAME) ? "true" : "false");
      zt_reply_query(m->req_id, buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "available_monitors") == 0 ||
      strcmp(m->type, "primary_monitor") == 0 ||
      strcmp(m->type, "current_monitor") == 0 ||
      strcmp(m->type, "monitor_from_point") == 0) {
    if (m->req_id >= 0) reply_monitors(m, wv);
    return 1;
  }
  if (strcmp(m->type, "image_from_bytes") == 0) {
    if (m->req_id >= 0) {
      GpBitmap *bmp = NULL;
      size_t blen = strlen(m->str2);
      unsigned char *bytes = (unsigned char *)malloc(blen + 1);
      HGLOBAL hg = NULL;
      IStream *st = NULL;
      size_t n = 0;
      if (bytes) n = zt_b64_decode(m->str2, bytes, blen + 1);
      gdiplus_ensure();
      if (n && (hg = GlobalAlloc(GMEM_MOVEABLE, n)) != NULL) {
        memcpy(GlobalLock(hg), bytes, n);
        GlobalUnlock(hg);
        if (CreateStreamOnHGlobal(hg, FALSE, &st) == S_OK) {
          GdipCreateBitmapFromStream(st, &bmp);
          st->lpVtbl->Release(st);
        }
        GlobalFree(hg);
      }
      free(bytes);
      reply_image_id(m, bmp); /* -1 on decode failure */
    }
    return 1;
  }
  if (strcmp(m->type, "image_from_path") == 0) {
    if (m->req_id >= 0) {
      wchar_t wpath[MAX_PATH];
      GpBitmap *bmp = NULL;
      gdiplus_ensure();
      to_wide(m->str, wpath, MAX_PATH);
      GdipCreateBitmapFromFile(wpath, &bmp);
      reply_image_id(m, bmp); /* -1 when unreadable */
    }
    return 1;
  }
  if (strcmp(m->type, "image_rgba_query") == 0) {
    int img = m->id[0] ? atoi(m->id) : -1;
    if (m->req_id >= 0 && image_by_id(img)) {
      UINT w = 0, h = 0;
      char *b64 = image_rgba_b64(image_by_id(img), &w, &h);
      if (b64) {
        size_t need = strlen(b64) + 64;
        char *out = (char *)malloc(need);
        snprintf(out, need, "{\"type\":\"query_result\",\"req_id\":%d,"
                            "\"result\":\"%s\"}",
                 m->req_id, b64);
        zt_send_line(out);
        free(out);
        free(b64);
      } else {
        zt_reply_null(m->req_id);
      }
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "image_dims_query") == 0) {
    int img = m->id[0] ? atoi(m->id) : -1;
    GpBitmap *bmp = image_by_id(img);
    if (m->req_id >= 0 && bmp) {
      UINT w = 0, h = 0;
      if (GdipGetImageWidth((GpImage *)bmp, &w) == 0 &&
          GdipGetImageHeight((GpImage *)bmp, &h) == 0) {
        char buf[128];
        snprintf(buf, sizeof(buf),
                 "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
                 "{\"width\":%u,\"height\":%u}}",
                 m->req_id, w, h);
        zt_send_line(buf);
      } else {
        zt_reply_null(m->req_id);
      }
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "image_destroy") == 0) {
    image_destroy(m->id[0] ? atoi(m->id) : -1);
    return 1;
  }
  if (strcmp(m->type, "window_get_theme") == 0) {
    /* effective like mac's effectiveAppearance: the set_theme override
       wins while it is armed, the registry value otherwise. */
    if (m->req_id >= 0) {
      zt_reply_string(m->req_id,
                      zt_theme_effective_dark() ? "dark" : "light");
    }
    return 1;
  }
  if (strcmp(m->type, "window_get_scale_factor") == 0) {
    if (m->req_id >= 0) {
      UINT dpi = GetDpiForWindow(zt_hwnd_for(wv));
      char buf[64];
      snprintf(buf, sizeof(buf), "%g", (dpi ? dpi : 96) / 96.0);
      zt_reply_string(m->req_id, buf);
    }
    return 1;
  }
  if (strcmp(m->type, "set_ignore_cursor_events") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w) {
      LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
      if (m->bool_val) ex |= WS_EX_TRANSPARENT;
      else ex &= ~WS_EX_TRANSPARENT;
      SetWindowLongPtr(w, GWL_EXSTYLE, ex);
    }
    return 1;
  }
  if (strcmp(m->type, "window_get_title") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w && m->req_id >= 0) {
      char title[512];
      GetWindowTextA(w, title, sizeof(title));
      zt_reply_string(m->req_id, title);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "start_resize_dragging") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w) {
      const char *d = m->str2;
      int ht = HTBOTTOMRIGHT;
      if (strstr(d, "north")) ht = strstr(d, "west") ? HTTOPLEFT : (strstr(d, "east") ? HTTOPRIGHT : HTTOP);
      else if (strstr(d, "south")) ht = strstr(d, "west") ? HTBOTTOMLEFT : (strstr(d, "east") ? HTBOTTOMRIGHT : HTBOTTOM);
      else if (strstr(d, "east")) ht = HTRIGHT;
      else if (strstr(d, "west")) ht = HTLEFT;
      ReleaseCapture();
      SendMessage(w, WM_NCLBUTTONDOWN, ht, 0);
    }
    return 1;
  }
  if (strcmp(m->type, "start_dragging") == 0) {
    HWND w = zt_hwnd_for(wv);
    if (w) {
      ReleaseCapture();
      SendMessage(w, WM_NCLBUTTONDOWN, HTCAPTION, 0);
    }
    return 1;
  }
  if (strcmp(m->type, "set_cursor") == 0) {
    LPCSTR id = IDC_ARROW;
    const char *name = m->str2;
    if (strcmp(name, "text") == 0) id = IDC_IBEAM;
    else if (strcmp(name, "pointer") == 0 || strcmp(name, "hand") == 0) id = IDC_HAND;
    else if (strcmp(name, "crosshair") == 0) id = IDC_CROSS;
    else if (strcmp(name, "move") == 0 || strcmp(name, "all-scroll") == 0) id = IDC_SIZEALL;
    else if (strcmp(name, "not-allowed") == 0) id = IDC_NO;
    else if (strcmp(name, "wait") == 0 || strcmp(name, "progress") == 0) id = IDC_APPSTARTING;
    else if (strcmp(name, "n-resize") == 0 || strcmp(name, "s-resize") == 0) id = IDC_SIZENS;
    else if (strcmp(name, "e-resize") == 0 || strcmp(name, "w-resize") == 0) id = IDC_SIZEWE;
    else if (strcmp(name, "ne-resize") == 0 || strcmp(name, "sw-resize") == 0) id = IDC_SIZENESW;
    else if (strcmp(name, "nw-resize") == 0 || strcmp(name, "se-resize") == 0) id = IDC_SIZENWSE;
    HCURSOR cur = LoadCursorA(NULL, id);
    if (cur) SetCursor(cur);
    return 1;
  }
  if (strcmp(m->type, "notification_send") == 0) {
    notification_send(m->id[0] ? m->id : "", m->str2);
    return 1;
  }
  if (strcmp(m->type, "notification_is_granted") == 0) {
    /* WinRT ToastNotificationSetting == Enabled — the honest signal for
       "toasts from this app will actually surface". */
    if (m->req_id >= 0)
      zt_reply_query(m->req_id, toast_setting() == 0 ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "notification_request_permission") == 0) {
    /* No per-app authorization API exists on Windows (Tauri answers true
       the same way); report whether the system currently accepts our
       toasts — Enabled or query-unavailable counts as granted. */
    if (m->req_id >= 0) {
      int s = toast_setting();
      zt_reply_query(m->req_id, s == -1 || s == 0 ? "true" : "false");
    }
    return 1;
  }
  if (strcmp(m->type, "notification_diag") == 0) {
    /* H12 probe readback: toast Setting + per-hop HRESULTs of the last
       WinRT chain (fac = activation factory, notifier = WithId). */
    char buf[384];
    int s = toast_setting();
    snprintf(buf, sizeof(buf),
             "{\"setting\":%d,\"hr_fac\":\"0x%08lx\","
             "\"hr_notifier\":\"0x%08lx\",\"hr_setting\":\"0x%08lx\","
             "\"hr_tpl\":\"0x%08lx\",\"hr_docio\":\"0x%08lx\","
             "\"hr_loadxml\":\"0x%08lx\",\"hr_fac_tn\":\"0x%08lx\","
             "\"hr_toast\":\"0x%08lx\",\"hr_show\":\"0x%08lx\"}",
             s, g_toast_diag.hr_fac, g_toast_diag.hr_notifier,
             g_toast_diag.hr_setting, g_toast_diag.hr_tpl,
             g_toast_diag.hr_docio, g_toast_diag.hr_loadxml,
             g_toast_diag.hr_fac_tn, g_toast_diag.hr_toast,
             g_toast_diag.hr_show);
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "notification_show_test") == 0) {
    /* H12 probe vehicle: drive toast_show directly and report whether
       the OS accepted the toast (production notification_send uses the
       same component but is fire-and-forget on the wire). */
    int ok = toast_show("ztron notifprobe", "H12 verification toast");
    zt_reply_query(m->req_id, ok ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "shortcut_register") == 0) {
    int ok = shortcut_register(m->id, m->str2);
    if (m->req_id >= 0) zt_reply_query(m->req_id, ok ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "shortcut_unregister") == 0) {
    int ok = shortcut_unregister(m->id);
    if (m->req_id >= 0) zt_reply_query(m->req_id, ok ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "shortcut_is_registered") == 0) {
    int i, found = 0;
    for (i = 0; i < g_shortcut_count; i++)
      if (strcmp(g_shortcuts[i], m->id) == 0) { found = 1; break; }
    if (m->req_id >= 0)
      zt_reply_query(m->req_id, found ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "tray_create") == 0) { tray_create(m->id, m->win_label); return 1; }
  if (strcmp(m->type, "tray_get_by_id") == 0) { tray_get_by_id(m->win_label, m->req_id); return 1; }
  if (strcmp(m->type, "tray_remove_by_id") == 0) { tray_remove_by_id(m->win_label); return 1; }
  if (strcmp(m->type, "tray_set_title") == 0) { tray_set_title(m->id); return 1; }
  if (strcmp(m->type, "tray_set_tooltip") == 0) { tray_set_tooltip(m->str2); return 1; }
  if (strcmp(m->type, "tray_set_icon") == 0) {
    if (m->id[0]) tray_set_icon_id(atoi(m->id));
    else tray_set_icon(m->str2);
    return 1;
  }
  if (strcmp(m->type, "tray_destroy") == 0) { tray_destroy(); return 1; }

  if (strcmp(m->type, "menu_create") == 0) { menu_create(m->str); return 1; }
  if (strcmp(m->type, "menu_add_item") == 0) {
    menu_item_insert(menu_resolve(m->str), -1, m->id, m->str2, m->status,
                     m->bool_val, m->checked, 0);
    return 1;
  }
  if (strcmp(m->type, "menu_insert_item") == 0) {
    menu_item_insert(menu_resolve(m->str), m->x, m->id, m->str2, m->status,
                     m->bool_val, m->checked, 0);
    return 1;
  }
  if (strcmp(m->type, "menu_add_predefined") == 0) {
    /* H14: kind rides in aux; roles run built-in behavior at click time
       (menu_role_action) on top of the menu_event. */
    menu_item_insert_kind(menu_resolve(m->str), -1, m->id, m->str2,
                          m->status, 0, -1, 0, m->aux);
    return 1;
  }
  if (strcmp(m->type, "menu_add_icon_item") == 0) {
    /* Icon bitmaps need owner-draw; item text/ordering still honored. */
    menu_item_insert(menu_resolve(m->str), -1, m->id, m->str2, m->status,
                     0, -1, 0);
    return 1;
  }
  if (strcmp(m->type, "menu_add_submenu_item") == 0) {
    MenuRec *parent = menu_resolve(m->str);
    MenuRec *child = menu_by_id(m->id);
    if (!child && g_menu_count < MAX_MENUS) {
      child = &g_menus[g_menu_count++];
      memset(child, 0, sizeof(*child));
      snprintf(child->id, sizeof(child->id), "%s", m->id);
      child->cmd_base = g_menu_cmd_next;
      g_menu_cmd_next += 256;
      child->parent = parent;
      menu_rebuild(child);
    }
    if (parent)
      menu_item_insert(parent, -1, m->id, m->str2, 1, 0, -1, 1);
    return 1;
  }
  if (strcmp(m->type, "menu_remove_item") == 0) {
    MenuRec *root = menu_resolve(m->str);
    int idx = -1;
    MenuRec *owner = root ? menu_item_owner(root, m->id, &idx) : NULL;
    if (owner) menu_item_remove(owner, idx);
    return 1;
  }
  if (strcmp(m->type, "menu_remove_at") == 0) {
    MenuRec *root = menu_resolve(m->str);
    if (root && m->req_index >= 0 && m->req_index < root->count)
      menu_item_remove(root, m->req_index);
    return 1;
  }
  if (strcmp(m->type, "menu_item_set_enabled") == 0) { menu_set_item_enabled(m->str, m->id, m->status); return 1; }
  if (strcmp(m->type, "menu_item_set_title") == 0) { menu_set_item_title(m->str, m->id, m->str2); return 1; }
  if (strcmp(m->type, "menu_item_set_checked") == 0) { menu_set_item_checked(m->str, m->id, m->checked); return 1; }
  if (strcmp(m->type, "menu_item_set_accel") == 0) { return 1; } /* text-only menus; accel not rendered */
  if (strcmp(m->type, "menu_items") == 0) { menu_reply_items(m); return 1; }
  if (strcmp(m->type, "menu_item_info") == 0) {
    MenuRec *root = menu_resolve(m->str);
    int idx = -1;
    MenuRec *owner = root ? menu_item_owner(root, m->id, &idx) : NULL;
    if (m->req_id >= 0) {
      if (owner) {
        MenuItemRec *it = &owner->items[idx];
        char title_e[600];
        char buf[800];
        zt_json_escape(it->title, title_e, sizeof(title_e));
        snprintf(buf, sizeof(buf),
                 "{\"enabled\":%s,\"checked\":%s,\"title\":\"%s\"}",
                 it->enabled ? "true" : "false",
                 it->checked == 1 ? "true" : "false", title_e);
        zt_reply_query(m->req_id, buf);
      } else {
        zt_reply_null(m->req_id);
      }
    }
    return 1;
  }
  if (strcmp(m->type, "menu_popup") == 0) {
    /* H13: programmatic popup — modal track on the GUI thread (the tray
       left-click path is the same component); TPM_RETURNCMD gives the
       exact selection so the menu_event is attributed to the right menu
       even when a bar menu is also attached. Fire-and-forget on the wire
       (mac parity). */
    int cmd = menu_popup_track(menu_by_id(m->str), zt_hwnd_for(wv),
                               m->x, m->y);
    if (cmd > 0) menu_emit_for_cmd(cmd);
    return 1;
  }
  if (strcmp(m->type, "menu_popup_cancel_test") == 0) {
    /* H13 probe: popup enters the REAL modal track, then a WM_TIMER (see
       zt_proc) cancels it 350ms in — cmd must come back 0. A stub would
       return instantly with nothing to cancel. */
    HWND w = zt_hwnd_for(wv);
    int cmd;
    if (w) SetTimer(w, ZT_MENU_CANCEL_TIMER, 350, NULL);
    cmd = menu_popup_track(menu_by_id(m->str), w, 0, 0);
    if (w) KillTimer(w, ZT_MENU_CANCEL_TIMER);
    if (m->req_id >= 0) zt_reply_query(m->req_id, cmd == 0 ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "menu_popup_select_test") == 0) {
    /* H13 probe: side thread injects DOWN/ENTER into the tracking menu's
       input queue; TPM_RETURNCMD + menu_emit_for_cmd must produce a real
       menu_event for the right item (leaf or submenu leaf via id:"sub"). */
    HWND w = zt_hwnd_for(wv);
    HANDLE th;
    int cmd;
    g_menu_keys_sub = m->id[0] ? 1 : 0;
    th = CreateThread(NULL, 0, menu_keys_thread, NULL, 0, NULL);
    cmd = menu_popup_track(menu_by_id(m->str), w, 0, 0);
    if (th) {
      WaitForSingleObject(th, 8000);
      CloseHandle(th);
    }
    if (cmd > 0) menu_emit_for_cmd(cmd);
    if (m->req_id >= 0) zt_reply_query(m->req_id, cmd > 0 ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "menu_set_app") == 0) { menu_set_app(m->str); return 1; }
  if (strcmp(m->type, "menu_set_window_menu") == 0) {
    menu_set_window_menu(m->str, m->win_label);
    return 1;
  }
  if (strcmp(m->type, "menu_set_item_icon") == 0) {
    menu_set_item_icon(m->str, m->id, m->aux);
    return 1;
  }
  if (strcmp(m->type, "menu_create_default") == 0) {
    menu_create_default(m->str);
    return 1;
  }
  if (strcmp(m->type, "menu_diag") == 0) {
    /* H14 probe readback: per-window menu-bar attachments + items that
       carry a SetMenuItemBitmaps bitmap (structure without pixels). */
    char buf[2048];
    int i, j, o = 0, first;
    o += snprintf(buf + o, sizeof(buf) - o, "{\"bars\":[");
    first = 1;
    for (i = 0; i < g_menu_count && o < (int)sizeof(buf) - 160; i++) {
      char em[130], el[130];
      const char *lb;
      if (!g_menus[i].attached_hwnd) continue;
      lb = zt_label_for_window((void *)g_menus[i].attached_hwnd);
      zt_json_escape(g_menus[i].id, em, sizeof(em));
      zt_json_escape(lb ? lb : "", el, sizeof(el));
      o += snprintf(buf + o, sizeof(buf) - o,
                    "%s{\"menu\":\"%s\",\"label\":\"%s\"}",
                    first ? "" : ",", em, el);
      first = 0;
    }
    o += snprintf(buf + o, sizeof(buf) - o, "],\"icons\":[");
    first = 1;
    for (i = 0; i < g_menu_count && o < (int)sizeof(buf) - 160; i++)
      for (j = 0; j < g_menus[i].count && o < (int)sizeof(buf) - 160; j++)
        if (g_menus[i].items[j].bmp) {
          char em[130], ei[160];
          zt_json_escape(g_menus[i].id, em, sizeof(em));
          zt_json_escape(g_menus[i].items[j].id, ei, sizeof(ei));
          o += snprintf(buf + o, sizeof(buf) - o,
                        "%s{\"menu\":\"%s\",\"item\":\"%s\"}",
                        first ? "" : ",", em, ei);
          first = 0;
        }
    snprintf(buf + o, sizeof(buf) - o, "]}");
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "menu_destroy") == 0) { menu_destroy(m->str); return 1; }
  if (strcmp(m->type, "app_hide") == 0) {
    /* Whole-app hide — windows stay alive, just off-screen. */
    app_hide_all();
    return 1;
  }
  if (strcmp(m->type, "app_show") == 0) {
    app_show_all();
    return 1;
  }
  if (strcmp(m->type, "app_set_dock_visibility") == 0) {
    /* Dock icon on/off = taskbar button on/off: WS_EX_TOOLWINDOW, the
       same switch set_skip_taskbar uses, exposed as a distinct API (mac
       parity: both map to the activation-policy switch). The hide/show
       cycle makes an already-visible window's Explorer button disappear
       immediately instead of at the next show. */
    HWND w = zt_hwnd();
    if (w) {
      LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
      if (m->bool_val) ex &= ~WS_EX_TOOLWINDOW;
      else ex |= WS_EX_TOOLWINDOW;
      SetWindowLongPtr(w, GWL_EXSTYLE, ex);
      SetWindowPos(w, 0, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED);
      if (IsWindowVisible(w)) {
        ShowWindow(w, SW_HIDE);
        ShowWindow(w, SW_SHOWNA);
      }
    }
    return 1;
  }
  if (strcmp(m->type, "app_diag") == 0) {
    /* H15 probe readback: main window visibility + taskbar-skip style
       (structure, no Explorer queries). */
    HWND w = zt_hwnd();
    LONG_PTR ex = w ? GetWindowLongPtr(w, GWL_EXSTYLE) : 0;
    char buf[96];
    snprintf(buf, sizeof(buf), "{\"visible\":%s,\"toolwindow\":%s}",
             w && IsWindowVisible(w) ? "true" : "false",
             (ex & WS_EX_TOOLWINDOW) ? "true" : "false");
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "bg_probe") == 0) {
    /* H16 probe readback: one pixel from the target webview's client
       area, captured with PrintWindow(PW_RENDERFULLCONTENT) so the
       DirectX-composited WebView2 surface lands in the DIB even when a
       CI window is stacked on top (GetPixel would read the occluder).
       Sample point is near the bottom-right corner, away from page
       content. */
    HWND w = zt_hwnd_for(wv);
    char buf[64] = "null";
    RECT rc;
    if (w && GetClientRect(w, &rc) && rc.right > 40 && rc.bottom > 40) {
      int bw = rc.right - rc.left, bh = rc.bottom - rc.top;
      HDC wdc = GetWindowDC(w);
      HDC mem = CreateCompatibleDC(wdc);
      BITMAPINFO bi;
      void *bits = NULL;
      ZeroMemory(&bi, sizeof(bi));
      bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
      bi.bmiHeader.biWidth = bw;
      bi.bmiHeader.biHeight = -bh; /* top-down */
      bi.bmiHeader.biPlanes = 1;
      bi.bmiHeader.biBitCount = 32;
      bi.bmiHeader.biCompression = BI_RGB;
      HBITMAP bmp = CreateDIBSection(wdc, &bi, DIB_RGB_COLORS, &bits, NULL, 0);
      if (bmp && bits) {
        HGDIOBJ old = SelectObject(mem, bmp);
        if (PrintWindow(w, mem, PW_CLIENTONLY | PW_RENDERFULLCONTENT)) {
          /* 32bpp DIB is BGRA in memory (little-endian COLORREF order). */
          BYTE *row = (BYTE *)bits + (size_t)(bh - 20) * bw * 4;
          BYTE *px = row + (size_t)(bw - 20) * 4;
          snprintf(buf, sizeof(buf), "{\"r\":%d,\"g\":%d,\"b\":%d}",
                   px[2], px[1], px[0]);
        }
        SelectObject(mem, old);
        DeleteObject(bmp);
      }
      DeleteDC(mem);
      ReleaseDC(w, wdc);
    }
    zt_reply_query(m->req_id, buf);
    return 1;
  }
  if (strcmp(m->type, "tray_set_menu") == 0) {
    snprintf(g_tray_menu_id, sizeof(g_tray_menu_id), "%s", m->str);
    return 1;
  }
  if (strcmp(m->type, "tray_set_show_menu_on_left_click") == 0 ||
      strcmp(m->type, "tray_set_visible") == 0 ||
      strcmp(m->type, "tray_set_icon_template") == 0) { return 1; } /* accepted no-ops */

  if (strcmp(m->type, "dialog_open") == 0) { dialog_open(m); return 1; }
  if (strcmp(m->type, "dialog_save") == 0) { dialog_save(m); return 1; }
  if (strcmp(m->type, "dialog_message") == 0) { dialog_message(m); return 1; }
  if (strcmp(m->type, "dialog_ask") == 0) {
    dialog_confirm_like(m, MB_OKCANCEL);
    return 1;
  }
  if (strcmp(m->type, "dialog_confirm") == 0) {
    dialog_confirm_like(m, MB_YESNO);
    return 1;
  }

  if (strcmp(m->type, "clipboard_read_text") == 0) {
    if (m->req_id >= 0 && OpenClipboard(NULL)) {
      HANDLE h = GetClipboardData(CF_TEXT);
      if (h) {
        char *s = (char *)GlobalLock(h);
        if (s) zt_reply_string(m->req_id, s);
        GlobalUnlock(h);
      } else zt_reply_null(m->req_id);
      CloseClipboard();
    } else zt_reply_null(m->req_id);
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_text") == 0) {
    if (OpenClipboard(NULL)) {
      EmptyClipboard();
      const char *txt = m->str2[0] ? m->str2 : m->str;
      size_t len = strlen(txt) + 1;
      HGLOBAL h = GlobalAlloc(GMEM_MOVEABLE, len);
      if (h) { memcpy(GlobalLock(h), txt, len); GlobalUnlock(h); SetClipboardData(CF_TEXT, h); }
      CloseClipboard();
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_clear") == 0) {
    if (OpenClipboard(NULL)) { EmptyClipboard(); CloseClipboard(); }
    if (m->req_id >= 0) zt_reply_null(m->req_id);
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_html") == 0) {
    clipboard_write_html(m->str2[0] ? m->str2 : m->str);
    return 1;
  }
  if (strcmp(m->type, "clipboard_read_html") == 0) {
    if (m->req_id >= 0) {
      char *html = clipboard_read_html();
      if (html) { zt_reply_string(m->req_id, html); free(html); }
      else zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_image") == 0) {
    /* b64 PNG/JPEG bytes in m->str2; also expose raw bytes as CF_PNG so
       the read path (and other apps) see the original encoding. */
    size_t blen = strlen(m->str2);
    unsigned char *bytes = (unsigned char *)malloc(blen + 1);
    size_t n = bytes ? zt_b64_decode(m->str2, bytes, blen + 1) : 0;
    clipboard_formats_ensure();
    if (n && OpenClipboard(NULL)) {
      HGLOBAL raw = GlobalAlloc(GMEM_MOVEABLE, n);
      HBITMAP hbm = NULL;
      GpBitmap *bmp = NULL;
      IStream *st = NULL;
      HGLOBAL hg = NULL;
      EmptyClipboard();
      if (raw) {
        memcpy(GlobalLock(raw), bytes, n);
        GlobalUnlock(raw);
        SetClipboardData((UINT)g_cf_png, raw);
      }
      hg = GlobalAlloc(GMEM_MOVEABLE, n);
      if (hg) {
        memcpy(GlobalLock(hg), bytes, n);
        GlobalUnlock(hg);
        gdiplus_ensure();
        if (CreateStreamOnHGlobal(hg, FALSE, &st) == S_OK) {
          GdipCreateBitmapFromStream(st, &bmp);
          st->lpVtbl->Release(st);
        }
        GlobalFree(hg);
      }
      if (bmp) {
        if (GdipCreateHBITMAPFromBitmap(bmp, &hbm, 0) == 0 && hbm)
          SetClipboardData(CF_BITMAP, hbm);
        GdipDisposeImage((GpImage *)bmp);
      }
      CloseClipboard();
    }
    free(bytes);
    if (m->req_id >= 0) zt_reply_null(m->req_id);
    return 1;
  }
  if (strcmp(m->type, "clipboard_read_image") == 0) {
    if (m->req_id >= 0) {
      char *b64 = clipboard_read_image_b64();
      if (b64) {
        /* Wire contract: {"base64": "..."} (the runtime's ClipboardImage). */
        size_t need = strlen(b64) + 32;
        char *out = (char *)malloc(need);
        snprintf(out, need, "{\"base64\":\"%s\"}", b64);
        zt_reply_query(m->req_id, out);
        free(out);
        free(b64);
      } else {
        zt_reply_null(m->req_id);
      }
    }
    return 1;
  }
  return 0;
}

static int init(void) {
  HWND w = zt_hwnd();
  if (w) SetWindowSubclass(w, zt_proc, 1, 0);
  /* Permission bridge on the MAIN webview (the attach path below is
     second-window only) — 0ca12de lesson, mac parity. */
  install_permission_bridge(zt_w);
  /* Drop target on the MAIN webview (same asymmetry as the bridge). */
  drop_install(zt_w);
  return 1;
}

/* Subclass IDs must be unique per installation into a window chain; the
   main window takes 1 in init, runtime-created windows count up here. */
static UINT g_subclass_next = 1;

static int attach_webview(webview_t w) {
  /* Per-window event/close handling for runtime-created windows (GAP H4):
     without this, secondary windows never emit move/resize/focus/blur/close
     and their WM_CLOSE takes the raw engine path. */
  HWND h = zt_hwnd_for(w);
  if (h) SetWindowSubclass(h, zt_proc, ++g_subclass_next, 0);
  /* Permission interception: every webview gets the bridge; core decides. */
  install_permission_bridge(w);
  /* File drop target: revoke Chromium's on the WebView2 child, register
     ours so drops surface as drag_enter/over/leave/drop events (GAP H8). */
  drop_install(w);
  return 1;
}

static void relaunch(void) {
  char path[MAX_PATH];
  if (GetModuleFileNameA(NULL, path, sizeof(path)) > 0) {
    ShellExecuteA(NULL, "open", path, "0", NULL, SW_SHOWNORMAL);
  }
  /* webview_terminate, not WM_CLOSE: the prevent-close intercept would eat
     a posted WM_CLOSE and the relaunch would strand the old instance. */
  webview_terminate(zt_w);
}

const HostPlatformOps zt_platform = { dispatch, init, attach_webview, relaunch };
