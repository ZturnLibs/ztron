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

/* CGWarpMouseCursorPosition is declared via Carbon's CoreGraphics umbrella. */

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

/* ---- No-op completion block (hand-rolled clang Block ABI) ----

 host_macos.c is compiled as plain C (no -fblocks), but a few WebKit APIs
 (e.g. WKWebsiteDataStore removeDataOfTypes:...) require a block object.
 A static *global* block satisfies them: BLOCK_IS_GLOBAL (1<<28) makes
 Block_copy return the block itself and Block_release a no-op, so the
 ObjC runtime is free to copy/release it. */

struct zt_block_desc {
  unsigned long reserved;
  unsigned long block_size;
};

struct zt_block_layout {
  void *isa;
  int flags;
  int reserved;
  void (*invoke)(void *block_self);
  struct zt_block_desc *desc;
};

static void zt_noop_block_invoke(void *block_self) { (void)block_self; }

/* _NSConcreteGlobalBlock comes in via <Block.h> (pulled by the Carbon
 umbrella) declared as `void *[32]`; use the first slot as the isa. */

static struct zt_block_desc zt_noop_block_desc = {
    0, sizeof(struct zt_block_layout)};
static struct zt_block_layout zt_noop_block = {
    &_NSConcreteGlobalBlock[0],
    1 << 28, /* BLOCK_IS_GLOBAL */
    0,
    zt_noop_block_invoke,
    &zt_noop_block_desc,
};

/* ---- UNUserNotificationCenter permission blocks ----

 Completion blocks carrying a result: the ObjC runtime invokes the stored
 function pointer with (block, args...). The pending req_id lives in a
 global (one permission query in flight at a time, guarded by g_perm_req);
 the reply is written from whichever queue UserNotifications calls back on
 (zt_send_line is a single write(2) — safe to interleave with the GUI
 thread for these rare replies). */

static int g_perm_req = -1; /* pending request id, -1 = none */

/* void (^)(BOOL granted, NSError *) — BOOL is `signed char` on arm64. */
static void zt_perm_granted_invoke(void *blk, signed char granted, void *err) {
  (void)blk;
  (void)err;
  int req = g_perm_req;
  g_perm_req = -1;
  if (req >= 0) zt_reply_query(req, granted ? "true" : "false");
}

/* void (^)(UNNotificationSettings *) — authorizationStatus: 0 not yet
 determined, 1 denied, 2 authorized, 3 provisional, 4 ephemeral. */
static void zt_perm_settings_invoke(void *blk, void *settings) {
  (void)blk;
  int req = g_perm_req;
  g_perm_req = -1;
  long status = settings
                    ? OBJC_MSG(long(*)(id, SEL), (id)settings,
                               sel_registerName("authorizationStatus"))
                    : 0;
  if (req >= 0)
    zt_reply_query(req, (status >= 2 && status <= 4) ? "true" : "false");
}

static struct zt_block_layout zt_perm_granted_block = {
    &_NSConcreteGlobalBlock[0],
    1 << 28,
    0,
    (void (*)(void *))zt_perm_granted_invoke,
    &zt_noop_block_desc,
};
static struct zt_block_layout zt_perm_settings_block = {
    &_NSConcreteGlobalBlock[0],
    1 << 28,
    0,
    (void (*)(void *))zt_perm_settings_invoke,
    &zt_noop_block_desc,
};

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

/* NSPoint-sized struct returns (2 doubles) never need stret on either arch
   (x86_64 SSE-struct returns in xmm0/1); NSPoint args pass as 2 doubles. */
typedef struct { double x, y; } ZtPoint;

static ZtPoint zt_mouse_screen(void) {
  return ((ZtPoint(*)(id, SEL))objc_msgSend)((id)objc_getClass("NSEvent"),
                                             sel_registerName("mouseLocation"));
}

static ZtPoint zt_screen_to_base(void *wnd, ZtPoint p) {
  return ((ZtPoint(*)(id, SEL, double, double))objc_msgSend)(
      (id)wnd, sel_registerName("convertScreenToBase:"), p.x, p.y);
}

static ZtPoint zt_base_to_screen(void *wnd, ZtPoint p) {
  return ((ZtPoint(*)(id, SEL, double, double))objc_msgSend)(
      (id)wnd, sel_registerName("convertBaseToScreen:"), p.x, p.y);
}

/* [NSScreen mainScreen] frame (32-byte struct -> arch-specific return). */
static ZtRect zt_main_screen_frame(void) {
  id screen = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSScreen"),
                       sel_registerName("mainScreen"));
  ZtRect r;
#if defined(__aarch64__)
  r = ((ZtRect(*)(id, SEL))objc_msgSend)(screen, sel_registerName("frame"));
#else
  ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
      screen, sel_registerName("frame"), &r);
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

/* Standard base64 encoder (RFC 4648) for binary clipboard replies. */
static void zt_base64(const unsigned char *in, size_t n, char *out) {
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
  if (i + 1 == n) {
    unsigned v = (unsigned)in[i] << 16;
    out[o++] = tbl[(v >> 18) & 63];
    out[o++] = tbl[(v >> 12) & 63];
    out[o++] = '=';
    out[o++] = '=';
  } else if (i + 2 == n) {
    unsigned v = (unsigned)in[i] << 16 | (unsigned)in[i + 1] << 8;
    out[o++] = tbl[(v >> 18) & 63];
    out[o++] = tbl[(v >> 12) & 63];
    out[o++] = tbl[(v >> 6) & 63];
    out[o++] = '=';
  }
  out[o] = 0;
}

/* PNG-encodes an NSImage (TIFF -> NSBitmapImageRep -> PNG). Every helper
 here returns an autoreleased object — the caller must NOT release it. */
static id zt_png_of_image(id ns_image) {
  if (!ns_image) return NULL;
  id tiff = OBJC_MSG(id(*)(id, SEL), ns_image,
                     sel_registerName("TIFFRepresentation"));
  if (!tiff) return NULL;
  id rep = OBJC_MSG(id(*)(id, SEL, id), (id)objc_getClass("NSBitmapImageRep"),
                    sel_registerName("imageRepWithData:"), tiff);
  if (!rep) return NULL;
  id empty = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSDictionary"),
                      sel_registerName("dictionary"));
  return OBJC_MSG(id(*)(id, SEL, long, id), rep,
                  sel_registerName("representationUsingType:properties:"),
                  4L /* NSPNGFileType */, empty);
}

/* ---- notifications (NSUserNotificationCenter) ---- */

/* UNUserNotificationCenter only works inside a real on-disk .app bundle
 (its bundleProxy lookup throws NSInternalInconsistencyException for bare
 binaries, even with an embedded __info_plist). Dev runs degrade to no-op
 sends / denied permissions; packaged apps get the full UN behavior. */
static int zt_has_app_bundle(void) {
  id bundle = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSBundle"),
                       sel_registerName("mainBundle"));
  if (!bundle) return 0;
  id url = OBJC_MSG(id(*)(id, SEL), bundle, sel_registerName("bundleURL"));
  if (!url) return 0;
  const char *path = OBJC_MSG(const char *(*)(id, SEL), url,
                              sel_registerName("fileSystemRepresentation"));
  if (!path) return 0;
  size_t n = strlen(path);
  return n > 4 && strcmp(path + n - 4, ".app") == 0;
}

static void notification_send(const char *title, const char *body) {
  /* UNUserNotificationCenter (10.14+). NSUserNotificationCenter was REMOVED
     in macOS 11 — the old path silently delivered nothing on modern
     systems, so this was rewritten on the supported API. */
  id cls = (id)objc_getClass("UNUserNotificationCenter");
  if (!cls || !zt_has_app_bundle()) return;
  id center =
      OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("currentNotificationCenter"));
  if (!center) return;
  id content = OBJC_MSG(id(*)(id, SEL),
                        (id)objc_getClass("UNMutableNotificationContent"),
                        sel_registerName("new"));
  if (!content) return;
  OBJC_MSG(void(*)(id, SEL, id), content, sel_registerName("setTitle:"),
           zt_nsstring(title));
  OBJC_MSG(void(*)(id, SEL, id), content, sel_registerName("setBody:"),
           zt_nsstring(body));
  id req = ((id(*)(id, SEL, id, id, id))objc_msgSend)(
      (id)objc_getClass("UNNotificationRequest"),
      sel_registerName("requestWithIdentifier:content:trigger:"),
      zt_nsstring("ztron-notification"), content, (id)0);
  if (req) {
    ((void(*)(id, SEL, id, id))objc_msgSend)(
        center, sel_registerName("addNotificationRequest:withCompletionHandler:"),
        req, (id)&zt_noop_block);
  }
  OBJC_MSG(void(*)(id, SEL), content, sel_registerName("release"));
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

