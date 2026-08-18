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
#include <windows.h>
#include <commctrl.h>

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

static int is_window_op(const char *t) {
  static const char *ops[] = {
      "minimize",         "unminimize",      "toggle_maximize",
      "is_maximized",     "is_minimized",    "set_fullscreen",
      "is_fullscreen",    "set_always_on_top", "center",
      "set_focus",        "set_visible",     "set_resizable",
      "set_opacity",      "set_transparent", "set_decorations",
      "set_shadow",       "set_enabled",
  };
  for (size_t i = 0; i < sizeof(ops) / sizeof(ops[0]); i++)
    if (strcmp(t, ops[i]) == 0) return 1;
  return 0;
}

static void handle_window_op(Msg *m) {
  HWND w = zt_hwnd();
  if (!w) return;
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
    RECT wr, mr;
    MONITORINFO mi = { sizeof(mi) };
    HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTOPRIMARY);
    GetMonitorInfo(mon, &mi);
    GetWindowRect(w, &wr);
    result = wr.left == mi.rcMonitor.left && wr.top == mi.rcMonitor.top &&
             wr.right == mi.rcMonitor.right && wr.bottom == mi.rcMonitor.bottom;
  } else if (strcmp(m->type, "set_fullscreen") == 0) {
    if (m->bool_val) {
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
  } else if (strcmp(m->type, "set_always_on_top") == 0) {
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

/* Window proc forwarding tray/menu/window messages; the host's main window
 * proc (in webview/webview) may already handle some; we hook via subclass. */
static LRESULT CALLBACK zt_proc(HWND h, UINT msg, WPARAM wp, LPARAM lp,
                                UINT_PTR id, DWORD_PTR ref) {
  switch (msg) {
    case WM_APP + 1: /* tray callback */
      if (LOWORD(lp) == WM_LBUTTONUP) emit_tray_event("click");
      return 0;
    case WM_HOTKEY:
      zt_shortcut_pressed((int)wp);
      return 0;
    case WM_ACTIVATE:
      if (wp != WA_INACTIVE) emit_tray_event("focus");
      else emit_tray_event("blur");
      break;
    case WM_MOVE:
    case WM_SIZE:
      emit_tray_event(msg == WM_MOVE ? "move" : "resize");
      break;
    case WM_CLOSE:
      emit_tray_event("close");
      break;
  }
  return DefSubclassProc(h, msg, wp, lp);
}

static void tray_create(const char *title) {
  HWND w = zt_hwnd();
  if (!w) return;
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
static void tray_destroy(void) {
  if (g_tray_hwnd) Shell_NotifyIconW(NIM_DELETE, &g_nid);
  g_tray_hwnd = NULL;
}

/* ---- menu (Win32 HMENU) ---- */

static HMENU g_menu = NULL;
static char g_menu_items[256][128]; /* item_id by index */
static int g_menu_item_count = 0;

static void menu_create(const char *menu_id) {
  (void)menu_id;
  if (g_menu) DestroyMenu(g_menu);
  g_menu = CreateMenu();
  g_menu_item_count = 0;
}
static void menu_add_item(const char *menu_id, const char *item_id,
                          const char *text, int enabled, int separator, int checked) {
  (void)menu_id;
  (void)checked;
  if (!g_menu) return;
  if (separator) {
    AppendMenuA(g_menu, MF_SEPARATOR, 0, NULL);
    return;
  }
  int idx = g_menu_item_count < 256 ? g_menu_item_count++ : 255;
  snprintf(g_menu_items[idx], sizeof(g_menu_items[0]), "%s", item_id);
  UINT flags = MF_STRING | (enabled ? MF_ENABLED : MF_GRAYED);
  AppendMenuA(g_menu, flags, 1000 + idx, text);
}
static void menu_set_app(const char *menu_id) {
  (void)menu_id;
  HWND w = zt_hwnd();
  if (w && g_menu) SetMenu(w, g_menu);
}
static void menu_destroy(const char *menu_id) {
  (void)menu_id;
  if (g_menu) { DestroyMenu(g_menu); g_menu = NULL; }
}
static void menu_set_item_enabled(const char *menu_id, const char *item_id, int enabled) {
  (void)menu_id;
  for (int i = 0; i < g_menu_item_count; i++)
    if (strcmp(g_menu_items[i], item_id) == 0)
      EnableMenuItem(g_menu, 1000 + i, enabled ? MF_ENABLED : MF_GRAYED);
}
static void menu_set_item_title(const char *menu_id, const char *item_id, const char *title) {
  (void)menu_id;
  for (int i = 0; i < g_menu_item_count; i++)
    if (strcmp(g_menu_items[i], item_id) == 0)
      ModifyMenuA(g_menu, 1000 + i, MF_BYCOMMAND | MF_STRING, 1000 + i, title);
}

/* Command dispatch: the host's window proc receives WM_COMMAND with the
 * command id; webview/webview already forwards bind responses, so the menu
 * click is reported via the backend here. */
static void menu_handle_command(WORD id) {
  int idx = (int)id - 1000;
  if (idx >= 0 && idx < g_menu_item_count) {
    char ei[256];
    zt_json_escape(g_menu_items[idx], ei, sizeof(ei));
    char buf[600];
    snprintf(buf, sizeof(buf),
             "{\"type\":\"menu_event\",\"menu_id\":\"main\",\"item_id\":\"%s\"}",
             ei);
    zt_send_line(buf);
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

static int dispatch(Msg *m, webview_t w) {
  if (is_window_op(m->type)) { handle_window_op(m); return 1; }
  if (strcmp(m->type, "window_get_frame") == 0) {
    RECT r;
    HWND w = zt_hwnd();
    if (w && m->req_id >= 0 && GetWindowRect(w, &r)) zt_reply_frame(m->req_id, &r);
    else if (m->req_id >= 0) zt_reply_null(m->req_id);
    return 1;
  }
  if (strcmp(m->type, "window_set_position") == 0) {
    HWND w = zt_hwnd();
    if (w) SetWindowPos(w, 0, m->x, m->y, 0, 0, SWP_NOSIZE | SWP_NOZORDER);
    return 1;
  }
  if (strcmp(m->type, "set_prevent_close") == 0) { return 1; } /* WM_CLOSE intercept not implemented */
  if (strcmp(m->type, "window_destroy") == 0) {
    HWND w = zt_hwnd();
    if (w) DestroyWindow(w);
    return 1;
  }
  if (strcmp(m->type, "window_set_bounds") == 0) {
    HWND w = zt_hwnd();
    if (w) SetWindowPos(w, 0, m->x, m->y, m->width, m->height, SWP_NOZORDER);
    return 1;
  }
  if (strcmp(m->type, "window_get_state") == 0) {
    HWND w = zt_hwnd();
    if (w && m->req_id >= 0) {
      RECT wr, mr;
      MONITORINFO mi = { sizeof(mi) };
      HMONITOR mon = MonitorFromWindow(w, MONITOR_DEFAULTTOPRIMARY);
      GetMonitorInfo(mon, &mi);
      GetWindowRect(w, &wr);
      LONG_PTR style = GetWindowLongPtr(w, GWL_STYLE);
      LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
      int fullscreen = wr.left == mi.rcMonitor.left && wr.top == mi.rcMonitor.top &&
                       wr.right == mi.rcMonitor.right && wr.bottom == mi.rcMonitor.bottom;
      char buf[256];
      snprintf(buf, sizeof(buf),
               "{\"maximized\":%s,\"minimized\":%s,\"fullscreen\":%s,"
               "\"always_on_top\":%s,\"visible\":%s,\"resizable\":%s}",
               IsZoomed(w) ? "true" : "false",
               IsIconic(w) ? "true" : "false",
               fullscreen ? "true" : "false",
               (ex & WS_EX_TOPMOST) ? "true" : "false",
               IsWindowVisible(w) ? "true" : "false",
               (style & WS_THICKFRAME) ? "true" : "false");
      zt_reply_query(m->req_id, buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
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
      UINT dpi = GetDpiForWindow(zt_hwnd());
      char buf[64];
      snprintf(buf, sizeof(buf), "%g", (dpi ? dpi : 96) / 96.0);
      zt_reply_string(m->req_id, buf);
    }
    return 1;
  }
  if (strcmp(m->type, "set_ignore_cursor_events") == 0) {
    HWND w = zt_hwnd();
    if (w) {
      LONG_PTR ex = GetWindowLongPtr(w, GWL_EXSTYLE);
      if (m->bool_val) ex |= WS_EX_TRANSPARENT;
      else ex &= ~WS_EX_TRANSPARENT;
      SetWindowLongPtr(w, GWL_EXSTYLE, ex);
    }
    return 1;
  }
  if (strcmp(m->type, "window_get_title") == 0) {
    HWND w = zt_hwnd();
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
    HWND w = zt_hwnd();
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
    HWND hwnd = zt_hwnd();
    if (hwnd) {
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
  if (strcmp(m->type, "tray_create") == 0) { tray_create(m->id); return 1; }
  if (strcmp(m->type, "tray_set_title") == 0) { tray_set_title(m->id); return 1; }
  if (strcmp(m->type, "tray_set_tooltip") == 0) { tray_set_tooltip(m->str2); return 1; }
  if (strcmp(m->type, "tray_set_icon") == 0) {
    if (m->id[0]) { /* image id: not supported here; ignore */ }
    else tray_set_icon(m->str2);
    return 1;
  }
  if (strcmp(m->type, "tray_destroy") == 0) { tray_destroy(); return 1; }

  if (strcmp(m->type, "menu_create") == 0) { menu_create(m->str); return 1; }
  if (strcmp(m->type, "menu_add_item") == 0) { menu_add_item(m->str, m->id, m->str2, m->status, m->bool_val, m->checked); return 1; }
  if (strcmp(m->type, "menu_add_submenu_item") == 0) { return 1; } /* no-op: submenus unsupported */
  if (strcmp(m->type, "menu_set_app") == 0) { menu_set_app(m->str); return 1; }
  if (strcmp(m->type, "menu_destroy") == 0) { menu_destroy(m->str); return 1; }
  if (strcmp(m->type, "menu_item_set_enabled") == 0) { menu_set_item_enabled(m->str, m->id, m->status); return 1; }
  if (strcmp(m->type, "menu_item_set_title") == 0) { menu_set_item_title(m->str, m->id, m->str2); return 1; }

  if (strcmp(m->type, "dialog_open") == 0) { dialog_open(m); return 1; }
  if (strcmp(m->type, "dialog_save") == 0) { dialog_save(m); return 1; }
  if (strcmp(m->type, "dialog_message") == 0) { dialog_message(m); return 1; }

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
  return 0;
}

static int init(void) {
  HWND hwnd = zt_hwnd();
  if (hwnd) SetWindowSubclass(hwnd, zt_proc, 1, 0);
  return 1;
}

static void relaunch(void) {
  char path[MAX_PATH];
  if (GetModuleFileNameA(NULL, path, sizeof(path)) > 0) {
    ShellExecuteA(NULL, "open", path, "0", NULL, SW_SHOWNORMAL);
  }
  PostMessageW(zt_hwnd(), WM_CLOSE, 0, 0);
}

const HostPlatformOps zt_platform = { dispatch, init, NULL, relaunch };
