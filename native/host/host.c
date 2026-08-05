/*
 * ztron-host — native host (Plan A).
 *
 * Owns the WebView + GUI run loop on the main thread and bridges it to the
 * Ztron tjs backend over a TCP connection:
 *
 *   frontend -> webview_bind callback  ->  host writes {"type":"request",...}
 *   backend  -> {"type":"response",...} -> host calls webview_return
 *   backend  -> {"type":"eval",...}     -> host calls webview_eval
 *   backend  -> {"type":"quit"}         -> host terminates the run loop
 *
 * The backend connects to the host; the host prints "PORT=<n>" on stdout so
 * the CLI can pass it to the backend process.
 *
 * Newline-delimited JSON framing. Messages are flat objects; this host only
 * extracts the few fields it needs with a small escaping-aware reader.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>

#ifdef __APPLE__
#include <objc/runtime.h>
#include <objc/message.h>
#endif

#include "webview.h"

#define MSG_STR_LEN (1 << 20) /* 1 MiB */

/* ---- tiny JSON helpers (flat objects, string/int fields) ---- */

static const char *skip_ws(const char *s) {
  while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
  return s;
}

/* extracts "key":"..." (decoding JSON escapes) into out; returns 1 on success */
static int json_str(const char *json, const char *key, char *out,
                    size_t outsz) {
  char pat[128];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return 0;
  p = strchr(p + strlen(pat), ':');
  if (!p) return 0;
  p = skip_ws(p + 1);
  if (*p != '"') return 0;
  p++;
  size_t n = 0;
  while (*p && *p != '"' && n + 1 < outsz) {
    if (*p == '\\' && p[1]) {
      switch (p[1]) {
        case '"': out[n++] = '"'; p += 2; break;
        case '\\': out[n++] = '\\'; p += 2; break;
        case 'n': out[n++] = '\n'; p += 2; break;
        case 'r': out[n++] = '\r'; p += 2; break;
        case 't': out[n++] = '\t'; p += 2; break;
        case 'b': out[n++] = '\b'; p += 2; break;
        case 'f': out[n++] = '\f'; p += 2; break;
        default: out[n++] = *p++; break; /* leave \uXXXX verbatim */
      }
    } else {
      out[n++] = *p++;
    }
  }
  out[n] = '\0';
  return *p == '"';
}

static int json_int(const char *json, const char *key, int def) {
  char pat[128];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p = strchr(p + strlen(pat), ':');
  if (!p) return def;
  p = skip_ws(p + 1);
  return atoi(p);
}

/* ---- socket bridge ---- */

static int g_fd = -1;
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
static webview_t g_w = NULL;

static void send_line(const char *line) {
  if (g_fd < 0) return;
  pthread_mutex_lock(&g_lock);
  size_t n = strlen(line);
  ssize_t r = write(g_fd, line, n);
  if (r == (ssize_t)n) write(g_fd, "\n", 1);
  pthread_mutex_unlock(&g_lock);
}

/* runs on the GUI thread (queued via webview_dispatch) */
typedef struct {
  char type[16];
  char id[128];
  char str[MSG_STR_LEN];
  char str2[MSG_STR_LEN];
  int status;
  int width;
  int height;
  int req_id;   /* request id for window-state queries (-1 = no reply) */
  int bool_val; /* boolean argument for set_* window ops */
} Msg;

#ifdef __APPLE__
static void handle_window_op(Msg *m);
static void tray_create(const char *title);
static void tray_set_title(const char *title);
static void tray_set_tooltip(const char *tooltip);
static void tray_destroy(void);
static void menu_create(const char *menu_id);
static void menu_add_item(const char *menu_id, const char *item_id,
                          const char *text, int enabled, int separator);
static void menu_set_app(const char *menu_id);
static void menu_destroy(const char *menu_id);
static void menu_set_item_enabled(const char *menu_id, const char *item_id,
                                  int enabled);
static void menu_set_item_title(const char *menu_id, const char *item_id,
                                const char *title);
#endif
static int is_window_op(const char *t);

