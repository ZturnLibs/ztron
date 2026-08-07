/*
 * host_platform.h — cross-platform abstraction for ztron-host.
 *
 * The webview/webview C API + the socket protocol are platform-agnostic; only
 * window states / tray / menu / dialogs / window events are platform-specific.
 * Each platform provides one `HostPlatformOps` implementation.
 *
 * The `ztron-host` binary is built from:
 *   host.c                (socket bridge, message dispatch, main loop)
 *   host_platform.<plat>.c (HostPlatformOps for this platform)
 *
 * Windows: host_windows.c (Win32 + WebView2 via webview native handle)
 * Linux:   host_linux.c   (GTK + WebKitGTK via webview native handle)
 * macOS:   host_macos.c   (Cocoa + WKWebView via webview native handle)
 */

#ifndef ZTRON_HOST_PLATFORM_H
#define ZTRON_HOST_PLATFORM_H

#include <stddef.h>

#include "webview.h"

/* ---- shared message struct (mirrors the JSON protocol) ---- */

#define MSG_STR_LEN (1 << 20) /* 1 MiB */

typedef struct Msg_ {
  char type[32]; /* longest op: menu_item_set_enabled (22) */
  char id[128];
  char str[MSG_STR_LEN];
  char str2[MSG_STR_LEN];
  int status;
  int width;
  int height;
  int req_id;   /* request id for window-state queries (-1 = no reply) */
  int bool_val; /* boolean argument for set_* window ops */
} Msg;

/* ---- shared runtime state (defined in host.c) ---- */

/* The active webview; platform code may read it (e.g. native handles). */
extern webview_t zt_w;

/* Send a newline-delimited JSON line to the backend (thread-safe). */
extern void zt_send_line(const char *line);

/* JSON field helpers (implemented in host.c). */
extern int zt_json_str(const char *json, const char *key, char *out,
                       size_t outsz);
extern int zt_json_int(const char *json, const char *key, int def);

/* JSON escaping helpers (implemented in each platform file). */
void zt_reply_query(int req_id, const char *json_value);
void zt_reply_string(int req_id, const char *s);
void zt_reply_null(int req_id);

/* ---- platform contract ---- */

/* Platform-specific operations. */
typedef struct {
  /*
   * Handle one backend message on the GUI thread. `m->type` selects the
   * operation; the implementation may reply via `zt_send_line` (e.g. a
   * query_result for is_maximized, or a window/tray/menu_event push).
   * Returns 1 if the message was recognized, 0 otherwise.
   */
  int (*dispatch)(Msg *m);

  /* One-time platform setup (install window delegate, tray/menu targets…). */
  int (*init)(void);
} HostPlatformOps;

extern const HostPlatformOps zt_platform;

#endif /* ZTRON_HOST_PLATFORM_H */
