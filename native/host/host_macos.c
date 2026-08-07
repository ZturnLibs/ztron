/*
 * host_macos.c — macOS platform implementation (Cocoa + WKWebView).
 *
 * Implements `zt_platform` for host.c: window states, window events (via an
 * NSWindow delegate), system tray (NSStatusItem), application menu (NSMenu)
 * and native dialogs (NSOpenPanel/NSSavePanel/NSAlert).
 */
#include <string.h>
#include <stdio.h>

#include <objc/runtime.h>
#include <objc/message.h>

#include "host_platform.h"

#define OBJC_MSG(cast, obj, ...) ((cast)objc_msgSend)((id)(obj), __VA_ARGS__)

#define NS_FULLSCREEN_MASK 16384 /* NSFullScreenWindowMask = 1<<14 */
#define NS_RESIZABLE_MASK 8      /* NSResizableWindowMask = 1<<3 */
#define NS_NORMAL_LEVEL 0
#define NS_MODAL_OK 1 /* NSModalResponseOK */

/* ---- JSON reply helpers ---- */

void zt_reply_query(int req_id, const char *json_value) {
  char buf[65536];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":%s}",
           req_id, json_value);
  zt_send_line(buf);
}

void zt_reply_string(int req_id, const char *s) {
  char buf[65536];
  char *p = buf;
  p += sprintf(p,
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":\"",
               req_id);
  for (; *s; s++) {
    if (*s == '"' || *s == '\\') *p++ = '\\';
    *p++ = *s;
  }
  *p++ = '"';
  *p++ = '}';
  *p = '\0';
  zt_send_line(buf);
}

void zt_reply_null(int req_id) { zt_reply_query(req_id, "null"); }

/* ---- helpers ---- */

static void *zt_window(void) {
  return webview_get_native_handle(zt_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
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
static id zt_nsstring(const char *s) {
  return OBJC_MSG(id(*)(id, SEL, const char *), (id)objc_getClass("NSString"),
                  sel_registerName("stringWithUTF8String:"), s);
}

/* ---- window states ---- */

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
    zt_reply_query(m->req_id, result ? "true" : "false");
  }
}

/* ---- window events (NSWindow delegate) ---- */

static void emit_window_event(const char *event) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"main\",\"event\":\"%s\"}",
           event);
  zt_send_line(buf);
}

static void zt_evt_resize(id s, SEL c, id n) { (void)s; (void)c; (void)n; emit_window_event("resize"); }
static void zt_evt_move(id s, SEL c, id n) { (void)s; (void)c; (void)n; emit_window_event("move"); }
static void zt_evt_focus(id s, SEL c, id n) { (void)s; (void)c; (void)n; emit_window_event("focus"); }
static void zt_evt_blur(id s, SEL c, id n) { (void)s; (void)c; (void)n; emit_window_event("blur"); }
static void zt_evt_close(id s, SEL c, id n) { (void)s; (void)c; (void)n; emit_window_event("close"); }
static BOOL zt_should_close(id s, SEL c, id n) { (void)s; (void)c; (void)n; return YES; }

static void install_window_delegate(void) {
  void *wnd = zt_window();
  if (!wnd) return;
  Class cls = objc_allocateClassPair(
      (Class)objc_getClass("NSObject"), "ZtronWindowDelegate", 0);
  class_addMethod(cls, sel_registerName("windowDidResize:"), (IMP)zt_evt_resize, "v@:@");
  class_addMethod(cls, sel_registerName("windowDidMove:"), (IMP)zt_evt_move, "v@:@");
  class_addMethod(cls, sel_registerName("windowDidBecomeKey:"), (IMP)zt_evt_focus, "v@:@");
  class_addMethod(cls, sel_registerName("windowDidResignKey:"), (IMP)zt_evt_blur, "v@:@");
  class_addMethod(cls, sel_registerName("windowWillClose:"), (IMP)zt_evt_close, "v@:@");
  class_addMethod(cls, sel_registerName("windowShouldClose:"), (IMP)zt_should_close, "B@:@");
  objc_registerClassPair(cls);
  id delegate = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
  OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName("setDelegate:"), delegate);
}

/* ---- system tray (NSStatusItem) ---- */

static void *g_status_item = NULL;
static id g_tray_target = NULL;