static int shortcut_is_registered(const char *name) {
  for (int i = 0; i < g_hotkey_count; i++) {
    if (strcmp(g_hotkeys[i].name, name) == 0) return 1;
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
      "maximize",         "unmaximize",     "is_enabled",
      "set_focusable",    "set_cursor_visible",
      "set_visible_on_all_workspaces", "set_simple_fullscreen",
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
  } else if (strcmp(m->type, "maximize") == 0) {
    if (!wnd_bool(wnd, "isZoomed")) wnd_void(wnd, "zoom:");
  } else if (strcmp(m->type, "unmaximize") == 0) {
    if (wnd_bool(wnd, "isZoomed")) wnd_void(wnd, "zoom:");
  } else if (strcmp(m->type, "is_enabled") == 0) {
    /* NSWindow has no enabled state; always interactive on macOS. */
    result = 1;
  } else if (strcmp(m->type, "set_focusable") == 0) {
    /* NSNonactivatingPanelMask = 1<<7: window won't activate the app. */
    unsigned long mask = wnd_style_mask(wnd);
    wnd_set_style_mask(wnd, m->bool_val ? (mask & ~(1UL << 7))
                                        : (mask | (1UL << 7)));
  } else if (strcmp(m->type, "set_cursor_visible") == 0) {
    static int g_cursor_hidden = 0;
    id cls = (id)objc_getClass("NSCursor");
    if (m->bool_val && g_cursor_hidden) {
      OBJC_MSG(void(*)(id, SEL), cls, sel_registerName("unhide"));
      g_cursor_hidden = 0;
    } else if (!m->bool_val && !g_cursor_hidden) {
      OBJC_MSG(void(*)(id, SEL), cls, sel_registerName("hide"));
      g_cursor_hidden = 1;
    }
  } else if (strcmp(m->type, "set_visible_on_all_workspaces") == 0) {
    /* CanJoinAllSpaces = 1<<0, FullScreenAuxiliary = 1<<9. */
    unsigned long cb = (unsigned long)OBJC_MSG(
        unsigned long(*)(id, SEL), wnd, sel_registerName("collectionBehavior"));
    const unsigned long bits = (1UL << 0) | (1UL << 9);
    cb = m->bool_val ? (cb | bits) : (cb & ~bits);
    OBJC_MSG(void(*)(id, SEL, unsigned long), wnd,
             sel_registerName("setCollectionBehavior:"), cb);
  } else if (strcmp(m->type, "set_simple_fullscreen") == 0) {
    static ZtRect g_simple_prev = {0, 0, 0, 0};
    static int g_simple_on = 0;
    if (m->bool_val && !g_simple_on) {
      g_simple_prev = zt_wnd_frame(wnd);
      g_simple_on = 1;
      unsigned long mask = wnd_style_mask(wnd);
      wnd_set_style_mask(
          wnd, mask & ~((1UL << 0) | (1UL << 1) | (1UL << 2) | (1UL << 3)));
      ZtRect f = zt_main_screen_frame();
      ((void(*)(id, SEL, double, double, double, double, BOOL))objc_msgSend)(
          (id)wnd, sel_registerName("setFrame:display:"), f.x, f.y, f.width,
          f.height, YES);
    } else if (!m->bool_val && g_simple_on) {
      g_simple_on = 0;
      unsigned long mask = wnd_style_mask(wnd);
      wnd_set_style_mask(
          wnd, mask | ((1UL << 0) | (1UL << 1) | (1UL << 2) | (1UL << 3)));
      ZtRect f = g_simple_prev;
      ((void(*)(id, SEL, double, double, double, double, BOOL))objc_msgSend)(
          (id)wnd, sel_registerName("setFrame:display:"), f.x, f.y, f.width,
          f.height, YES);
    }
  }

  if (m->req_id >= 0) {
    zt_reply_query(m->req_id, result ? "true" : "false");
  }
}

/* ---- window events (NSWindow delegate) ---- */

/* Per-window prevent-close flags (multi-window; "main" + runtime labels). */
#define ZT_MAX_PREVENT 8
static struct {
  char label[64];
  int on;
} g_prevent_map[ZT_MAX_PREVENT];

static int prevent_close_of(const char *label) {
  for (int i = 0; i < ZT_MAX_PREVENT; i++) {
    if (g_prevent_map[i].label[0] && strcmp(g_prevent_map[i].label, label) == 0)
      return g_prevent_map[i].on;
  }
  return 0;
}

static void set_prevent_close_of(const char *label, int on) {
  int slot = -1;
  for (int i = 0; i < ZT_MAX_PREVENT; i++) {
    if (g_prevent_map[i].label[0] && strcmp(g_prevent_map[i].label, label) == 0) {
      slot = i;
      break;
    }
    if (slot < 0 && !g_prevent_map[i].label[0]) slot = i;
  }
  if (slot < 0) return;
  snprintf(g_prevent_map[slot].label, sizeof(g_prevent_map[slot].label), "%s",
           label);
  g_prevent_map[slot].on = on;
}

/* The window of a delegate notification ([note object]). */
static void *wnd_of_note(id n) {
  return OBJC_MSG(id(*)(id, SEL), n, sel_registerName("object"));
}

static void emit_window_event_labeled(const char *label, const char *event) {
  char buf[320];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\"}",
           label, event);
  zt_send_line(buf);
}

/* Forwards a delegate notification to the delegate we replaced (the
   engine's WebviewNSWindowDelegate) — replacing it outright starves the
   engine of windowWillClose, and its destructor then re-closes/releases an
   already-closed window (over-release → delayed crash). */
static void fwd_to_orig(id self, SEL cmd, id note) {
  id orig = objc_getAssociatedObject(self, "orig");
  if (orig && class_respondsToSelector(object_getClass(orig), cmd)) {
    ((void(*)(id, SEL, id))objc_msgSend)(orig, cmd, note);
  }
}

static void zt_evt_resize(id s, SEL c, id n) {
  fwd_to_orig(s, c, n);
  emit_window_event_labeled(zt_label_for_window(wnd_of_note(n)), "resize");
}
static void zt_evt_move(id s, SEL c, id n) {
  fwd_to_orig(s, c, n);
  emit_window_event_labeled(zt_label_for_window(wnd_of_note(n)), "move");
}
static void zt_evt_focus(id s, SEL c, id n) {
  fwd_to_orig(s, c, n);
  emit_window_event_labeled(zt_label_for_window(wnd_of_note(n)), "focus");
}
static void zt_evt_blur(id s, SEL c, id n) {
  fwd_to_orig(s, c, n);
  emit_window_event_labeled(zt_label_for_window(wnd_of_note(n)), "blur");
}
static void zt_evt_scale_change(id s, SEL c, id n) {
  fwd_to_orig(s, c, n);
  void *wnd = wnd_of_note(n);
  const char *label = zt_label_for_window(wnd);
  double scale = wnd ? (double)OBJC_MSG(double(*)(id, SEL), wnd,
                                       sel_registerName("backingScaleFactor"))
                     : 1.0;
  ZtRect f = wnd ? zt_wnd_frame(wnd) : (ZtRect){0, 0, 0, 0};
  char buf[384];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"scale_change\","
           "\"scale\":%g,\"width\":%g,\"height\":%g}",
           label, scale, f.width * scale, f.height * scale);
  zt_send_line(buf);
}

