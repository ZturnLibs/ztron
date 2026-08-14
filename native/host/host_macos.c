/*
 * host_macos.c — macOS platform implementation (Cocoa + WKWebView).
 *
 * Implements `zt_platform` for host.c: window states, window events (via an
 * NSWindow delegate), system tray (NSStatusItem), application menu (NSMenu)
 * and native dialogs (NSOpenPanel/NSSavePanel/NSAlert).
 */
#include <string.h>
#include <stdio.h>
#include <stdlib.h>

#include <objc/runtime.h>
#include <objc/message.h>
#include <Carbon/Carbon.h>
#include <mach-o/dyld.h>

#include "host_platform.h"

#define OBJC_MSG(cast, obj, ...) ((cast)objc_msgSend)((id)(obj), __VA_ARGS__)

#define NS_FULLSCREEN_MASK 16384 /* NSFullScreenWindowMask = 1<<14 */
#define NS_RESIZABLE_MASK 8      /* NSResizableWindowMask = 1<<3 */
#define NS_TITLED_MASK 1         /* NSTitledWindowMask = 1<<0 */
#define NS_CLOSABLE_MASK 2       /* NSClosableWindowMask = 1<<1 */
#define NS_MINIATURIZABLE_MASK 4 /* NSMiniaturizableWindowMask = 1<<2 */
#define NS_FULLSIZECONTENTVIEW_MASK 32768 /* 1<<15 */
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

static id zt_nsstring(const char *s); /* defined below */

/* ---- window frame / position (NSPoint/NSRect via objc_msgSend) ---- */

typedef struct { double x, y, width, height; } ZtRect;

static ZtRect zt_wnd_frame(void *wnd) {
  ZtRect r;
#if defined(__aarch64__)
  r = ((ZtRect(*)(id, SEL))objc_msgSend)((id)wnd, sel_registerName("frame"));
#else
  ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
      (id)wnd, sel_registerName("frame"), &r);
#endif
  return r;
}

static void zt_wnd_set_origin(void *wnd, double x, double y) {
  ((void(*)(id, SEL, double, double))objc_msgSend)(
      (id)wnd, sel_registerName("setFrameOrigin:"), x, y);
}

static void zt_reply_frame(int req_id, ZtRect r) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":{\"x\":%d,"
           "\"y\":%d,\"width\":%d,\"height\":%d}}",
           req_id, (int)r.x, (int)r.y, (int)r.width, (int)r.height);
  zt_send_line(buf);
}

/* ---- image registry ---- */

#define MAX_IMAGES 32
static void *g_images[MAX_IMAGES];
static int g_image_count = 0;

static int image_add(id nsImage) {
  if (g_image_count >= MAX_IMAGES) return -1;
  int id = g_image_count;
  g_images[id] = nsImage;
  g_image_count++;
  return id;
}
static void image_destroy(int img_id) {
  if (img_id >= 0 && img_id < g_image_count) {
    OBJC_MSG(void(*)(id, SEL), g_images[img_id], sel_registerName("release"));
    g_images[img_id] = NULL;
  }
}
static id image_by_id(int img_id) {
  if (img_id >= 0 && img_id < g_image_count) return g_images[img_id];
  return NULL;
}

/* ---- notifications (NSUserNotificationCenter) ---- */

static void notification_send(const char *title, const char *body) {
  id center = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSUserNotificationCenter"),
                       sel_registerName("defaultUserNotificationCenter"));
  id note = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSUserNotification"),
                     sel_registerName("alloc"));
  note = OBJC_MSG(id(*)(id, SEL), note, sel_registerName("init"));
  if (!note) return;
  OBJC_MSG(void(*)(id, SEL, id), note, sel_registerName("setTitle:"),
           zt_nsstring(title));
  OBJC_MSG(void(*)(id, SEL, id), note, sel_registerName("setInformativeText:"),
           zt_nsstring(body));
  OBJC_MSG(void(*)(id, SEL, id), center, sel_registerName("deliverNotification:"),
           note);
  OBJC_MSG(void(*)(id, SEL), note, sel_registerName("release"));
}

/* ---- global shortcuts (Carbon RegisterEventHotKey) ---- */

#define MAX_HOTKEYS 16

typedef struct {
  EventHotKeyRef ref;
  int id;
  char name[64];
} HotKeyEntry;

static HotKeyEntry g_hotkeys[MAX_HOTKEYS];
static int g_hotkey_count = 0;
static int g_prevent_close = 0;
static int g_hotkey_seq = 1;
static EventHandlerUPP g_hotkey_handler = NULL;