static void emit_tray_event(const char *event) {
  char buf[128];
  snprintf(buf, sizeof(buf), "{\"type\":\"tray_event\",\"event\":\"%s\"}", event);
  zt_send_line(buf);
}
static void zt_tray_click(id s, SEL c, id sender) { (void)s; (void)c; (void)sender; emit_tray_event("click"); }

static void tray_create(const char *title) {
  void *bar = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSStatusBar"), sel_registerName("systemStatusBar"));
  id item = OBJC_MSG(id(*)(id, SEL, double), bar, sel_registerName("statusItemWithLength:"), -1.0);
  if (item) {
    OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTitle:"), zt_nsstring(title));
    id button = OBJC_MSG(id(*)(id, SEL), item, sel_registerName("button"));
    OBJC_MSG(void(*)(id, SEL, id), button, sel_registerName("setTarget:"), g_tray_target);
    OBJC_MSG(void(*)(id, SEL, SEL), button, sel_registerName("setAction:"), sel_registerName("trayClick:"));
    /* statusItemWithLength: returns an autoreleased item; retain it so the
       stored g_status_item survives the next autorelease-pool drain. */
    g_status_item = OBJC_MSG(id(*)(id, SEL), item, sel_registerName("retain"));
  }
}
static void tray_set_title(const char *title) {
  if (g_status_item) {
    OBJC_MSG(void(*)(id, SEL, id), g_status_item, sel_registerName("setTitle:"), zt_nsstring(title));
  }
}
static void tray_set_tooltip(const char *tooltip) {
  if (g_status_item) {
    OBJC_MSG(void(*)(id, SEL, id), g_status_item, sel_registerName("setToolTip:"), zt_nsstring(tooltip));
  }
}
static void tray_destroy(void) {
  if (g_status_item) {
    void *bar = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSStatusBar"), sel_registerName("systemStatusBar"));
    OBJC_MSG(void(*)(id, SEL, id), bar, sel_registerName("removeStatusItem:"), g_status_item);
    OBJC_MSG(void(*)(id, SEL), g_status_item, sel_registerName("release"));
    g_status_item = NULL;
  }
}
static void install_tray_target(void) {
  Class cls = objc_allocateClassPair((Class)objc_getClass("NSObject"), "ZtronTrayTarget", 0);
  class_addMethod(cls, sel_registerName("trayClick:"), (IMP)zt_tray_click, "v@:@");
  objc_registerClassPair(cls);
  g_tray_target = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
}

/* ---- application menu (NSMenu) ---- */

#define MAX_MENUS 8
#define MAX_MENU_REFS 256

typedef struct { char menu_id[64]; char item_id[128]; } MenuItemRef;

static void *g_menus[MAX_MENUS];
static char g_menu_ids[MAX_MENUS][64];
static int g_menu_count = 0;
static MenuItemRef g_menu_refs[MAX_MENU_REFS];
static int g_menu_ref_count = 0;
static id g_menu_target = NULL;