/* Deferred engine teardown for runtime-created windows (GUI thread). */
static void destroy_later(webview_t w, void *arg);
static void zt_evt_close(id s, SEL c, id n) {
  /* Resolve the label BEFORE forwarding: the engine's windowWillClose
     handler nulls its m_window (native handle becomes NULL), which would
     break the registry lookup — observed as every close resolving to
     "main" and registry entries never being cleaned. */
  void *wnd = wnd_of_note(n);
  const char *label = zt_label_for_window(wnd);
  webview_t closing_w =
      strcmp(label, "main") != 0 ? zt_webview(label) : NULL;
  fwd_to_orig(s, c, n);
  emit_window_event_labeled(label, "close");
  /* Runtime-created windows leave the registry when they close so stale
     webview_t handles are not routed to. Destroy is deferred to the main
     queue (destroying inside windowWillClose would reenter the run loop). */
  if (closing_w) {
    zt_remove_webview_label(label);
    webview_dispatch(closing_w, destroy_later, (void *)closing_w);
  }
}

/* Deferred engine teardown for runtime-created windows (GUI thread). */
static void destroy_later(webview_t w, void *arg) {
  (void)arg;
  webview_destroy(w);
}

static BOOL zt_should_close(id s, SEL c, id n) {
  /* `n` is the SENDER (the window itself) for windowShouldClose:, unlike
     the did/will notifications which pass NSNotification. */
  void *wnd = (void *)n;
  if (class_respondsToSelector(object_getClass(n),
                               sel_registerName("object"))) {
    wnd = wnd_of_note(n);
  }
  const char *label = zt_label_for_window(wnd);
  if (prevent_close_of(label)) {
    emit_window_event_labeled(label, "close"); /* -> tauri://close-requested */
    return NO;
  }
  /* The engine delegate does not implement windowShouldClose:, but forward
     for correctness if it ever does. */
  id orig = objc_getAssociatedObject(s, "orig");
  if (orig && class_respondsToSelector(object_getClass(orig), c)) {
    return ((BOOL(*)(id, SEL, id))objc_msgSend)(orig, c, n);
  }
  return YES;
}

static void install_window_delegate_on(void *wnd); /* defined below */

/* ---- file drag & drop (WKWebView isa-swizzle, wry-style) ----

 A dynamic subclass of the webview's real class (registered once) gains
 the NSDraggingDestination methods; object_setClass swaps the instance
 into it (ivars untouched). Per-instance state — window label + enabled
 flag — travels as associated objects. NSDragOperation = unsigned long;
 BOOL = signed char on arm64. */

static Class g_drop_cls = NULL;

static const char *drop_label(id self) {
  id s = objc_getAssociatedObject(self, "drop_label");
  return s
      ? OBJC_MSG(const char *(*)(id, SEL), s, sel_registerName("UTF8String"))
      : "main";
}

static int drop_enabled(id self) {
  id n = objc_getAssociatedObject(self, "drop_enabled");
  return n ? OBJC_MSG(BOOL(*)(id, SEL), n, sel_registerName("boolValue"))
           : 1; /* enabled unless explicitly disabled */
}

/* Appends the JSON array of file paths from the drag's pasteboard.
   Returns 0 when the drag carries no file list. */
static int drop_paths_json(id info, char *buf, size_t bufsz) {
  id pb =
      OBJC_MSG(id(*)(id, SEL), info, sel_registerName("draggingPasteboard"));
  if (!pb) return 0;
  id list = OBJC_MSG(id(*)(id, SEL, id), pb,
                     sel_registerName("propertyListForType:"),
                     zt_nsstring("NSFilenamesPboardType"));
  if (!list) return 0;
  unsigned long n =
      OBJC_MSG(unsigned long (*)(id, SEL), list, sel_registerName("count"));
  size_t off = 0;
  buf[off++] = '[';
  int wrote = 0;
  for (unsigned long i = 0; i < n; i++) {
    id p = OBJC_MSG(id(*)(id, SEL, unsigned long), list,
                    sel_registerName("objectAtIndex:"), i);
    if (!p) continue;
    const char *cs =
        OBJC_MSG(const char *(*)(id, SEL), p, sel_registerName("UTF8String"));
    if (!cs) continue;
    char esc[1024];
    zt_json_escape(cs, esc, sizeof(esc));
    int k = snprintf(buf + off, bufsz - off, "%s\"%s\"",
                     wrote ? "," : "", esc);
    if (k < 0 || (size_t)k >= bufsz - off) break;
    off += (size_t)k;
    wrote = 1;
  }
  buf[off++] = ']';
  buf[off] = 0;
  return wrote;
}

/* draggingLocation is view-local, bottom-left origin; flip to top-left and
   scale to physical pixels (Tauri's DragDropEvent positions are physical). */
static void drop_position_json(id self, id info, char *buf, size_t bufsz) {
  ZtPoint p = ((ZtPoint(*)(id, SEL))objc_msgSend)(
      info, sel_registerName("draggingLocation"));
  ZtRect b = ((ZtRect(*)(id, SEL))objc_msgSend)(self, sel_registerName("bounds"));
  id win = OBJC_MSG(id(*)(id, SEL), self, sel_registerName("window"));
  double scale =
      win ? OBJC_MSG(double(*)(id, SEL), win, sel_registerName("backingScaleFactor"))
          : 1.0;
  snprintf(buf, bufsz, "\"x\":%.0f,\"y\":%.0f", p.x * scale,
           (b.height - p.y) * scale);
}

static void drop_emit(id self, id info, const char *event, int with_paths) {
  if (!drop_enabled(self)) return;
  char pos[64];
  drop_position_json(self, info, pos, sizeof(pos));
  char buf[8192];
  if (with_paths) {
    char paths[7680];
    if (!drop_paths_json(info, paths, sizeof(paths))) return;
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\","
             "\"paths\":%s,%s}",
             drop_label(self), event, paths, pos);
  } else {
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"%s\",%s}",
             drop_label(self), event, pos);
  }
  zt_send_line(buf);
}

static unsigned long drop_entered(id self, SEL _cmd, id info) {
  (void)_cmd;
  drop_emit(self, info, "drag_enter", 1);
  return drop_enabled(self) ? 2 /* NSDragOperationGeneric */ : 0;
}

static unsigned long drop_updated(id self, SEL _cmd, id info) {
  (void)_cmd;
  drop_emit(self, info, "drag_over", 0);
  return drop_enabled(self) ? 2 : 0;
}

static void drop_exited(id self, SEL _cmd, id info) {
  (void)_cmd;
  (void)info;
  if (!drop_enabled(self)) return;
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"drag_leave\"}",
           drop_label(self));
  zt_send_line(buf);
}

static BOOL drop_prepare(id self, SEL _cmd, id info) {
  (void)_cmd;
  (void)info;
  return drop_enabled(self) ? YES : NO;
}

static BOOL drop_perform(id self, SEL _cmd, id info) {
  (void)_cmd;
  drop_emit(self, info, "drag_drop", 1);
  return drop_enabled(self) ? YES : NO;
}