static void on_gui(webview_t w, void *arg) {
  Msg *m = (Msg *)arg;
  if (strcmp(m->type, "eval") == 0) {
    webview_eval(w, m->str);
  } else if (strcmp(m->type, "set_html") == 0) {
    webview_set_html(w, m->str);
  } else if (strcmp(m->type, "create_window") == 0) {
    if (m->width > 0 && m->height > 0) webview_set_size(w, m->width, m->height, 0);
    if (m->id[0]) webview_set_title(w, m->id);
    if (m->str[0]) webview_set_html(w, m->str);
  } else if (strcmp(m->type, "navigate") == 0) {
    webview_navigate(w, m->str);
  } else if (strcmp(m->type, "set_title") == 0) {
    webview_set_title(w, m->str);
  } else if (strcmp(m->type, "set_size") == 0) {
    webview_set_size(w, m->width, m->height, 0);
  } else if (strcmp(m->type, "response") == 0) {
    webview_return(w, m->id, m->status, m->str);
  } else if (strcmp(m->type, "quit") == 0) {
    webview_terminate(w);
  } else if (strcmp(m->type, "tray_create") == 0) {
#ifdef __APPLE__
    tray_create(m->str);
#endif
  } else if (strcmp(m->type, "tray_set_title") == 0) {
#ifdef __APPLE__
    tray_set_title(m->str);
#endif
  } else if (strcmp(m->type, "tray_set_tooltip") == 0) {
#ifdef __APPLE__
    tray_set_tooltip(m->str);
#endif
  } else if (strcmp(m->type, "tray_destroy") == 0) {
#ifdef __APPLE__
    tray_destroy();
#endif
  } else if (strcmp(m->type, "menu_create") == 0) {
#ifdef __APPLE__
    menu_create(m->str);
#endif
  } else if (strcmp(m->type, "menu_add_item") == 0) {
#ifdef __APPLE__
    menu_add_item(m->str, m->id, m->str2, m->status, m->bool_val);
#endif
  } else if (strcmp(m->type, "menu_set_app") == 0) {
#ifdef __APPLE__
    menu_set_app(m->str);
#endif
  } else if (strcmp(m->type, "menu_destroy") == 0) {
#ifdef __APPLE__
    menu_destroy(m->str);
#endif
  } else if (strcmp(m->type, "menu_item_set_enabled") == 0) {
#ifdef __APPLE__
    menu_set_item_enabled(m->str, m->id, m->status);
#endif
  } else if (strcmp(m->type, "menu_item_set_title") == 0) {
#ifdef __APPLE__
    menu_set_item_title(m->str, m->id, m->str2);
#endif
  } else {
    /* fall through to the macOS window-state handler */
#ifdef __APPLE__
    handle_window_op(m);
    free(m);
    return;
#else
    free(m);
    return;
#endif
  }
  free(m);
}

/* ---- macOS window state + events (via ObjC runtime on NSWindow) ---- */

#ifdef __APPLE__

#define OBJC_MSG(cast, obj, ...) ((cast)objc_msgSend)((id)(obj), __VA_ARGS__)

#define NS_FULLSCREEN_MASK 16384 /* NSFullScreenWindowMask = 1<<14 */
#define NS_RESIZABLE_MASK 8      /* NSResizableWindowMask = 1<<3 */
#define NS_NORMAL_LEVEL 0