static int menu_index(const char *id) {
  for (int i = 0; i < g_menu_count; i++)
    if (strcmp(g_menu_ids[i], id) == 0) return i;
  return -1;
}
static void menu_create(const char *menu_id) {
  id menu = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenu"), sel_registerName("alloc"));
  menu = OBJC_MSG(id(*)(id, SEL, id), menu, sel_registerName("initWithTitle:"), zt_nsstring(menu_id));
  OBJC_MSG(void(*)(id, SEL, BOOL), menu, sel_registerName("setAutoenablesItems:"), NO);
  int idx = menu_index(menu_id);
  if (idx >= 0) { g_menus[idx] = menu; }
  else if (g_menu_count < MAX_MENUS) {
    g_menus[g_menu_count] = menu;
    strncpy(g_menu_ids[g_menu_count], menu_id, sizeof(g_menu_ids[0]) - 1);
    g_menu_count++;
  }
}
static void menu_add_item(const char *menu_id, const char *item_id, const char *text, int enabled, int separator) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  id menu = g_menus[idx];
  if (separator) {
    id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"), sel_registerName("separatorItem"));
    OBJC_MSG(void(*)(id, SEL, id), menu, sel_registerName("addItem:"), item);
    return;
  }
  if (g_menu_ref_count >= MAX_MENU_REFS) return;
  id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"), sel_registerName("alloc"));
  item = OBJC_MSG(id(*)(id, SEL, id, SEL, id), item,
                  sel_registerName("initWithTitle:action:keyEquivalent:"),
                  zt_nsstring(text), sel_registerName("menuItemClicked:"), zt_nsstring(""));
  int tag = g_menu_ref_count;
  strncpy(g_menu_refs[tag].menu_id, menu_id, sizeof(g_menu_refs[tag].menu_id) - 1);
  strncpy(g_menu_refs[tag].item_id, item_id, sizeof(g_menu_refs[tag].item_id) - 1);
  g_menu_ref_count++;
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTarget:"), g_menu_target);
  OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setTag:"), tag);
  OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"), enabled);
  OBJC_MSG(void(*)(id, SEL, id), menu, sel_registerName("addItem:"), item);
}
static void menu_set_app(const char *menu_id) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  id app = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"), sel_registerName("sharedApplication"));
  OBJC_MSG(void(*)(id, SEL, id), app, sel_registerName("setMainMenu:"), g_menus[idx]);
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
  unsigned long count = (unsigned long)OBJC_MSG(unsigned long(*)(id, SEL), items, sel_registerName("count"));
  for (unsigned long i = 0; i < count; i++) {
    id item = OBJC_MSG(id(*)(id, SEL, unsigned long), items, sel_registerName("objectAtIndex:"), i);
    long tag = (long)OBJC_MSG(long(*)(id, SEL), item, sel_registerName("tag"));
    if (tag >= 0 && tag < g_menu_ref_count &&
        strcmp(g_menu_refs[tag].menu_id, menu_id) == 0 &&
        strcmp(g_menu_refs[tag].item_id, item_id) == 0) return item;
  }
  return NULL;
}
static void menu_set_item_enabled(const char *menu_id, const char *item_id, int enabled) {
  id item = menu_find_item(menu_id, item_id);
  if (item) OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"), enabled);
}
static void menu_set_item_title(const char *menu_id, const char *item_id, const char *title) {
  id item = menu_find_item(menu_id, item_id);
  if (item) OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTitle:"), zt_nsstring(title));
}
static void zt_menu_click(id s, SEL c, id sender) {
  (void)s; (void)c;
  long tag = (long)OBJC_MSG(long(*)(id, SEL), sender, sel_registerName("tag"));
  if (tag >= 0 && tag < g_menu_ref_count) {
    char buf[512];
    snprintf(buf, sizeof(buf),
             "{\"type\":\"menu_event\",\"menu_id\":\"%s\",\"item_id\":\"%s\"}",
             g_menu_refs[tag].menu_id, g_menu_refs[tag].item_id);
    zt_send_line(buf);
  }
}
static void install_menu_target(void) {
  Class cls = objc_allocateClassPair((Class)objc_getClass("NSObject"), "ZtronMenuTarget", 0);
  class_addMethod(cls, sel_registerName("menuItemClicked:"), (IMP)zt_menu_click, "v@:@");
  objc_registerClassPair(cls);
  g_menu_target = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
}

/* ---- dialogs ---- */