static void install_drop_target_on(id wk, void *wnd) {
  /* The class itself (with the drag IMPs) is registered in init() so the
     vendored WKWebView_alloc() instantiates it from birth — isa-swizzling
     here would corrupt WKWebView's internal KVO (see the alloc patch).
     At attach time we only bind the window label + register the FILE
     pasteboard type so file drags route to this view (deepest registered
     view wins the destination pick). */
  if (object_getClass(wk) != g_drop_cls) return; /* subclass not active */
  objc_setAssociatedObject(wk, "drop_label",
                           zt_nsstring(zt_label_for_window(wnd)),
                           OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  id arr = OBJC_MSG(id(*)(id, SEL, id), (id)objc_getClass("NSArray"),
                    sel_registerName("arrayWithObject:"),
                    zt_nsstring("NSFilenamesPboardType"));
  OBJC_MSG(void(*)(id, SEL, id), wk, sel_registerName("registerForDraggedTypes:"),
           arr);
}

/** Registers ZtronWKWebViewSubclass (subclass of WKWebView with the
    NSDraggingDestination methods) BEFORE any webview is created; the
    vendored WKWebView_alloc() then instantiates it instead of the stock
    class. Runs as a dyld constructor: the host's main webview is created
    before zt_platform.init(), so init() is too late for it. Harmless when
    drag & drop is later disabled per window. */
__attribute__((constructor)) static void register_drop_class(void) {
  if (g_drop_cls) return;
  g_drop_cls = objc_allocateClassPair((Class)objc_getClass("WKWebView"),
                                      "ZtronWKWebViewSubclass", 0);
  class_addMethod(g_drop_cls, sel_registerName("draggingEntered:"),
                  (IMP)drop_entered, "Q@:@");
  class_addMethod(g_drop_cls, sel_registerName("draggingUpdated:"),
                  (IMP)drop_updated, "Q@:@");
  class_addMethod(g_drop_cls, sel_registerName("draggingExited:"),
                  (IMP)drop_exited, "v@:@");
  class_addMethod(g_drop_cls, sel_registerName("prepareForDragOperation:"),
                  (IMP)drop_prepare, "B@:@");
  class_addMethod(g_drop_cls, sel_registerName("performDragOperation:"),
                  (IMP)drop_perform, "B@:@");
  objc_registerClassPair(g_drop_cls);
}

static void install_window_delegate_on(void *wnd) {
  if (!wnd) return;
  Class cls = (Class)objc_getClass("ZtronWindowDelegate");
  if (!cls) {
    cls = objc_allocateClassPair(
        (Class)objc_getClass("NSObject"), "ZtronWindowDelegate", 0);
    class_addMethod(cls, sel_registerName("windowDidResize:"), (IMP)zt_evt_resize, "v@:@");
    class_addMethod(cls, sel_registerName("windowDidMove:"), (IMP)zt_evt_move, "v@:@");
    class_addMethod(cls, sel_registerName("windowDidBecomeKey:"), (IMP)zt_evt_focus, "v@:@");
    class_addMethod(cls, sel_registerName("windowDidResignKey:"), (IMP)zt_evt_blur, "v@:@");
    class_addMethod(cls, sel_registerName("windowDidChangeBackingProperties:"), (IMP)zt_evt_scale_change, "v@:@");
    class_addMethod(cls, sel_registerName("windowWillClose:"), (IMP)zt_evt_close, "v@:@");
    class_addMethod(cls, sel_registerName("windowShouldClose:"), (IMP)zt_should_close, "B@:@");
    objc_registerClassPair(cls);
  }
  id delegate = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("new"));
  /* Chain: remember the delegate we are replacing (the engine's) so its
     notifications still fire — see fwd_to_orig. */
  id prev = OBJC_MSG(id(*)(id, SEL), wnd, sel_registerName("delegate"));
  objc_setAssociatedObject(delegate, "orig", prev, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  OBJC_MSG(void(*)(id, SEL, id), wnd, sel_registerName("setDelegate:"), delegate);
}

static void install_window_delegate(void) {
  install_window_delegate_on(zt_window());
}

/* Attaches platform handlers to a runtime-created webview (multi-window). */
static int attach_webview_impl(webview_t w) {
  void *wnd = w ? webview_get_native_handle(
                     w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW)
                : NULL;
  if (!wnd) return 0;
  install_window_delegate_on(wnd);
  /* File drag & drop: the ZtronWKWebViewSubclass (with the
     NSDraggingDestination methods) was registered by the dyld constructor
     and instantiated from birth by the vendored WKWebView_alloc(). Here
     we bind the window label + register the FILE pasteboard type. The drag
     methods claim file drags BEFORE WebKit's HTML5 handling — the tradeoff
     Tauri makes when its drag-drop handler is enabled; pages needing HTML5
     file DnD disable it with set_file_drop_enabled=0. */
  {
    id wk = w ? (id)webview_get_native_handle(
                   w, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER)
             : NULL;
    if (wk) install_drop_target_on(wk, wnd);
  }
  return 1;
}

/* ---- system theme change (AppleInterfaceThemeChangedNotification) ---- */

static int zt_theme_is_dark(void) {
  id app = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSApplication"),
                    sel_registerName("sharedApplication"));
  id appearance = OBJC_MSG(id(*)(id, SEL), app,
                           sel_registerName("effectiveAppearance"));
  if (!appearance) return 0;
  id name = OBJC_MSG(id(*)(id, SEL), appearance, sel_registerName("name"));
  return name ? OBJC_MSG(BOOL(*)(id, SEL, id), name,
                         sel_registerName("containsString:"),
                         zt_nsstring("Dark"))
              : 0;
}

/* Emits theme_change for the main window + every registered webview
   (theme is app-wide on macOS; Tauri emits per-window). */
static void emit_theme_change_all(void) {
  const char *t = zt_theme_is_dark() ? "dark" : "light";
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"main\",\"event\":\"theme_change\",\"theme\":\"%s\"}",
           t);
  zt_send_line(buf);
  for (int i = 0; i < zt_webview_count(); i++) {
    snprintf(buf, sizeof(buf),
             "{\"type\":\"window_event\",\"label\":\"%s\",\"event\":\"theme_change\",\"theme\":\"%s\"}",
             zt_webview_label_at(i), t);
    zt_send_line(buf);
  }
}

static void zt_theme_changed_cb(id note) {
  (void)note;
  emit_theme_change_all();
}

/* defined below (tray section) */
static id g_tray_target;

static void install_theme_observer(void) {
  id center = OBJC_MSG(id(*)(id, SEL),
                       (id)objc_getClass("NSDistributedNotificationCenter"),
                       sel_registerName("defaultCenter"));
  if (!center) return;
  SEL sel = sel_registerName("addObserver:selector:name:object:");
  ((void(*)(id, SEL, id, SEL, id, id))objc_msgSend)(
      center, sel, g_tray_target, sel_registerName("ztThemeChanged:"),
      zt_nsstring("AppleInterfaceThemeChangedNotification"), (id)NULL);
}

/* ---- monitors (NSScreen) ---- */

/* Serializes one NSScreen; appends to `out` (heap, grown by doubling). */
static void zt_monitor_json(id screen, char **out, size_t *len, size_t *cap) {
  ZtRect f;
#if defined(__aarch64__)
  f = ((ZtRect(*)(id, SEL))objc_msgSend)(screen, sel_registerName("frame"));
#else
  ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
      screen, sel_registerName("frame"), &f);
#endif
  ZtRect vf;
#if defined(__aarch64__)
  vf = ((ZtRect(*)(id, SEL))objc_msgSend)(screen, sel_registerName("visibleFrame"));
#else
  ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
      screen, sel_registerName("visibleFrame"), &vf);
#endif
  double scale = OBJC_MSG(double(*)(id, SEL), screen,
                          sel_registerName("backingScaleFactor"));
  char namebuf[128];
  namebuf[0] = '\0';
  if (1 /* localizedName available 10.15+ */) {
    id name = OBJC_MSG(id(*)(id, SEL), screen,
                      sel_registerName("localizedName"));
    if (name) {
      /* UTF8String copy */
      const char *u = (const char *)OBJC_MSG(const char *(*)(id, SEL), name,
                                             sel_registerName("UTF8String"));
      if (u) snprintf(namebuf, sizeof(namebuf), "%s", u);
    }
  }
  char esc[300];
  zt_json_escape(namebuf, esc, sizeof(esc));
  char one[512];
  snprintf(one, sizeof(one),
           "{\"name\":\"%s\",\"position\":{\"x\":%g,\"y\":%g},"
           "\"size\":{\"width\":%g,\"height\":%g},"
           "\"workArea\":{\"x\":%g,\"y\":%g,\"width\":%g,\"height\":%g},"
           "\"scaleFactor\":%g}",
           esc, f.x * scale, f.y * scale, f.width * scale, f.height * scale,
           vf.x * scale, vf.y * scale, vf.width * scale, vf.height * scale,
           scale);
  size_t need = strlen(one);
  while (*len + need + 2 > *cap) {
    *cap = *cap ? *cap * 2 : 1024;
    *out = realloc(*out, *cap);
  }
  memcpy(*out + *len, one, need);
  *len += need;
}

/* mode: 0 all, 1 primary, 2 window's screen, 3 containing point (x,y). */
static void monitors_reply(int req_id, int mode, void *wnd, double x, double y) {
  id cls = (id)objc_getClass("NSScreen");
  id list = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("screens"));
  unsigned long count =
      (unsigned long)OBJC_MSG(unsigned long(*)(id, SEL), list,
                              sel_registerName("count"));
  char *out = NULL;
  size_t len = 0, cap = 0;
  out = malloc(1024);
  cap = 1024;
  out[len++] = '[';
  for (unsigned long i = 0; i < count; i++) {
    id screen = OBJC_MSG(id(*)(id, SEL, unsigned long), list,
                         sel_registerName("objectAtIndex:"), i);
    if (mode == 1) {
      id main = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("mainScreen"));
      if (screen != main) continue;
    } else if (mode == 2 && wnd) {
      id cur = OBJC_MSG(id(*)(id, SEL), wnd, sel_registerName("screen"));
      if (screen != cur) continue;
    } else if (mode == 3) {
      ZtRect f;
#if defined(__aarch64__)
      f = ((ZtRect(*)(id, SEL))objc_msgSend)(screen,
                                             sel_registerName("frame"));
#else
      ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
          screen, sel_registerName("frame"), &f);