static void *zt_window(void) {
  return webview_get_native_handle(g_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

static unsigned long wnd_style_mask(void *wnd) {
  return (unsigned long)OBJC_MSG(unsigned long(*)(id, SEL), wnd,
                                 sel_registerName("styleMask"));
}

static void wnd_set_style_mask(void *wnd, unsigned long mask) {
  OBJC_MSG(void(*)(id, SEL, unsigned long), wnd,
           sel_registerName("setStyleMask:"), mask);
}

static void wnd_void(void *wnd, const char *sel) {
  OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName(sel), NULL);
}

static int wnd_bool(void *wnd, const char *sel) {
  return (int)OBJC_MSG(BOOL(*)(id, SEL), wnd, sel_registerName(sel));
}

/* Handles one window-state op (runs on the GUI thread). Query ops reply with
 * {"type":"query_result","req_id":..,"result":true|false}. */
static void handle_window_op(Msg *m) {
  void *wnd = zt_window();
  if (!wnd) return;

  int result = 0;
  if (strcmp(m->type, "minimize") == 0) {
    wnd_void(wnd, "miniaturize:");
  } else if (strcmp(m->type, "unminimize") == 0) {
    wnd_void(wnd, "deminiaturize:");
  } else if (strcmp(m->type, "toggle_maximize") == 0) {
    wnd_void(wnd, "zoom:");
  } else if (strcmp(m->type, "is_maximized") == 0) {
    result = wnd_bool(wnd, "isZoomed");
  } else if (strcmp(m->type, "is_minimized") == 0) {
    result = wnd_bool(wnd, "isMiniaturized");
  } else if (strcmp(m->type, "is_fullscreen") == 0) {
    result = (wnd_style_mask(wnd) & NS_FULLSCREEN_MASK) != 0;
  } else if (strcmp(m->type, "set_fullscreen") == 0) {
    unsigned long mask = wnd_style_mask(wnd);
    wnd_set_style_mask(wnd, m->bool_val ? (mask | NS_FULLSCREEN_MASK)
                                        : (mask & ~NS_FULLSCREEN_MASK));
  } else if (strcmp(m->type, "set_always_on_top") == 0) {
    OBJC_MSG(void(*)(id, SEL, long), wnd, sel_registerName("setLevel:"),
             m->bool_val ? 1 : NS_NORMAL_LEVEL);
  } else if (strcmp(m->type, "center") == 0) {
    OBJC_MSG(void(*)(id, SEL), wnd, sel_registerName("center"));
  } else if (strcmp(m->type, "set_focus") == 0) {
    wnd_void(wnd, "makeKeyAndOrderFront:");
  } else if (strcmp(m->type, "set_visible") == 0) {
    OBJC_MSG(void(*)(id, SEL, BOOL), wnd, sel_registerName("setIsVisible:"),
             m->bool_val);
  } else if (strcmp(m->type, "set_resizable") == 0) {
    unsigned long mask = wnd_style_mask(wnd);
    wnd_set_style_mask(wnd, m->bool_val ? (mask | NS_RESIZABLE_MASK)
                                        : (mask & ~NS_RESIZABLE_MASK));
  }

  if (m->req_id >= 0) {
    char buf[128];
    snprintf(buf, sizeof(buf),
             "{\"type\":\"query_result\",\"req_id\":%d,\"result\":%s}",
             m->req_id, result ? "true" : "false");
    send_line(buf);
  }
}

/* ---- window events via NSWindow delegate ---- */

static void emit_window_event(const char *event) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"main\",\"event\":\"%s\"}",
           event);
  send_line(buf);
}

static void zt_evt_resize(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  emit_window_event("resize");
}
static void zt_evt_move(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  emit_window_event("move");
}
static void zt_evt_focus(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  emit_window_event("focus");
}
static void zt_evt_blur(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  emit_window_event("blur");
}
static void zt_evt_close(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  emit_window_event("close");
}
static BOOL zt_should_close(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  return YES;
}

static void install_window_delegate(void) {
  void *wnd = zt_window();
  if (!wnd) return;
  Class cls = objc_allocateClassPair(
      (Class)objc_getClass("NSObject"), "ZtronWindowDelegate", 0);
  class_addMethod(cls, sel_registerName("windowDidResize:"), (IMP)zt_evt_resize,
                  "v@:@");
  class_addMethod(cls, sel_registerName("windowDidMove:"), (IMP)zt_evt_move,
                  "v@:@");
  class_addMethod(cls, sel_registerName("windowDidBecomeKey:"),
                  (IMP)zt_evt_focus, "v@:@");
  class_addMethod(cls, sel_registerName("windowDidResignKey:"),
                  (IMP)zt_evt_blur, "v@:@");
  class_addMethod(cls, sel_registerName("windowWillClose:"), (IMP)zt_evt_close,
                  "v@:@");
  class_addMethod(cls, sel_registerName("windowShouldClose:"),
                  (IMP)zt_should_close, "B@:@");
  objc_registerClassPair(cls);
  id delegate = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
  OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName("setDelegate:"),
           delegate);
}

/* ---- system tray (NSStatusItem) ---- */

static void *g_status_item = NULL;
static id g_tray_target = NULL;

static id zt_nsstring(const char *s) {
  return OBJC_MSG(id(*)(id, SEL, const char *), (id)objc_getClass("NSString"),
                  sel_registerName("stringWithUTF8String:"), s);
}

static void emit_tray_event(const char *event) {
  char buf[128];
  snprintf(buf, sizeof(buf), "{\"type\":\"tray_event\",\"event\":\"%s\"}",
           event);
  send_line(buf);
}

static void zt_tray_click(id s, SEL c, id sender) {
  (void)s; (void)c; (void)sender;
  emit_tray_event("click");
}