static OSStatus hotkey_cb(EventHandlerCallRef next, EventRef ev, void *user) {
  (void)next;
  (void)user;
  EventHotKeyID hk;
  if (GetEventParameter(ev, kEventParamDirectObject, typeEventHotKeyID, NULL,
                        sizeof(hk), NULL, &hk) != noErr) {
    return noErr;
  }
  for (int i = 0; i < g_hotkey_count; i++) {
    if (g_hotkeys[i].id == (int)hk.id) {
      char esc[512];
      zt_json_escape(g_hotkeys[i].name, esc, sizeof(esc));
      char buf[600];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"shortcut_event\",\"shortcut_id\":\"%s\"}",
               esc);
      zt_send_line(buf);
      break;
    }
  }
  return noErr;
}

static void ensure_hotkey_handler(void) {
  if (g_hotkey_handler) return;
  EventTypeSpec specs[] = {{kEventClassKeyboard, kEventHotKeyPressed}};
  g_hotkey_handler = NewEventHandlerUPP(hotkey_cb);
  InstallEventHandler(GetApplicationEventTarget(), g_hotkey_handler, 1, specs,
                      NULL, NULL);
}

static int letter_keycode(char c) {
  static const int codes[26] = {
      0x00, 0x0B, 0x08, 0x02, 0x0E, 0x03, 0x05, 0x04, 0x22, 0x26, 0x28, 0x25,
      0x2E, 0x2D, 0x1F, 0x23, 0x0C, 0x0F, 0x01, 0x11, 0x20, 0x09, 0x0D, 0x07,
      0x10, 0x06};
  if (c >= 'A' && c <= 'Z') return codes[c - 'A'];
  return -1;
}

/* Parses "Cmd+Shift+K" / "F5" / "Ctrl+Alt+1" into Carbon keycode + modifiers. */
static int parse_accelerator(const char *accel, UInt32 *mods, UInt32 *code) {
  *mods = 0;
  const char *key = accel;
  char tmp[256];
  snprintf(tmp, sizeof(tmp), "%s", accel);
  char *save = NULL;
  for (char *tok = strtok_r(tmp, "+", &save); tok;
       tok = strtok_r(NULL, "+", &save)) {
    if (!strcasecmp(tok, "cmd") || !strcasecmp(tok, "command") ||
        !strcasecmp(tok, "super") || !strcasecmp(tok, "meta")) {
      *mods |= cmdKey;
      continue;
    }
    if (!strcasecmp(tok, "ctrl") || !strcasecmp(tok, "control")) {
      *mods |= controlKey;
      continue;
    }
    if (!strcasecmp(tok, "alt") || !strcasecmp(tok, "option")) {
      *mods |= optionKey;
      continue;
    }
    if (!strcasecmp(tok, "shift")) {
      *mods |= shiftKey;
      continue;
    }
    key = tok; /* last non-modifier token is the key */
  }

  if (strlen(key) == 1) {
    char k = key[0];
    if (k >= 'A' && k <= 'Z') {
      *code = (UInt32)letter_keycode(k);
      return *code != (UInt32)-1 ? 0 : -1;
    }
    if (k >= '0' && k <= '9') {
      static const int digits[10] = {0x1D, 0x12, 0x13, 0x14, 0x15,
                                     0x17, 0x16, 0x1A, 0x1C, 0x19};
      *code = (UInt32)digits[k - '0'];
      return 0;
    }
    if (k == ' ') { *code = 0x31; return 0; }
    return -1;
  }
  if (key[0] == 'F' && key[1] >= '1' && key[1] <= '9' && !key[2]) {
    static const int fkeys[10] = {0x7A, 0x78, 0x63, 0x76, 0x60,
                                  0x61, 0x62, 0x64, 0x65};
    *code = (UInt32)fkeys[key[1] - '1'];
    return 0;
  }
  if (key[0] == 'F' && key[1] == '1' && key[2] >= '0' && key[2] <= '2' &&
      !key[3]) {
    static const int fkeys[3] = {0x6D, 0x67, 0x6F};
    *code = (UInt32)fkeys[key[2] - '0'];
    return 0;
  }
  return -1;
}

static int shortcut_register(const char *name, const char *accel) {
  if (g_hotkey_count >= MAX_HOTKEYS) return 0;
  UInt32 mods = 0, code = 0;
  if (parse_accelerator(accel, &mods, &code) != 0) return 0;
  ensure_hotkey_handler();
  EventHotKeyID hkid;
  hkid.signature = 'Ztrn';
  hkid.id = (UInt32)g_hotkey_seq++;
  EventHotKeyRef ref = NULL;
  if (RegisterEventHotKey(code, mods, hkid, GetApplicationEventTarget(), 0,
                          &ref) != noErr) {
    return 0;
  }
  g_hotkeys[g_hotkey_count].ref = ref;
  g_hotkeys[g_hotkey_count].id = hkid.id;
  snprintf(g_hotkeys[g_hotkey_count].name, sizeof(g_hotkeys[0].name), "%s",
           name);
  g_hotkey_count++;
  return 1;
}