#endif
      /* incoming x/y are top-left desktop coords (Cocoa points); Cocoa
         screen coords are bottom-left: flip against the main screen. */
      id main = OBJC_MSG(id(*)(id, SEL), cls, sel_registerName("mainScreen"));
      ZtRect mf;
#if defined(__aarch64__)
      mf = ((ZtRect(*)(id, SEL))objc_msgSend)(main,
                                              sel_registerName("frame"));
#else
      ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
          main, sel_registerName("frame"), &mf);
#endif
      double flippedY = mf.height - y;
      if (x < f.x || x >= f.x + f.width || flippedY < f.y ||
          flippedY >= f.y + f.height)
        continue;
    }
    if (len > 1) out[len++] = ',';
    zt_monitor_json(screen, &out, &len, &cap);
  }
  while (len + 2 > cap) {
    cap *= 2;
    out = realloc(out, cap);
  }
  out[len++] = ']';
  out[len] = '\0';
  char head[128];
  snprintf(head, sizeof(head),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":", req_id);
  char *full = malloc(strlen(head) + len + 2);
  sprintf(full, "%s%s}", head, out);
  zt_send_line(full);
  free(full);
  free(out);
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
/* NSStatusItem has a settable `visible` property (10.12+). */
static void tray_set_visible(int visible) {
  if (g_status_item) {
    OBJC_MSG(void(*)(id, SEL, BOOL), g_status_item,
             sel_registerName("setVisible:"), visible ? 1 : 0);
  }
}
/* Marks the CURRENT button image as a template (adapts to light/dark bars).
   Must run after setIcon (the image is copied per call). */
static void tray_set_icon_template(int on) {
  if (!g_status_item) return;
  id button = OBJC_MSG(id(*)(id, SEL), g_status_item, sel_registerName("button"));
  id image = OBJC_MSG(id(*)(id, SEL), button, sel_registerName("image"));
  if (!image) return;
  /* setImage: copies the image? No — the button retains the SAME instance,
     so setTemplate: on it persists until the next setImage:. */
  OBJC_MSG(void(*)(id, SEL, BOOL), image, sel_registerName("setTemplate:"),
           on ? 1 : 0);
  /* refresh so the template rendering takes effect immediately */
  OBJC_MSG(void(*)(id, SEL, BOOL), button, sel_registerName("setNeedsDisplay:"), 1);
}
static void install_tray_target(void) {
  Class cls = objc_allocateClassPair((Class)objc_getClass("NSObject"), "ZtronTrayTarget", 0);
  class_addMethod(cls, sel_registerName("trayClick:"), (IMP)zt_tray_click, "v@:@");
  class_addMethod(cls, sel_registerName("ztThemeChanged:"), (IMP)zt_theme_changed_cb, "v@:@");
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
/* ---- predefined items (system behaviors) ----

   forward decls (defined later in this file) */
static id menu_find_item(const char *menu_id, const char *item_id);

/* map: kind -> (selector, keyEquivalent, modifierMask).
   NOTE: there is NO +[NSMenuItem standardItem:] on macOS (verified: raises
   NSInvalidArgumentException) — items are built with initWithTitle +
   first-responder selectors + the conventional key equivalents. */
static int predefined_map(const char *kind, const char **sel, const char **key,
                          unsigned long *mask) {
  *sel = NULL;
  *key = "";
  *mask = 0;
  const unsigned long cmd = 1UL << 20;      /* NSEventModifierFlagCommand */
  const unsigned long shift = 1UL << 17;    /* NSEventModifierFlagShift */
  if (!kind || !kind[0]) return 0;
  if (strcmp(kind, "copy") == 0) { *sel = "copy:"; *key = "c"; *mask = cmd; return 1; }
  if (strcmp(kind, "cut") == 0) { *sel = "cut:"; *key = "x"; *mask = cmd; return 1; }
  if (strcmp(kind, "paste") == 0) { *sel = "paste:"; *key = "v"; *mask = cmd; return 1; }
  if (strcmp(kind, "selectAll") == 0) { *sel = "selectAll:"; *key = "a"; *mask = cmd; return 1; }
  if (strcmp(kind, "undo") == 0) { *sel = "undo:"; *key = "z"; *mask = cmd; return 1; }
  if (strcmp(kind, "redo") == 0) { *sel = "redo:"; *key = "Z"; *mask = cmd | shift; return 1; }
  if (strcmp(kind, "minimize") == 0) { *sel = "performMiniaturize:"; *key = "m"; *mask = cmd; return 1; }
  if (strcmp(kind, "maximize") == 0) { *sel = "performZoom:"; return 1; }
  if (strcmp(kind, "fullscreen") == 0) { *sel = "toggleFullScreen:"; *key = "f"; *mask = cmd | shift; return 1; }
  if (strcmp(kind, "hide") == 0) { *sel = "hide:"; *key = "h"; *mask = cmd; return 1; }
  if (strcmp(kind, "hideOthers") == 0) { *sel = "hideOtherApplications:"; *key = "h"; *mask = cmd | shift; return 1; }
  if (strcmp(kind, "showAll") == 0) { *sel = "unhideAllApplications:"; return 1; }
  if (strcmp(kind, "closeWindow") == 0) { *sel = "performClose:"; *key = "w"; *mask = cmd; return 1; }
  if (strcmp(kind, "quit") == 0) { *sel = "terminate:"; *key = "q"; *mask = cmd; return 1; }
  if (strcmp(kind, "bringAllToFront") == 0) { *sel = "arrangeInFront:"; return 1; }
  if (strcmp(kind, "about") == 0) { *sel = "orderFrontStandardAboutPanel:"; return 1; }
  return 0; /* separator handled by menu_add_item; services unsupported */
}

/* Adds a predefined (system-behavior) item to a registered menu. */
static void menu_add_predefined(const char *menu_id, const char *item_id,
                                const char *kind, const char *text,
                                int enabled) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  const char *sel_name;
  const char *key;
  unsigned long mask;
  if (!predefined_map(kind, &sel_name, &key, &mask)) return;
  id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"),
                     sel_registerName("alloc"));
  item = OBJC_MSG(id(*)(id, SEL, id, SEL, id), item,
                  sel_registerName("initWithTitle:action:keyEquivalent:"),
                  zt_nsstring(text), sel_registerName(sel_name),
                  zt_nsstring(key));
  if (!item) return;
  /* nil target -> first responder: system routes copy:/terminate:/… to the
     right object (key window, NSApp, …) at click time. */
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTarget:"),
           (id)NULL);
  if (mask)
    OBJC_MSG(void(*)(id, SEL, unsigned long), item,
             sel_registerName("setKeyEquivalentModifierMask:"), mask);
  OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"),
           enabled);
  if (g_menu_ref_count < MAX_MENU_REFS) {
    int tag = g_menu_ref_count;
    strncpy(g_menu_refs[tag].menu_id, menu_id,
            sizeof(g_menu_refs[tag].menu_id) - 1);
    strncpy(g_menu_refs[tag].item_id, item_id,
            sizeof(g_menu_refs[tag].item_id) - 1);
    g_menu_ref_count++;
    OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setTag:"), tag);
  }
  OBJC_MSG(void(*)(id, SEL, id), g_menus[idx], sel_registerName("addItem:"),
           item);
}