static void tray_create(const char *title) {
  void *bar = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSStatusBar"),
                       sel_registerName("systemStatusBar"));
  id item = OBJC_MSG(id(*)(id, SEL, double), bar,
                     sel_registerName("statusItemWithLength:"), -1.0);
  if (item) {
    OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTitle:"),
             zt_nsstring(title));
    id button = OBJC_MSG(id(*)(id, SEL), item, sel_registerName("button"));
    OBJC_MSG(void(*)(id, SEL, id), button, sel_registerName("setTarget:"),
             g_tray_target);
    OBJC_MSG(void(*)(id, SEL, SEL), button, sel_registerName("setAction:"),
             sel_registerName("trayClick:"));
    g_status_item = item;
  }
}

static void tray_set_title(const char *title) {
  if (g_status_item) {
    OBJC_MSG(void(*)(id, SEL, id), g_status_item, sel_registerName("setTitle:"),
             zt_nsstring(title));
  }
}

static void tray_set_tooltip(const char *tooltip) {
  if (g_status_item) {
    OBJC_MSG(void(*)(id, SEL, id), g_status_item,
             sel_registerName("setToolTip:"), zt_nsstring(tooltip));
  }
}

static void tray_destroy(void) {
  if (g_status_item) {
    void *bar = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSStatusBar"),
                         sel_registerName("systemStatusBar"));
    OBJC_MSG(void(*)(id, SEL, id), bar, sel_registerName("removeStatusItem:"),
             g_status_item);
    g_status_item = NULL;
  }
}

static void install_tray_target(void) {
  Class cls = objc_allocateClassPair((Class)objc_getClass("NSObject"),
                                     "ZtronTrayTarget", 0);
  class_addMethod(cls, sel_registerName("trayClick:"), (IMP)zt_tray_click,
                  "v@:@");
  objc_registerClassPair(cls);
  g_tray_target = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
}

/* ---- application menu (NSMenu) ---- */

#define MAX_MENUS 8
#define MAX_MENU_REFS 256

typedef struct {
  char menu_id[64];
  char item_id[128];
} MenuItemRef;

static void *g_menus[MAX_MENUS];
static char g_menu_ids[MAX_MENUS][64];
static int g_menu_count = 0;
static MenuItemRef g_menu_refs[MAX_MENU_REFS];
static int g_menu_ref_count = 0;
static id g_menu_target = NULL;

static int menu_index(const char *id) {
  for (int i = 0; i < g_menu_count; i++) {
    if (strcmp(g_menu_ids[i], id) == 0) return i;
  }
  return -1;
}

static void menu_create(const char *menu_id) {
  id menu = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenu"),
                     sel_registerName("alloc"));
  menu = OBJC_MSG(id(*)(id, SEL, id), menu,
                  sel_registerName("initWithTitle:"), zt_nsstring(menu_id));
  OBJC_MSG(void(*)(id, SEL, BOOL), menu, sel_registerName("setAutoenablesItems:"),
           NO);
  int idx = menu_index(menu_id);
  if (idx >= 0) {
    g_menus[idx] = menu;
  } else if (g_menu_count < MAX_MENUS) {
    g_menus[g_menu_count] = menu;
    strncpy(g_menu_ids[g_menu_count], menu_id, sizeof(g_menu_ids[0]) - 1);
    g_menu_count++;
  }
}

static void menu_add_item(const char *menu_id, const char *item_id,
                          const char *text, int enabled, int separator) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  id menu = g_menus[idx];
  if (separator) {
    id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"),
                       sel_registerName("separatorItem"));
    OBJC_MSG(void(*)(id, SEL, id), menu, sel_registerName("addItem:"), item);
    return;
  }
  if (g_menu_ref_count >= MAX_MENU_REFS) return;
  id item = OBJC_MSG(id(*)(id, SEL),
                     (id)objc_getClass("NSMenuItem"), sel_registerName("alloc"));
  item = OBJC_MSG(id(*)(id, SEL, id, SEL, id), item,
                  sel_registerName("initWithTitle:action:keyEquivalent:"),
                  zt_nsstring(text), sel_registerName("menuItemClicked:"),
                  zt_nsstring(""));
  int tag = g_menu_ref_count;
  strncpy(g_menu_refs[tag].menu_id, menu_id, sizeof(g_menu_refs[tag].menu_id) - 1);
  strncpy(g_menu_refs[tag].item_id, item_id, sizeof(g_menu_refs[tag].item_id) - 1);
  g_menu_ref_count++;
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTarget:"),
           g_menu_target);
  OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setTag:"), tag);
  OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"),
           enabled);
  OBJC_MSG(void(*)(id, SEL, id), menu, sel_registerName("addItem:"), item);
}

