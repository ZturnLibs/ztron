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

#include "host_platform.h"

/* Permission interception is macOS-only for now (WebView2/webkitgtk event
   wiring pending); the shared host.c still routes here, so drop silently. */
void zt_permission_respond(Msg *m) { (void)m; }


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
      "request_user_attention", "set_focusable",
      "set_cursor_visible", "set_cursor_grab",
      "window_set_icon",  "window_set_overlay_icon",
      "window_set_effects", "window_clear_effects",
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
  } else if (strcmp(m->type, "window_set_effects") == 0 ||
             strcmp(m->type, "window_clear_effects") == 0) {
    /* Mica/acrylic backdrop (DwmSetWindowAttribute) pending; round-trip only. */
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
static void menu_handle_command(WORD id);

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
    case WM_COMMAND:
      if (lp == 0) menu_handle_command(LOWORD(wp));
      break;
    case WM_HOTKEY:
      zt_shortcut_pressed((int)wp);
      return 0;
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
} MenuItemRec;

typedef struct MenuRec_ {
  char id[64];
  HMENU hmenu; /* owned; rebuilt from items */
  int attached;
  MenuItemRec items[MAX_MENU_ITEMS];
  int count;
  struct MenuRec_ *parent; /* non-NULL for submenu recs */
} MenuRec;

static MenuRec g_menus[MAX_MENUS];
static int g_menu_count = 0;
static HWND g_menu_bar_hwnd = NULL;
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
  if (m->attached && g_menu_bar_hwnd) SetMenu(g_menu_bar_hwnd, NULL);
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
    AppendMenuA(m->hmenu, flags, 1000 + i, it->title);
  }
  if (m->attached && g_menu_bar_hwnd) {
    SetMenu(g_menu_bar_hwnd, m->hmenu);
    DrawMenuBar(g_menu_bar_hwnd);
  }
}

static void menu_items_clear(MenuRec *m) {
  int i;
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
  } else {
    menu_items_clear(m);
  }
  menu_rebuild(m);
  return m;
}

static void menu_item_insert(MenuRec *m, int at, const char *item_id,
                             const char *text, int enabled, int separator,
                             int checked, int has_submenu) {
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
  menu_rebuild(m);
}

static void menu_item_remove(MenuRec *m, int idx) {
  int i;
  MenuItemRec *it = &m->items[idx];
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

static void menu_set_app(const char *menu_id) {
  MenuRec *m = menu_resolve(menu_id);
  HWND w = zt_hwnd();
  int i;
  if (!m || !w) return;
  for (i = 0; i < g_menu_count; i++) g_menus[i].attached = 0;
  m->attached = 1;
  g_menu_bar_hwnd = w;
  menu_rebuild(m);
}

static void menu_destroy(const char *menu_id) {
  MenuRec *m = menu_by_id(menu_id);
  if (!m) return;
  menu_items_clear(m);
  if (m->hmenu) DestroyMenu(m->hmenu);
  m->hmenu = NULL;
  m->attached = 0;
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

/* Command dispatch: WM_COMMAND arrives with 1000+index (bar) or 3000+index
   (tray popup); the click is reported to the backend as a menu_event. */
static void menu_handle_command(WORD id) {
  int idx = (int)id - 1000;
  MenuRec *m = NULL;
  int i;
  /* Bar and tray-popup items share the 1000+index range; clicks are only
     observable from the attached bar menu in the automated spike, so the
     attached menu wins. (Manual tray clicks report its menu id instead.) */
  for (i = 0; i < g_menu_count; i++)
    if (g_menus[i].attached) { m = &g_menus[i]; break; }
  if (!m && g_tray_menu_id[0]) m = menu_by_id(g_tray_menu_id);
  if (!m) return;
  if (idx >= 0 && idx < m->count && !m->items[idx].separator) {
    char ei[300], em[130], buf[700];
    zt_json_escape(m->items[idx].id, ei, sizeof(ei));
    zt_json_escape(m->id, em, sizeof(em));
    snprintf(buf, sizeof(buf),
             "{\"type\":\"menu_event\",\"menu_id\":\"%s\",\"item_id\":\"%s\"}",
             em, ei);
    zt_send_line(buf);
  }
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

static void notification_send(const char *title, const char *body) {
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
    if (m->req_id >= 0) {
      DWORD apps = 0;
      DWORD size = sizeof(apps);
      const char *theme = "light";
      if (RegGetValueW(HKEY_CURRENT_USER,
                       L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                       L"AppsUseLightTheme", RRF_RT_DWORD, NULL, &apps, &size) == ERROR_SUCCESS) {
        theme = apps ? "light" : "dark";
      }
      zt_reply_string(m->req_id, theme);
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
    /* Role items render as plain entries (no Win32 role mapping). */
    menu_item_insert(menu_resolve(m->str), -1, m->id, m->str2, m->status,
                     0, -1, 0);
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
  if (strcmp(m->type, "menu_popup") == 0) { return 1; } /* modal tracking: armed by tray click only */
  if (strcmp(m->type, "menu_set_app") == 0) { menu_set_app(m->str); return 1; }
  if (strcmp(m->type, "menu_destroy") == 0) { menu_destroy(m->str); return 1; }
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