/* Inserts an item at an index within the menu. */
static void menu_insert_item(const char *menu_id, const char *item_id,
                             const char *text, int enabled, int checked,
                             long at) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  if (g_menu_ref_count >= MAX_MENU_REFS) return;
  if (getenv("ZT_TRACE"))
    fprintf(stderr, "[zt] insert_item at=%ld into=%s\n", at, menu_id);
  id pool = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSAutoreleasePool"),
                     sel_registerName("new"));
  id item = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSMenuItem"),
                     sel_registerName("alloc"));
  item = OBJC_MSG(id(*)(id, SEL, id, SEL, id), item,
                  sel_registerName("initWithTitle:action:keyEquivalent:"),
                  zt_nsstring(text), sel_registerName("menuItemClicked:"),
                  zt_nsstring(""));
  int tag = g_menu_ref_count;
  strncpy(g_menu_refs[tag].menu_id, menu_id,
          sizeof(g_menu_refs[tag].menu_id) - 1);
  strncpy(g_menu_refs[tag].item_id, item_id,
          sizeof(g_menu_refs[tag].item_id) - 1);
  g_menu_ref_count++;
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setTarget:"),
           g_menu_target);
  OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setTag:"), tag);
  OBJC_MSG(void(*)(id, SEL, BOOL), item, sel_registerName("setEnabled:"),
           enabled);
  if (checked >= 0)
    OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setState:"),
             checked ? 1 : 0);
  /* insertItem:atIndex: takes NSUInteger; menu retains the item. */
  ((void(*)(id, SEL, id, unsigned long))objc_msgSend)(
      (id)g_menus[idx], sel_registerName("insertItem:atIndex:"), item,
      (unsigned long)at);
  OBJC_MSG(void(*)(id, SEL), pool, sel_registerName("release"));
}

/* Removes an item (by ref lookup) from its menu. */
static void menu_remove_item(const char *menu_id, const char *item_id) {
  int idx = menu_index(menu_id);
  id item = menu_find_item(menu_id, item_id);
  if (!item || idx < 0) return;
  /* [menu removeItem:] — NSMenuItem has NO removeFromMenu: (that selector
     raises doesNotRecognizeSelector and killed the host). */
  OBJC_MSG(void(*)(id, SEL, id), g_menus[idx], sel_registerName("removeItem:"),
           item);
  OBJC_MSG(void(*)(id, SEL), item, sel_registerName("release"));
}

/* Reads item states: {enabled, checked, title} or null when absent. */
static void menu_item_info(const char *menu_id, const char *item_id,
                           int req_id) {
  id item = menu_find_item(menu_id, item_id);
  if (!item || req_id < 0) {
    if (req_id >= 0) zt_reply_null(req_id);
    return;
  }
  int enabled = wnd_bool(item, "isEnabled");
  long state = (long)OBJC_MSG(long(*)(id, SEL), item, sel_registerName("state"));
  id title = OBJC_MSG(id(*)(id, SEL), item, sel_registerName("title"));
  const char *u = title
                      ? (const char *)OBJC_MSG(const char *(*)(id, SEL), title,
                                               sel_registerName("UTF8String"))
                      : "";
  char esc[512];
  zt_json_escape(u ? u : "", esc, sizeof(esc));
  char buf[700];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
           "{\"enabled\":%s,\"checked\":%s,\"title\":\"%s\"}}",
           req_id, enabled ? "true" : "false",
           state == 1 ? "true" : "false", esc);
  zt_send_line(buf);
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
static void menu_set_item_checked(const char *menu_id, const char *item_id, int checked) {
  id item = menu_find_item(menu_id, item_id);
  if (item) OBJC_MSG(void(*)(id, SEL, long), item, sel_registerName("setState:"),
                     checked ? 1 /*NSOnState*/ : 0 /*NSOffState*/);
}
/* Parses a Tauri-style accelerator ("CmdOrCtrl+Shift+K") into an NSMenu
   keyEquivalent string + NSEventModifierFlags mask. Reuses the token names
   of the Carbon parse_accelerator (shared convention). */
static void menu_parse_accel(const char *accel, unsigned long *mask, char *key,
                             size_t keysz) {
  *mask = 0;
  key[0] = '\0';
  char tmp[128];
  snprintf(tmp, sizeof(tmp), "%s", accel);
  char *save = NULL;
  for (char *tok = strtok_r(tmp, "+", &save); tok;
       tok = strtok_r(NULL, "+", &save)) {
    if (!strcasecmp(tok, "cmd") || !strcasecmp(tok, "command") ||
        !strcasecmp(tok, "super") || !strcasecmp(tok, "meta") ||
        !strcasecmp(tok, "cmdorctrl") || !strcasecmp(tok, "mod")) {
      /* "CmdOrCtrl" is Command on macOS. */
      *mask |= (1UL << 20); /* NSEventModifierFlagCommand */
      continue;
    }
    if (!strcasecmp(tok, "ctrl") || !strcasecmp(tok, "control")) {
      *mask |= (1UL << 18); /* NSEventModifierFlagControl */
      continue;
    }
    if (!strcasecmp(tok, "alt") || !strcasecmp(tok, "option")) {
      *mask |= (1UL << 19); /* NSEventModifierFlagOption */
      continue;
    }
    if (!strcasecmp(tok, "shift")) {
      *mask |= (1UL << 17); /* NSEventModifierFlagShift */
      continue;
    }
    snprintf(key, keysz, "%s", tok);
  }
}
static void menu_set_item_accel(const char *menu_id, const char *item_id,
                                const char *accel) {
  id item = menu_find_item(menu_id, item_id);
  if (!item || !accel || !accel[0]) return;
  unsigned long mask;
  char key[8];
  menu_parse_accel(accel, &mask, key, sizeof(key));
  if (!key[0]) return;
  OBJC_MSG(void(*)(id, SEL, id), item, sel_registerName("setKeyEquivalent:"),
           zt_nsstring(key));
  OBJC_MSG(void(*)(id, SEL, unsigned long), item,
           sel_registerName("setKeyEquivalentModifierMask:"), mask);
}
/* Pops a menu as a context menu at window coords (0,0 = current cursor). */
static void menu_popup(const char *menu_id, webview_t w, int x, int y) {
  int idx = menu_index(menu_id);
  if (idx < 0) return;
  void *wnd = zt_window_of(w);
  if (!wnd) return;
  id view = OBJC_MSG(id(*)(id, SEL), wnd, sel_registerName("contentView"));
  if (!view) return;
  ZtPoint loc;
  if (x != 0 || y != 0) {
    loc.x = (double)x;
    loc.y = (double)y;
  } else {
    loc = zt_screen_to_base(wnd, zt_mouse_screen());
  }
  OBJC_MSG(void(*)(id, SEL, id, ZtPoint, id), g_menus[idx],
           sel_registerName("popUpMenuPositioningItem:atLocation:inView:"),
           (id)NULL, loc, view);
}
/* Attaches a registered menu to the tray (left-click shows it on macOS). */
static void tray_set_menu(const char *menu_id) {
  int idx = menu_index(menu_id);
  if (idx < 0 || !g_status_item) return;
  OBJC_MSG(void(*)(id, SEL, id), g_status_item, sel_registerName("setMenu:"),
           g_menus[idx]);
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
/* Builds + runs an NSAlert; buttons: NULL-terminated list after the first.
   Returns the 1-based button index (NSAlertFirstButtonReturn == 1000). */
static long zt_alert_run(const char *title, const char *body, int kind,
                         const char *btn2) {
  id alert = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSAlert"), sel_registerName("alloc"));
  alert = OBJC_MSG(id(*)(id, SEL), alert, sel_registerName("init"));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setMessageText:"), zt_nsstring(title));
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("setInformativeText:"), zt_nsstring(body));
  /* NSAlertStyle: Warning=0, Informational=1, Critical=2. */
  long style = kind == 2 ? 2 : (kind == 1 ? 0 : 1);
  OBJC_MSG(void(*)(id, SEL, unsigned long), alert, sel_registerName("setAlertStyle:"),
           (unsigned long)style);
  OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("addButtonWithTitle:"), zt_nsstring("OK"));
  if (btn2) {
    OBJC_MSG(void(*)(id, SEL, id), alert, sel_registerName("addButtonWithTitle:"), zt_nsstring(btn2));
  }
  long resp = (long)OBJC_MSG(long(*)(id, SEL), alert, sel_registerName("runModal"));
  OBJC_MSG(void(*)(id, SEL), alert, sel_registerName("release"));
  return resp - 1000;
}

static void dialog_message(Msg *m) {
  long btn = zt_alert_run(m->id, m->str2, m->kind, NULL);
  char tmp[32];
  snprintf(tmp, sizeof(tmp), "%ld", btn);
  zt_reply_string(m->req_id, tmp);
}