static void menu_set_app(const char *menu_id) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  id app = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"),
                    sel_registerName("sharedApplication"));
  OBJC_MSG(void(*)(id, SEL, id), app, sel_registerName("setMainMenu:"),
           g_menus[idx]);
}

static void menu_destroy(const char *menu_id) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  OBJC_MSG(void(*)(id, SEL), g_menus[idx], sel_registerName("removeAllItems"));
  g_menus[idx] = NULL;
  g_menu_ids[idx][0] = '\0';
}

static id menu_find_item(const char *menu_id, const char *item_id) {
  int idx = menu_index(menu_id);
  if (idx < 0) return NULL;
  id items = OBJC_MSG(id(*)(id, SEL), g_menus[idx], sel_registerName("itemArray"));
  unsigned long count =
      (unsigned long)OBJC_MSG(unsigned long(*)(id, SEL), items,
                              sel_registerName("count"));
  for (unsigned long i = 0; i < count; i++) {
    id item = OBJC_MSG(id(*)(id, SEL, unsigned long), items,
                       sel_registerName("objectAtIndex:"), i);
    long tag = (long)OBJC_MSG(long(*)(id, SEL), item, sel_registerName("tag"));
    if (tag >= 0 && tag < g_menu_ref_count &&
        strcmp(g_menu_refs[tag].menu_id, menu_id) == 0 &&
        strcmp(g_menu_refs[tag].item_id, item_id) == 0) {
      return item;
    }
  }
  return NULL;
}

static void menu_set_item_enabled(const char *menu_id, const char *item_id,
                                  int enabled) {
  id item = menu_find_item(menu_id, item_id);
  if (item) {
    OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"),
             enabled);
  }
}

static void menu_set_item_title(const char *menu_id, const char *item_id,
                                const char *title) {
  id item = menu_find_item(menu_id, item_id);
  if (item) {
    OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTitle:"),
             zt_nsstring(title));
  }
}

static void zt_menu_click(id s, SEL c, id sender) {
  (void)s;
  (void)c;
  long tag = (long)OBJC_MSG(long(*)(id, SEL), sender, sel_registerName("tag"));
  if (tag >= 0 && tag < g_menu_ref_count) {
    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"type\":\"menu_event\",\"menu_id\":\"%s\",\"item_id\":\"%s\"}",
             g_menu_refs[tag].menu_id, g_menu_refs[tag].item_id);
    send_line(buf);
  }
}

static void install_menu_target(void) {
  Class cls = objc_allocateClassPair((Class)objc_getClass("NSObject"),
                                     "ZtronMenuTarget", 0);
  class_addMethod(cls, sel_registerName("menuItemClicked:"), (IMP)zt_menu_click,
                  "v@:@");
  objc_registerClassPair(cls);
  g_menu_target = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
}

#endif /* __APPLE__ */