static int shortcut_unregister(const char *name) {
  for (int i = 0; i < g_hotkey_count; i++) {
    if (strcmp(g_hotkeys[i].name, name) == 0) {
      UnregisterEventHotKey(g_hotkeys[i].ref);
      g_hotkeys[i] = g_hotkeys[--g_hotkey_count];
      return 1;
    }
  }
  return 0;
}

/* ---- deep links (kAEGetURL AppleEvent) ---- */

static OSErr ae_geturl_handler(const AppleEvent *ev, AppleEvent *reply,
                               SRefCon ref) {
  (void)reply;
  (void)ref;
  AEDesc desc;
  if (AEGetParamDesc(ev, keyDirectObject, typeChar, &desc) == noErr) {
    Size len = AEGetDescDataSize(&desc);
    if (len > 0) {
      char *buf = (char *)malloc((size_t)len + 1);
      if (buf) {
        AEGetDescData(&desc, buf, len);
        buf[len] = '\0';
        char esc[8192];
        zt_json_escape(buf, esc, sizeof(esc));
        char out[8192 + 64];
        snprintf(out, sizeof(out), "{\"type\":\"deep_link\",\"url\":\"%s\"}",
                 esc);
        zt_send_line(out);
        free(buf);
      }
    }
    AEDisposeDesc(&desc);
  }
  return noErr;
}

static void install_deep_link_handler(void) {
  AEInstallEventHandler(kInternetEventClass, kAEGetURL,
                        NewAEEventHandlerUPP(ae_geturl_handler), 0, 0);
  /* Register the `ztron` scheme so `open "ztron://..."` routes here. */
  char path[4096];
  uint32_t size = sizeof(path);
  if (_NSGetExecutablePath(path, &size) == 0) {
    CFURLRef url = CFURLCreateFromFileSystemRepresentation(
        NULL, (const UInt8 *)path, strlen(path), false);
    if (url) {
      LSRegisterURL(url, true);
      CFRelease(url);
    }
  }
}

/* ---- helpers ---- */

static id zt_nsapp(void) {
  return OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"),
                  sel_registerName("sharedApplication"));
}