static void dialog_open(Msg *m) {
  id panel = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSOpenPanel"), sel_registerName("openPanel"));
  OBJC_MSG(void(*)(id, SEL, id), panel, sel_registerName("setTitle:"), zt_nsstring(m->str));
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setCanChooseFiles:"), YES);
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setCanChooseDirectories:"), NO);
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setAllowsMultipleSelection:"), NO);
  long resp = (long)OBJC_MSG(long(*)(id, SEL), panel, sel_registerName("runModal"));
  if (resp == NS_MODAL_OK) {
    id urls = OBJC_MSG(id(*)(id, SEL), panel, sel_registerName("URLs"));
    id url = OBJC_MSG(id(*)(id, SEL, unsigned long), urls, sel_registerName("objectAtIndex:"), 0);
    const char *path = OBJC_MSG(const char *(*)(id, SEL), url, sel_registerName("fileSystemRepresentation"));
    zt_reply_string(m->req_id, path ? path : "");
  } else {
    zt_reply_null(m->req_id);
  }
}
static void dialog_save(Msg *m) {
  id panel = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSSavePanel"), sel_registerName("savePanel"));
  OBJC_MSG(void(*)(id, SEL, id), panel, sel_registerName("setTitle:"), zt_nsstring(m->str));
  if (m->id[0]) {
    OBJC_MSG(void(*)(id, SEL, id), panel, sel_registerName("setNameFieldStringValue:"), zt_nsstring(m->id));
  }
  long resp = (long)OBJC_MSG(long(*)(id, SEL), panel, sel_registerName("runModal"));
  if (resp == NS_MODAL_OK) {
    id url = OBJC_MSG(id(*)(id, SEL), panel, sel_registerName("URL"));
    const char *path = OBJC_MSG(const char *(*)(id, SEL), url, sel_registerName("fileSystemRepresentation"));
    zt_reply_string(m->req_id, path ? path : "");
  } else {
    zt_reply_null(m->req_id);
  }
}
static void dialog_message(Msg *m) {
  id alert = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSAlert"), sel_registerName("alloc"));
  alert = OBJC_MSG(id(*)(id, SEL), alert, sel_registerName("init"));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setMessageText:"), zt_nsstring(m->str));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setInformativeText:"), zt_nsstring(m->str2));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("addButtonWithTitle:"), zt_nsstring("OK"));
  long resp = (long)OBJC_MSG(long(*)(id, SEL), alert, sel_registerName("runModal"));
  char tmp[32];
  snprintf(tmp, sizeof(tmp), "%ld", resp - 1000); /* NSAlertFirstButtonReturn */
  zt_reply_string(m->req_id, tmp);
}

/* ---- platform ops ---- */

static int dispatch(Msg *m) {
  if (is_window_op(m->type)) {
    handle_window_op(m);
    return 1;
  }
  if (strcmp(m->type, "tray_create") == 0) { tray_create(m->str); return 1; }
  if (strcmp(m->type, "tray_set_title") == 0) { tray_set_title(m->str); return 1; }
  if (strcmp(m->type, "tray_set_tooltip") == 0) { tray_set_tooltip(m->str2); return 1; }
  if (strcmp(m->type, "tray_destroy") == 0) { tray_destroy(); return 1; }

  if (strcmp(m->type, "menu_create") == 0) { menu_create(m->str); return 1; }
  if (strcmp(m->type, "menu_add_item") == 0) { menu_add_item(m->str, m->id, m->str2, m->status, m->bool_val); return 1; }
  if (strcmp(m->type, "menu_set_app") == 0) { menu_set_app(m->str); return 1; }
  if (strcmp(m->type, "menu_destroy") == 0) { menu_destroy(m->str); return 1; }
  if (strcmp(m->type, "menu_item_set_enabled") == 0) { menu_set_item_enabled(m->str, m->id, m->status); return 1; }
  if (strcmp(m->type, "menu_item_set_title") == 0) { menu_set_item_title(m->str, m->id, m->str2); return 1; }

  if (strcmp(m->type, "dialog_open") == 0) { dialog_open(m); return 1; }
  if (strcmp(m->type, "dialog_save") == 0) { dialog_save(m); return 1; }
  if (strcmp(m->type, "dialog_message") == 0) { dialog_message(m); return 1; }

  if (strcmp(m->type, "clipboard_read_text") == 0) {
    if (m->req_id >= 0) {
      id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                       sel_registerName("generalPasteboard"));
      id str = OBJC_MSG(id(*)(id, SEL, id), pb, sel_registerName("stringForType:"),
                        zt_nsstring("public.utf8-plain-text"));
      const char *s = str
          ? OBJC_MSG(const char *(*)(id, SEL), str, sel_registerName("UTF8String"))
          : NULL;
      if (s) zt_reply_string(m->req_id, s);
      else zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_text") == 0) {
    id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                     sel_registerName("generalPasteboard"));
    OBJC_MSG(void(*)(id, SEL), pb, sel_registerName("clearContents"));
    OBJC_MSG(void(*)(id, SEL, id, id), pb, sel_registerName("setString:forType:"),
             zt_nsstring(m->str2[0] ? m->str2 : m->str),
             zt_nsstring("public.utf8-plain-text"));
    return 1;
  }

  return 0;
}

static int init(void) {
  install_window_delegate();
  install_tray_target();
  install_menu_target();
  return 1;
}

const HostPlatformOps zt_platform = { dispatch, init };