/* backend -> host reader thread */
static void *socket_thread(void *arg) {
  FILE *f = fdopen(g_fd, "r");
  if (!f) return NULL;
  char *line = NULL;
  size_t cap = 0;
  ssize_t n;
  while ((n = getline(&line, &cap, f)) != -1) {
    while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = '\0';
    Msg *m = calloc(1, sizeof(Msg));
    if (!json_str(line, "type", m->type, sizeof(m->type))) {
      free(m);
      continue;
    }
    if (strcmp(m->type, "eval") == 0) {
      json_str(line, "js", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "create_window") == 0) {
      m->width = json_int(line, "width", 900);
      m->height = json_int(line, "height", 640);
      json_str(line, "title", m->id, sizeof(m->id));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "set_html") == 0) {
      json_str(line, "html", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "navigate") == 0) {
      json_str(line, "url", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "set_title") == 0) {
      json_str(line, "title", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "set_size") == 0) {
      m->width = json_int(line, "width", 0);
      m->height = json_int(line, "height", 0);
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "response") == 0) {
      json_str(line, "id", m->id, sizeof(m->id));
      m->status = json_int(line, "status", 0);
      json_str(line, "result", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "quit") == 0) {
      webview_dispatch(g_w, on_gui, m);
      break;
    } else if (strcmp(m->type, "tray_create") == 0 ||
               strcmp(m->type, "tray_set_title") == 0) {
      json_str(line, "title", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "tray_set_tooltip") == 0) {
      json_str(line, "tooltip", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "tray_destroy") == 0) {
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "menu_create") == 0 ||
               strcmp(m->type, "menu_set_app") == 0 ||
               strcmp(m->type, "menu_destroy") == 0) {
      json_str(line, "menu_id", m->str, sizeof(m->str));
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "menu_add_item") == 0) {
      json_str(line, "menu_id", m->str, sizeof(m->str));
      json_str(line, "item_id", m->id, sizeof(m->id));
      json_str(line, "text", m->str2, sizeof(m->str2));
      m->status = json_int(line, "enabled", 1);
      m->bool_val = json_int(line, "separator", 0);
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "menu_item_set_enabled") == 0) {
      json_str(line, "menu_id", m->str, sizeof(m->str));
      json_str(line, "item_id", m->id, sizeof(m->id));
      m->status = json_int(line, "enabled", 0);
      webview_dispatch(g_w, on_gui, m);
    } else if (strcmp(m->type, "menu_item_set_title") == 0) {
      json_str(line, "menu_id", m->str, sizeof(m->str));
      json_str(line, "item_id", m->id, sizeof(m->id));
      json_str(line, "title", m->str2, sizeof(m->str2));
      webview_dispatch(g_w, on_gui, m);
    } else if (is_window_op(m->type)) {
      m->req_id = json_int(line, "req_id", -1);
      m->bool_val = json_int(line, "value", 0);
      webview_dispatch(g_w, on_gui, m);
    } else {
      free(m);
    }
  }
  fclose(f);
  return NULL;
}


/* window-state operations handled by the platform layer */
static int is_window_op(const char *t) {
  static const char *ops[] = {
      "minimize",       "unminimize",    "toggle_maximize",
      "is_maximized",   "is_minimized",  "set_fullscreen",
      "is_fullscreen",  "set_always_on_top", "center",
      "set_focus",      "set_visible",   "set_resizable",
  };
  for (size_t i = 0; i < sizeof(ops) / sizeof(ops[0]); i++) {
    if (strcmp(t, ops[i]) == 0) return 1;
  }
  return 0;
}

/* webview_bind callback (GUI thread) -> backend */
static void ipc_cb(const char *id, const char *req, void *arg) {
  char buf[MSG_STR_LEN + 256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"request\",\"id\":\"%s\",\"label\":\"main\",\"req\":%s}",
           id, req);
  send_line(buf);
}

int main(int argc, char **argv) {
  const char *host = "127.0.0.1";
  int port = argc > 1 ? atoi(argv[1]) : 0;

  int lfd = socket(AF_INET, SOCK_STREAM, 0);
  if (lfd < 0) {
    perror("socket");
    return 1;
  }
  int one = 1;
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, &one, sizeof(one));
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons((uint16_t)port);
  inet_pton(AF_INET, host, &addr.sin_addr);
  if (bind(lfd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
    perror("bind");
    return 1;
  }
  if (listen(lfd, 1) < 0) {
    perror("listen");
    return 1;
  }
  socklen_t alen = sizeof(addr);
  getsockname(lfd, (struct sockaddr *)&addr, &alen);
  printf("PORT=%u\n", (unsigned)ntohs(addr.sin_port));
  fflush(stdout);

  /* create + bind the webview before the page loads */
  g_w = webview_create(1, NULL);
  if (!g_w) {
    fprintf(stderr, "webview_create failed\n");
    return 1;
  }
  webview_set_title(g_w, "Ztron");
  webview_set_size(g_w, 900, 640, 0);
  webview_bind(g_w, "__TAURI_IPC__", ipc_cb, NULL);
#ifdef __APPLE__
#ifdef __APPLE__
  install_window_delegate();
  install_tray_target();
  install_menu_target();
#endif
#endif

  /* wait for the backend to connect */
  struct sockaddr_in caddr;
  socklen_t clen = sizeof(caddr);
  int cfd = accept(lfd, (struct sockaddr *)&caddr, &clen);
  if (cfd < 0) {
    perror("accept");
    webview_destroy(g_w);
    return 1;
  }
  g_fd = cfd;
  pthread_t thr;
  pthread_create(&thr, NULL, socket_thread, NULL);

  webview_run(g_w);
  webview_destroy(g_w);
  close(cfd);
  close(lfd);
  return 0;
}