static void *zt_window(void) {
  return webview_get_native_handle(zt_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

/* Native window for a specific webview instance (multi-window support). */
static void *zt_window_of(webview_t w) {
  if (!w) return NULL;
  return webview_get_native_handle(w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
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

/* Parses a window background color: "transparent" → clearColor,
   "#rrggbb"/"#rrggbbaa" hex → sRGB NSColor, anything else → window bg. */
static id zt_parse_color(const char *s) {
  id cls = (id)objc_getClass("NSColor");
  if (!s || strcmp(s, "transparent") == 0) {
    return OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("clearColor"));
  }
  if (s[0] == '#' && (strlen(s) == 7 || strlen(s) == 9)) {
    unsigned int r = 0, g = 0, b = 0, a = 255;
    if (strlen(s) == 9) {
      sscanf(s, "#%2x%2x%2x%2x", &r, &g, &b, &a);
    } else {
      sscanf(s, "#%2x%2x%2x", &r, &g, &b);
    }
    return OBJC_MSG(id(*)(id, SEL, double, double, double, double), cls,
                    sel_registerName("colorWithSRGBRed:green:blue:alpha:"),
                    r / 255.0, g / 255.0, b / 255.0, a / 255.0);
  }
  return OBJC_MSG(id(*)(id, SEL), cls,
                  sel_registerName("windowBackgroundColor"));
}

/* ---- dock tile (app-wide badge / progress, tao-aligned) ---- */

static id zt_dock_tile(void) {
  return OBJC_MSG(id(*)(id, SEL), zt_nsapp(), sel_registerName("dockTile"));
}

static void dock_set_badge(const char *text) {
  id tile = zt_dock_tile();
  if (!tile) return;
  id s = (text && text[0]) ? zt_nsstring(text) : NULL;
  OBJC_MSG(void(*)(id, SEL, id), tile, sel_registerName("setBadgeLabel:"), s);
}

static void dock_set_progress(double progress) {
  id tile = zt_dock_tile();
  if (!tile) return;
  if (progress < 0) {
    OBJC_MSG(void(*)(id, SEL, id), tile, sel_registerName("setContentView:"),
             (id)NULL);
    OBJC_MSG(void(*)(id, SEL), tile, sel_registerName("display"));
    return;
  }
  /* Layout a determinate NSProgressIndicator inside the dock tile
     (mirrors tao's Window::set_progress_bar). */
  typedef struct { double x, y, w, h; } ZtNSRect;
  ZtNSRect full = {0, 0, 128, 128};
  id v = OBJC_MSG(id(*)(id, SEL, ZtNSRect), (id)objc_getClass("NSView"),
                  sel_registerName("alloc"), full);
  v = OBJC_MSG(id(*)(id, SEL, ZtNSRect), v,
               sel_registerName("initWithFrame:"), full);
  if (!v) return;
  ZtNSRect bar = {0, 0, full.w, 20};
  id pi = OBJC_MSG(id(*)(id, SEL, ZtNSRect), (id)objc_getClass("NSProgressIndicator"),
                   sel_registerName("alloc"), bar);
  pi = OBJC_MSG(id(*)(id, SEL, ZtNSRect), pi,
                sel_registerName("initWithFrame:"), bar);
  if (!pi) return;
  OBJC_MSG(void(*)(id, SEL, BOOL), pi, sel_registerName("setIndeterminate:"),
           NO);
  OBJC_MSG(void(*)(id, SEL, double), pi, sel_registerName("setDoubleValue:"),
           progress * 100.0);
  OBJC_MSG(void(*)(id, SEL, BOOL), pi, sel_registerName("setBezeled:"), NO);
  OBJC_MSG(void(*)(id, SEL, long), pi, sel_registerName("setControlSize:"),
           1 /* NSSmallControlSize */);
  OBJC_MSG(void(*)(id, SEL, BOOL), pi,
           sel_registerName("setDisplayedWhenStopped:"), YES);
  OBJC_MSG(void(*)(id, SEL, id), v, sel_registerName("addSubview:"), pi);
  OBJC_MSG(void(*)(id, SEL, id), tile, sel_registerName("setContentView:"), v);
  OBJC_MSG(void(*)(id, SEL), tile, sel_registerName("display"));
}

/* ---- window states ---- */

static int is_window_op(const char *t) {
  static const char *ops[] = {
      "minimize",       "unminimize",    "toggle_maximize",
      "is_maximized",   "is_minimized",  "set_fullscreen",
      "is_fullscreen",  "set_always_on_top", "set_always_on_bottom",
      "center",         "set_focus",     "is_focused",
      "set_visible",    "set_resizable", "set_opacity",
      "set_transparent", "set_decorations", "is_decorated",
      "set_shadow",     "set_enabled",   "set_minimizable",
      "is_minimizable", "set_maximizable", "is_maximizable",
      "set_closable",   "is_closable",   "set_skip_taskbar",
      "set_content_protected", "request_user_attention",
  };
  for (size_t i = 0; i < sizeof(ops) / sizeof(ops[0]); i++) {
    if (strcmp(t, ops[i]) == 0) return 1;
  }
  return 0;
}

static void handle_window_op(Msg *m, webview_t w) {
  void *wnd = zt_window_of(w);
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
  } else if (strcmp(m->type, "set_opacity") == 0) {
    OBJC_MSG(void(*)(id, SEL, double), wnd, sel_registerName("setAlphaValue:"),
             m->opacity_val);
  } else if (strcmp(m->type, "set_transparent") == 0) {
    OBJC_MSG(void(*)(id, SEL, BOOL), wnd, sel_registerName("setOpaque:"),
             m->bool_val ? NO : YES);
    OBJC_MSG(void(*)(id, SEL, BOOL), wnd, sel_registerName("setHasShadow:"),
             m->bool_val ? NO : YES);
    id bg = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSColor"),
                     sel_registerName(m->bool_val ? "clearColor"
                                                  : "windowBackgroundColor"));
    OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName("setBackgroundColor:"),
             bg);
  } else if (strcmp(m->type, "set_decorations") == 0) {
    unsigned long mask = wnd_style_mask(wnd);
    /* Titled | Closable | Miniaturizable | Resizable | FullSizeContentView */
    unsigned long deco_mask = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 3) | (1 << 15);
    wnd_set_style_mask(wnd, m->bool_val ? (mask | deco_mask)
                                        : (mask & ~deco_mask));
  } else if (strcmp(m->type, "set_shadow") == 0) {
    OBJC_MSG(void(*)(id, SEL, BOOL), wnd, sel_registerName("setHasShadow:"),
             m->bool_val);
  } else if (strcmp(m->type, "set_enabled") == 0) {
    /* NSWindow has no setEnabled:; a window is always interactive on macOS.
       Apps that need this use setIgnoreCursorEvents (see set_ignore). */
  } else if (strcmp(m->type, "set_minimizable") == 0) {
    unsigned long mask = wnd_style_mask(wnd);
    wnd_set_style_mask(wnd, m->bool_val ? (mask | NS_MINIATURIZABLE_MASK)
                                        : (mask & ~NS_MINIATURIZABLE_MASK));
  } else if (strcmp(m->type, "is_minimizable") == 0) {
    result = (wnd_style_mask(wnd) & NS_MINIATURIZABLE_MASK) != 0;
  } else if (strcmp(m->type, "set_closable") == 0) {
    unsigned long mask = wnd_style_mask(wnd);
    wnd_set_style_mask(wnd, m->bool_val ? (mask | NS_CLOSABLE_MASK)
                                        : (mask & ~NS_CLOSABLE_MASK));
  } else if (strcmp(m->type, "is_closable") == 0) {
    result = (wnd_style_mask(wnd) & NS_CLOSABLE_MASK) != 0;
  } else if (strcmp(m->type, "set_maximizable") == 0) {
    /* the zoom button (NSWindowZoomButton = 2) */
    id btn = OBJC_MSG(id(*)(id, SEL, long), wnd,
                      sel_registerName("standardWindowButton:"), 2);
    if (btn) {
      OBJC_MSG(void(*)(id, SEL, BOOL), btn, sel_registerName("setEnabled:"),
               m->bool_val);
    }
  } else if (strcmp(m->type, "is_maximizable") == 0) {
    id btn = OBJC_MSG(id(*)(id, SEL, long), wnd,
                      sel_registerName("standardWindowButton:"), 2);
    result = btn ? wnd_bool(btn, "isEnabled") : 0;
  } else if (strcmp(m->type, "is_decorated") == 0) {
    result = (wnd_style_mask(wnd) & NS_TITLED_MASK) != 0;
  } else if (strcmp(m->type, "is_focused") == 0) {
    result = wnd_bool(wnd, "isKeyWindow");
  } else if (strcmp(m->type, "set_skip_taskbar") == 0) {
    /* hiding from the Dock: accessory activation policy */
    OBJC_MSG(void(*)(id, SEL, long), zt_nsapp(),
             sel_registerName("setActivationPolicy:"),
             m->bool_val ? 1 /* NSApplicationActivationPolicyAccessory */
                         : 0 /* NSApplicationActivationPolicyRegular */);
  } else if (strcmp(m->type, "set_always_on_bottom") == 0) {
    OBJC_MSG(void(*)(id, SEL, long), wnd, sel_registerName("setLevel:"),
             m->bool_val ? -1 : NS_NORMAL_LEVEL);
  } else if (strcmp(m->type, "set_content_protected") == 0) {
    OBJC_MSG(void(*)(id, SEL, unsigned long), wnd,
             sel_registerName("setSharingType:"),
             m->bool_val ? 2 /* NSWindowSharingNone */
                         : 0 /* NSWindowSharingReadOnly */);
  } else if (strcmp(m->type, "request_user_attention") == 0) {
    OBJC_MSG(void(*)(id, SEL, long), zt_nsapp(),
             sel_registerName("requestUserAttention:"),
             m->bool_val ? 1 /* NSCriticalRequest */ : 0 /* NSInformationalRequest */);
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
static BOOL zt_should_close(id s, SEL c, id n) {
  (void)s; (void)c; (void)n;
  if (g_prevent_close) {
    emit_window_event("close"); /* -> tauri://close-requested */
    return NO;
  }
  return YES;
}

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
static void tray_set_icon(const char *path) {
  if (g_status_item && path && path[0]) {
    /* imageWithContentsOfFile: is gone on modern macOS; use alloc/init. */
    id image = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSImage"),
                        sel_registerName("alloc"));
    image = OBJC_MSG(id(*)(id, SEL, id), image,
                     sel_registerName("initWithContentsOfFile:"),
                     zt_nsstring(path));
    if (image) {
      id button = OBJC_MSG(id(*)(id, SEL), g_status_item, sel_registerName("button"));
      OBJC_MSG(void(*)(id, SEL, id), button, sel_registerName("setImage:"), image);
      OBJC_MSG(void(*)(id, SEL), image, sel_registerName("release"));
    }
  }
}
/* Sets the tray icon from a registered image id (from the image registry). */
static void tray_set_icon_id(int image_id) {
  id image = image_by_id(image_id);
  if (g_status_item && image) {
    id button = OBJC_MSG(id(*)(id, SEL), g_status_item, sel_registerName("button"));
    OBJC_MSG(void(*)(id, SEL, id), button, sel_registerName("setImage:"), image);
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
static void menu_add_item(const char *menu_id, const char *item_id, const char *text, int enabled, int separator, int checked) {
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
  if (checked >= 0) {
    OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setState:"),
             checked ? 1 /*NSOnState*/ : 0 /*NSOffState*/);
  }
  OBJC_MSG(void(*)(id, SEL, id), menu, sel_registerName("addItem:"), item);
}
/* Creates a submenu-bearing item; later menu_add_item calls target its menu. */
static void menu_add_submenu_item(const char *menu_id, const char *submenu_id,
                                  const char *text) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  if (g_menu_count >= MAX_MENUS) return;
  id sub = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenu"), sel_registerName("alloc"));
  sub = OBJC_MSG(id(*)(id, SEL, id), sub, sel_registerName("initWithTitle:"), zt_nsstring(text));
  int sidx = g_menu_count;
  strncpy(g_menu_ids[sidx], submenu_id, sizeof(g_menu_ids[0]) - 1);
  g_menu_ids[sidx][sizeof(g_menu_ids[0]) - 1] = '\0';
  g_menu_count++;
  g_menus[sidx] = sub;
  id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"), sel_registerName("alloc"));
  item = OBJC_MSG(id(*)(id, SEL, id, SEL, id), item,
                  sel_registerName("initWithTitle:action:keyEquivalent:"),
                  zt_nsstring(text), sel_registerName("menuItemClicked:"), zt_nsstring(""));
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setSubmenu:"), sub);
  OBJC_MSG(void(*)(id, SEL, id), g_menus[idx], sel_registerName("addItem:"), item);
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
    char em[256], ei[256];
    zt_json_escape(g_menu_refs[tag].menu_id, em, sizeof(em));
    zt_json_escape(g_menu_refs[tag].item_id, ei, sizeof(ei));
    char buf[600];
    snprintf(buf, sizeof(buf),
             "{\"type\":\"menu_event\",\"menu_id\":\"%s\",\"item_id\":\"%s\"}",
             em, ei);
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
  OBJC_MSG(void(*)(id, SEL, id), panel, sel_registerName("setTitle:"), zt_nsstring(m->id));
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setCanChooseFiles:"),
           m->bool_val ? NO : YES);
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setCanChooseDirectories:"),
           m->bool_val ? YES : NO);
  OBJC_MSG(void(*)(id, SEL, BOOL), panel, sel_registerName("setAllowsMultipleSelection:"),
           NO);
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
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setMessageText:"), zt_nsstring(m->id));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setInformativeText:"), zt_nsstring(m->str2));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("addButtonWithTitle:"), zt_nsstring("OK"));
  long resp = (long)OBJC_MSG(long(*)(id, SEL), alert, sel_registerName("runModal"));
  char tmp[32];
  snprintf(tmp, sizeof(tmp), "%ld", resp - 1000); /* NSAlertFirstButtonReturn */
  zt_reply_string(m->req_id, tmp);
}