static void dialog_confirm_like(Msg *m) {
  /* ask/confirm: true when the first (OK/Yes) button is clicked. */
  long btn = zt_alert_run(m->id, m->str2, m->kind, "Cancel");
  zt_reply_query(m->req_id, btn == 1 ? "true" : "false");
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
    set_prevent_close_of(
        m->win_label[0] ? m->win_label : "main", m->bool_val);
    return 1;
  }
  if (strcmp(m->type, "window_destroy") == 0) {
    if (getenv("ZT_TRACE"))
      fprintf(stderr, "[zt] window_destroy w=%s main=%s wnd=%s\n",
              w ? "ok" : "null", (w == zt_w) ? "yes" : "no",
              zt_window_of(w) ? "ok" : "null");
    if (w && w != zt_w) {
      /* Runtime-created window: close just this window (registry cleanup
         happens in the windowWillClose delegate, shared with user closes). */
      void *wnd = zt_window_of(w);
      if (wnd)
        OBJC_MSG(void(*)(id, SEL), wnd, sel_registerName("performClose:"));
    } else {
      webview_terminate(zt_w);
    }
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
         scalar cast matches the SysV/arm64 float-register ABI.
         Max (0,0) would CLAMP the window to zero, not clear the constraint
         (repro: 1x32 titlebar stub after zoom) — use FLT_MAX to clear. */
      int is_max = strcmp(m->type, "window_set_max_size") == 0;
      double cw = (double)m->width, ch = (double)m->height;
      if (is_max && cw <= 0 && ch <= 0) {
        cw = ch = 3.4028234663852886e38; /* FLT_MAX */
      }
      SEL sel = sel_registerName(is_max ? "setContentMaxSize:"
                                        : "setContentMinSize:");
      ((void(*)(id, SEL, double, double))objc_msgSend)(
          (id)wnd, sel, cw, ch);
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
  if (strcmp(m->type, "inner_size") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd && m->req_id >= 0) {
      id cv = OBJC_MSG(id(*)(id, SEL), wnd, sel_registerName("contentView"));
      ZtRect b;
#if defined(__aarch64__)
      b = ((ZtRect(*)(id, SEL))objc_msgSend)(cv, sel_registerName("bounds"));
#else
      ((void(*)(id, SEL, ZtRect *))objc_msgSend_stret)(
          cv, sel_registerName("bounds"), &b);
#endif
      char buf[96];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
               "{\"width\":%g,\"height\":%g}}",
               m->req_id, b.width, b.height);
      zt_send_line(buf);
    }
    return 1;
  }
  if (strcmp(m->type, "cursor_position") == 0) {
    void *wnd = zt_window_of(w);
    if (m->req_id >= 0) {
      ZtPoint p = wnd ? zt_screen_to_base(wnd, zt_mouse_screen())
                      : zt_mouse_screen();
      char buf[96];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":"
               "{\"x\":%g,\"y\":%g}}",
               m->req_id, p.x, p.y);
      zt_send_line(buf);
    }
    return 1;
  }
  if (strcmp(m->type, "set_cursor_position") == 0) {
    void *wnd = zt_window_of(w);
    /* wire x/y are window-base coords; CG wants screen coords (top-left). */
    ZtPoint base = {(double)m->x, (double)m->y};
    ZtPoint screen = wnd ? zt_base_to_screen(wnd, base) : base;
    CGPoint cg = {screen.x, screen.y};
    CGWarpMouseCursorPosition(cg);
    return 1;
  }
  if (strcmp(m->type, "available_monitors") == 0 ||
      strcmp(m->type, "primary_monitor") == 0 ||
      strcmp(m->type, "current_monitor") == 0 ||
      strcmp(m->type, "monitor_from_point") == 0) {
    if (m->req_id >= 0) {
      int mode = strcmp(m->type, "available_monitors") == 0
                     ? 0
                     : strcmp(m->type, "primary_monitor") == 0
                           ? 1
                           : strcmp(m->type, "current_monitor") == 0 ? 2 : 3;
      monitors_reply(m->req_id, mode, zt_window_of(w), (double)m->x,
                     (double)m->y);
    }
    return 1;
  }
  if (strcmp(m->type, "set_traffic_light_position") == 0) {
    void *wnd = zt_window_of(w);
    if (wnd) {
      /* Move close(0)/miniaturize(1)/zoom(2) buttons to the given origin
         (titlebar-view coords). */
      for (long btn_kind = 0; btn_kind < 3; btn_kind++) {
        id btn = OBJC_MSG(id(*)(id, SEL, long), wnd,
                          sel_registerName("standardWindowButton:"), btn_kind);
        if (btn) {
          ((void(*)(id, SEL, double, double))objc_msgSend)(
              (id)btn, sel_registerName("setFrameOrigin:"), (double)m->x,
              (double)m->y);
        }
      }
    }
    return 1;
  }
  if (strcmp(m->type, "set_theme") == 0) {
    /* App-wide on macOS: NSApp.appearance = DarkAqua/Aqua/nil(follow system). */
    id appearance = NULL;
    if (strcmp(m->str2, "dark") == 0 || strcmp(m->str2, "light") == 0) {
      const char *name =
          m->str2[0] == 'd' ? "NSAppearanceNameDarkAqua" : "NSAppearanceNameAqua";
      appearance =
          OBJC_MSG(id(*)(id, SEL, id), (id)objc_getClass("NSAppearance"),
                   sel_registerName("appearanceNamed:"), zt_nsstring(name));
    }
    OBJC_MSG(void(*)(id, SEL, id), zt_nsapp(), sel_registerName("setAppearance:"),
             appearance);
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
  if (strcmp(m->type, "menu_add_predefined") == 0) {
    /* wire: str2 = "kind" for standard selectors; text overrides title via
       a follow-up set_title. Keep it simple: str2 carries the kind only. */
    menu_add_predefined(m->str, m->id, m->str2, "", m->status);
    return 1;
  }
  if (strcmp(m->type, "menu_insert_item") == 0) { menu_insert_item(m->str, m->id, m->str2, m->status, m->checked, m->x); return 1; }
  if (strcmp(m->type, "menu_remove_item") == 0) { menu_remove_item(m->str, m->id); return 1; }
  if (strcmp(m->type, "menu_item_info") == 0) { menu_item_info(m->str, m->id, m->req_id); return 1; }
  if (strcmp(m->type, "menu_add_submenu_item") == 0) { menu_add_submenu_item(m->str, m->id, m->str2); return 1; }
  if (strcmp(m->type, "menu_set_app") == 0) { menu_set_app(m->str); return 1; }
  if (strcmp(m->type, "menu_destroy") == 0) { menu_destroy(m->str); return 1; }
  if (strcmp(m->type, "menu_item_set_enabled") == 0) { menu_set_item_enabled(m->str, m->id, m->status); return 1; }
  if (strcmp(m->type, "menu_item_set_title") == 0) { menu_set_item_title(m->str, m->id, m->str2); return 1; }
  if (strcmp(m->type, "menu_item_set_checked") == 0) { menu_set_item_checked(m->str, m->id, m->checked); return 1; }
  if (strcmp(m->type, "menu_item_set_accel") == 0) { menu_set_item_accel(m->str, m->id, m->str2); return 1; }
  if (strcmp(m->type, "menu_popup") == 0) { menu_popup(m->str, w, m->x, m->y); return 1; }
  if (strcmp(m->type, "tray_set_menu") == 0) { tray_set_menu(m->str); return 1; }
  if (strcmp(m->type, "set_file_drop_enabled") == 0) {
    webview_t w = zt_webview(m->win_label);
    id wk = w ? (id)webview_get_native_handle(
                    w, WEBVIEW_NATIVE_HANDLE_KIND_BROWSER_CONTROLLER)
              : NULL;
    if (wk) {
      objc_setAssociatedObject(
          wk, "drop_enabled",
          OBJC_MSG(id(*)(id, SEL, BOOL), (id)objc_getClass("NSNumber"),
                   sel_registerName("numberWithBool:"), m->bool_val ? YES : NO),
          OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    return 1;
  }
  if (strcmp(m->type, "webview_clear_data") == 0) {
    /* [store removeDataOfTypes:modifiedSince:completionHandler:] —
       WKWebsiteDataStore has NO two-arg variant (verified against the
       WebKit headers; the 2-arg send aborts with doesNotRecognizeSelector).
       The completion handler runs on an internal WebKit queue; the request
       itself is fire-and-forget on the wire, so a no-op block is enough. */
    id store_cls = (id)objc_getClass("WKWebsiteDataStore");
    id store = OBJC_MSG(id(*)(id, SEL), store_cls,
                        sel_registerName("defaultDataStore"));
    id types = OBJC_MSG(id(*)(id, SEL), store_cls,
                        sel_registerName("allWebsiteDataTypes"));
    id since = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSDate"),
                        sel_registerName("distantPast"));
    ((void(*)(id, SEL, id, id, id))objc_msgSend)(
        store,
        sel_registerName("removeDataOfTypes:modifiedSince:completionHandler:"),
        types, since, (id)&zt_noop_block);
    return 1;
  }
  if (strcmp(m->type, "webview_open_devtools") == 0) {
    /* WKWebView inspectable is set at creation (debug=1); the best runtime
       equivalent is opening Web Inspector via the webview's UIDelegate —
       simplest reliable route: evaluateJavaScript can't open it, so this
       no-ops unless built with debug (documented). */
    return 1;
  }
  if (strcmp(m->type, "tray_set_visible") == 0) { tray_set_visible(m->bool_val); return 1; }
  if (strcmp(m->type, "tray_set_icon_template") == 0) { tray_set_icon_template(m->bool_val); return 1; }

  if (strcmp(m->type, "dialog_open") == 0) { dialog_open(m); return 1; }
  if (strcmp(m->type, "dialog_save") == 0) { dialog_save(m); return 1; }
  if (strcmp(m->type, "dialog_message") == 0) { dialog_message(m); return 1; }
  if (strcmp(m->type, "dialog_ask") == 0) { dialog_confirm_like(m); return 1; }
  if (strcmp(m->type, "dialog_confirm") == 0) { dialog_confirm_like(m); return 1; }
  if (strcmp(m->type, "clipboard_read_html") == 0) {
    if (m->req_id >= 0) {
      id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                       sel_registerName("generalPasteboard"));
      id str =
          pb ? OBJC_MSG(id(*)(id, SEL, id), pb, sel_registerName("stringForType:"),
                        zt_nsstring("public.html"))
             : NULL;
      if (str) zt_reply_string(m->req_id, OBJC_MSG(const char *(*)(id, SEL), str,
                                                    sel_registerName("UTF8String")));
      else zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_html") == 0) {
    id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                     sel_registerName("generalPasteboard"));
    OBJC_MSG(void(*)(id, SEL), pb, sel_registerName("clearContents"));
    /* HTML + plain-text fallback of the same markup (what AppKit apps put
       on the pasteboard for HTML). */
    OBJC_MSG(void(*)(id, SEL, id, id), pb, sel_registerName("setString:forType:"),
             zt_nsstring(m->str2[0] ? m->str2 : m->str),
             zt_nsstring("public.html"));
    OBJC_MSG(void(*)(id, SEL, id, id), pb, sel_registerName("setString:forType:"),
             zt_nsstring(m->str2[0] ? m->str2 : m->str),
             zt_nsstring("public.utf8-plain-text"));
    if (m->req_id >= 0) zt_reply_query(m->req_id, "true");
    return 1;
  }

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
  if (strcmp(m->type, "clipboard_read_image") == 0) {
    if (m->req_id >= 0) {
      id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                       sel_registerName("generalPasteboard"));
      id data =
          pb ? OBJC_MSG(id(*)(id, SEL, id), pb, sel_registerName("dataForType:"),
                        zt_nsstring("public.png"))
             : NULL;
      if (!data) {
        zt_reply_null(m->req_id);
      } else {
        const unsigned char *bytes = OBJC_MSG(
            const unsigned char *(*)(id, SEL), data, sel_registerName("bytes"));
        unsigned long len =
            OBJC_MSG(unsigned long (*)(id, SEL), data, sel_registerName("length"));
        size_t b64len = ((size_t)len + 2) / 3 * 4;
        char *buf = (char *)malloc(b64len + 128);
        if (!buf) {
          zt_reply_null(m->req_id);
          return 1;
        }
        int off = snprintf(buf, 128,
                           "{\"type\":\"query_result\",\"req_id\":%d,"
                           "\"result\":{\"base64\":\"",
                           m->req_id);
        zt_base64(bytes, (size_t)len, buf + off);
        strcpy(buf + off + b64len, "\"}}");
        zt_send_line(buf);
        free(buf);
      }
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_image") == 0) {
    /* PNG bytes arrive base64-encoded in str2 (b64), or as a registered
       image id in id (image_id) — the latter re-encodes via TIFF. */
    int ok = 0;
    int owned = 0;
    id png = NULL;
    if (m->str2[0]) {
      id d = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSData"),
                      sel_registerName("alloc"));
      png = OBJC_MSG(id(*)(id, SEL, id, unsigned long), d,
                     sel_registerName("initWithBase64EncodedString:options:"),
                     zt_nsstring(m->str2), 0UL);
      owned = 1; /* alloc + init… → we own it */
    } else if (m->id[0]) {
      png = zt_png_of_image(image_by_id(atoi(m->id))); /* autoreleased */
    }
    if (png) {
      id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                       sel_registerName("generalPasteboard"));
      OBJC_MSG(void(*)(id, SEL), pb, sel_registerName("clearContents"));
      OBJC_MSG(void(*)(id, SEL, id, id), pb, sel_registerName("setData:forType:"),
               png, zt_nsstring("public.png"));
      ok = 1;
    }
    if (owned && png) OBJC_MSG(void(*)(id, SEL), png, sel_registerName("release"));
    if (m->req_id >= 0) zt_reply_query(m->req_id, ok ? "true" : "false");
    return 1;
  }
  if (strcmp(m->type, "clipboard_clear") == 0) {
    id pb = OBJC_MSG(id(*)(id, SEL), (id)objc_getClass("NSPasteboard"),
                     sel_registerName("generalPasteboard"));
    if (pb) OBJC_MSG(void(*)(id, SEL), pb, sel_registerName("clearContents"));
    if (m->req_id >= 0) zt_reply_query(m->req_id, "true");
    return 1;
  }
  if (strcmp(m->type, "shortcut_is_registered") == 0) {
    if (m->req_id >= 0) {
      zt_reply_query(m->req_id, shortcut_is_registered(m->id) ? "true" : "false");
    }
    return 1;
  }
  if (strcmp(m->type, "notification_is_granted") == 0) {
    if (m->req_id >= 0) {
      id cls = (id)objc_getClass("UNUserNotificationCenter");
      id center = zt_has_app_bundle() && cls
                      ? OBJC_MSG(id(*)(id, SEL), cls,
                                 sel_registerName("currentNotificationCenter"))
                      : NULL;
      if (!center || g_perm_req >= 0) {
        zt_reply_query(m->req_id, "false");
        return 1;
      }
      g_perm_req = m->req_id;
      ((void(*)(id, SEL, id))objc_msgSend)(
          center,
          sel_registerName("getNotificationSettingsWithCompletionHandler:"),
          (id)&zt_perm_settings_block);
    }
    return 1;
  }
  if (strcmp(m->type, "notification_request_permission") == 0) {
    if (m->req_id >= 0) {
      id cls = (id)objc_getClass("UNUserNotificationCenter");
      id center = zt_has_app_bundle() && cls
                      ? OBJC_MSG(id(*)(id, SEL), cls,
                                 sel_registerName("currentNotificationCenter"))
                      : NULL;
      if (!center || g_perm_req >= 0) {
        zt_reply_query(m->req_id, "false");
        return 1;
      }
      g_perm_req = m->req_id;
      ((void(*)(id, SEL, unsigned long, id))objc_msgSend)(
          center, sel_registerName("requestAuthorizationWithOptions:completionHandler:"),
          7UL /* badge | sound | alert */, (id)&zt_perm_granted_block);
    }
    return 1;
  }

  return 0;
}

static int init(void) {
  install_window_delegate();
  install_tray_target();
  install_menu_target();
  install_deep_link_handler();
  install_theme_observer();
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

const HostPlatformOps zt_platform = { dispatch, init, attach_webview_impl, relaunch };