/* ---- platform ops ---- */

static int dispatch(Msg *m, webview_t w) {
  if (is_window_op(m->type)) {
    handle_window_op(m, w);
    return 1;
  }
  if (strcmp(m->type, "window_get_frame") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd && m->req_id >= 0) zt_reply_frame(m->req_id, zt_wnd_frame(wnd));
    return 1;
  }
  if (strcmp(m->type, "window_get_theme") == 0) {
    id app = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"),
                      sel_registerName("sharedApplication"));
    id appearance = OBJC_MSG(id(*)(id, SEL), app,
                             sel_registerName("effectiveAppearance"));
    id name = appearance
                  ? OBJC_MSG(id(*)(id, SEL), appearance, sel_registerName("name"))
                  : NULL;
    int isDark = name ? OBJC_MSG(BOOL(*)(id, SEL, id), name,
                                 sel_registerName("containsString:"),
                                 zt_nsstring("Dark"))
                      : 0;
    if (m->req_id >= 0) zt_reply_string(m->req_id, isDark ? "dark" : "light");
    return 1;
  }
  if (strcmp(m->type, "window_get_scale_factor") == 0) {
    void *wnd = zt_window_of(w);
    double s = wnd
                   ? OBJC_MSG(double(*)(id, SEL), wnd,
                              sel_registerName("backingScaleFactor"))
                   : 1.0;
    if (m->req_id >= 0) {
      char buf[64];
      snprintf(buf, sizeof(buf), "%g", s);
      zt_reply_string(m->req_id, buf);
    }
    return 1;
  }
  if (strcmp(m->type, "set_ignore_cursor_events") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      OBJC_MSG(void(*)(id, SEL, BOOL), wnd,
               sel_registerName("setIgnoresMouseEvents:"), m->bool_val);
    }
    return 1;
  }
  if (strcmp(m->type, "window_set_position") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) zt_wnd_set_origin(wnd, m->x, m->y);
    return 1;
  }
  if (strcmp(m->type, "set_prevent_close") == 0) {
    g_prevent_close = m->bool_val;
    return 1;
  }
  if (strcmp(m->type, "window_destroy") == 0) {
    webview_terminate(zt_w);
    return 1;
  }
  if (strcmp(m->type, "window_set_bounds") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      /* [window setFrame:NSMakeRect(x,y,w,h) display:YES] */
      ((void(*)(id, SEL, double, double, double, double, BOOL))objc_msgSend)(
          (id)wnd, sel_registerName("setFrame:display:"), (double)m->x,
          (double)m->y, (double)m->width, (double)m->height, YES);
    }
    return 1;
  }
  if (strcmp(m->type, "window_set_min_size") == 0 ||
      strcmp(m->type, "window_set_max_size") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      /* setContent{Min,Max}Size: take NSSize (2 doubles) by value — the
         scalar cast matches the SysV/arm64 float-register ABI. */
      SEL sel = sel_registerName(strcmp(m->type, "window_set_min_size") == 0
                                     ? "setContentMinSize:"
                                     : "setContentMaxSize:");
      ((void(*)(id, SEL, double, double))objc_msgSend)(
          (id)wnd, sel, (double)m->width, (double)m->height);
    }
    return 1;
  }
  if (strcmp(m->type, "set_progress_bar") == 0) {
    dock_set_progress(m->opacity_val);
    return 1;
  }
  if (strcmp(m->type, "set_badge_count") == 0) {
    char buf[32];
    if (m->width > 0) {
      snprintf(buf, sizeof(buf), "%d", m->width);
      dock_set_badge(buf);
    } else {
      dock_set_badge("");
    }
    return 1;
  }
  if (strcmp(m->type, "set_badge_label") == 0) {
    dock_set_badge(m->str2);
    return 1;
  }
  if (strcmp(m->type, "set_background_color") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName("setBackgroundColor:"),
               zt_parse_color(m->str2));
    }
    return 1;
  }
  if (strcmp(m->type, "set_titlebar_style") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      int overlay = strcmp(m->str2, "overlay") == 0;
      int transparent = overlay || strcmp(m->str2, "transparent") == 0;
      OBJC_MSG(void(*)(id, SEL, BOOL), wnd,
               sel_registerName("setTitlebarAppearsTransparent:"), transparent);
      unsigned long mask = wnd_style_mask(wnd);
      wnd_set_style_mask(wnd, overlay ? (mask | NS_FULLSIZECONTENTVIEW_MASK)
                                      : (mask & ~NS_FULLSIZECONTENTVIEW_MASK));
    }
    return 1;
  }
  if (strcmp(m->type, "window_get_state") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd && m->req_id >= 0) {
      long level = (long)OBJC_MSG(long(*)(id, SEL), wnd, sel_registerName("level"));
      char buf[256];
      snprintf(buf, sizeof(buf),
               "{\"maximized\":%s,\"minimized\":%s,\"fullscreen\":%s,"
               "\"always_on_top\":%s,\"visible\":%s,\"resizable\":%s}",
               wnd_bool(wnd, "isZoomed") ? "true" : "false",
               wnd_bool(wnd, "isMiniaturized") ? "true" : "false",
               (wnd_style_mask(wnd) & NS_FULLSCREEN_MASK) ? "true" : "false",
               level != 0 ? "true" : "false",
               wnd_bool(wnd, "isVisible") ? "true" : "false",
               (wnd_style_mask(wnd) & NS_RESIZABLE_MASK) ? "true" : "false");
      zt_reply_query(m->req_id, buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "window_get_title") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd && m->req_id >= 0) {
      id title = OBJC_MSG(id(*)(id, SEL), wnd, sel_registerName("title"));
      const char *cstr = title
                             ? OBJC_MSG(const char *(*)(id, SEL), title,
                                        sel_registerName("UTF8String"))
                             : "";
      zt_reply_string(m->req_id, cstr ? cstr : "");
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "start_resize_dragging") == 0) {
    /* macOS resize-dragging needs an NSEvent tracking loop; not implemented
       (frameless apps can provide CSS resize handles instead). */
    return 1;
  }
  if (strcmp(m->type, "start_dragging") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      /* performWindowDragWithEvent: needs the original mouseDown NSEvent;
         [NSApp currentEvent] is it when the frontend dispatches mid-drag. */
      id app = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"),
                        sel_registerName("sharedApplication"));
      id ev = OBJC_MSG(id(*)(id, SEL), app, sel_registerName("currentEvent"));
      OBJC_MSG(void(*)(id, SEL, id), wnd,
               sel_registerName("performWindowDragWithEvent:"), ev);
    }
    return 1;
  }
  if (strcmp(m->type, "set_cursor") == 0) {
    const char *name = m->str2;
    const char *sel = "arrowCursor"; /* default */
    if (strcmp(name, "pointer") == 0 || strcmp(name, "hand") == 0)
      sel = "pointingHandCursor";
    else if (strcmp(name, "text") == 0) sel = "IBeamCursor";
    else if (strcmp(name, "crosshair") == 0) sel = "crosshairCursor";
    else if (strcmp(name, "move") == 0 || strcmp(name, "all-scroll") == 0)
      sel = "resizeAllCursor";
    else if (strcmp(name, "not-allowed") == 0)
      sel = "operationNotAllowedCursor";
    else if (strcmp(name, "n-resize") == 0 || strcmp(name, "s-resize") == 0)
      sel = "resizeUpDownCursor";
    else if (strcmp(name, "e-resize") == 0 || strcmp(name, "w-resize") == 0)
      sel = "resizeLeftRightCursor";
    else if (strcmp(name, "grab") == 0) sel = "openHandCursor";
    else if (strcmp(name, "grabbing") == 0) sel = "closedHandCursor";
    else if (strcmp(name, "copy") == 0) sel = "dragCopyCursor";
    else if (strcmp(name, "alias") == 0) sel = "dragLinkCursor";
    else if (strcmp(name, "help") == 0) sel = "contextualMenuCursor";
    id cursor = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSCursor"),
                         sel_registerName(sel));
    if (cursor) {
      OBJC_MSG(void(*)(id, SEL), cursor, sel_registerName("set"));
    }
    return 1;
  }
  if (strcmp(m->type, "image_from_bytes") == 0) {
    if (m->req_id >= 0) {
      id data = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSData"),
                         sel_registerName("alloc"));
      data = OBJC_MSG(id(*)(id, SEL, id, unsigned long), data,
                      sel_registerName("initWithBase64EncodedString:options:"),
                      zt_nsstring(m->str2), 0UL);
      id image = NULL;
      if (data) {
        image = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSImage"),
                         sel_registerName("alloc"));
        image = OBJC_MSG(id(*)(id, SEL, id), image,
                         sel_registerName("initWithData:"), data);
      }
      int idn = image ? image_add(image) : -1;
      if (data) OBJC_MSG(void(*)(id, SEL), data, sel_registerName("release"));
      char buf[32];
      snprintf(buf, sizeof(buf), "%d", idn);
      zt_reply_string(m->req_id, buf);
    }
    return 1;
  }
  if (strcmp(m->type, "image_from_path") == 0) {
    if (m->req_id >= 0) {
      id image = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSImage"),
                          sel_registerName("alloc"));
      image = OBJC_MSG(id(*)(id, SEL, id), image,
                       sel_registerName("initWithContentsOfFile:"), zt_nsstring(m->str));
      int idn = image ? image_add(image) : -1;
      char buf[32];
      snprintf(buf, sizeof(buf), "%d", idn);
      zt_reply_string(m->req_id, buf);
    }
    return 1;
  }
  if (strcmp(m->type, "image_destroy") == 0) {
    image_destroy(m->id[0] ? atoi(m->id) : -1);
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
    if (m->id[0]) tray_set_icon_id(atoi(m->id));
    else tray_set_icon(m->str2);
    return 1;
  }
  if (strcmp(m->type, "tray_destroy") == 0) { tray_destroy(); return 1; }

  if (strcmp(m->type, "menu_create") == 0) { menu_create(m->str); return 1; }
  if (strcmp(m->type, "menu_add_item") == 0) { menu_add_item(m->str, m->id, m->str2, m->status, m->bool_val, m->checked); return 1; }
  if (strcmp(m->type, "menu_add_submenu_item") == 0) { menu_add_submenu_item(m->str, m->id, m->str2); return 1; }
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
  install_deep_link_handler();
  return 1;
}

static void relaunch(void) {
  char path[4096];
  uint32_t size = sizeof(path);
  if (_NSGetExecutablePath(path, &size) == 0) {
    pid_t pid = fork();
    if (pid == 0) {
      setsid();
      execl(path, path, "0", (char *)NULL);
      _exit(127);
    }
  }
  webview_terminate(zt_w);
}

const HostPlatformOps zt_platform = { dispatch, init, relaunch };
