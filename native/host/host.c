/*
 * ztron-host — native host (cross-platform core).
 *
 * Owns the WebView + GUI run loop on the main thread and bridges it to the
 * Ztron tjs backend over a TCP connection. Platform-specific native features
 * (window states/tray/menu/dialogs/window events) are delegated to the
 * platform implementation via `zt_platform.dispatch`.
 *
 *   frontend -> webview_bind callback  ->  host writes {"type":"request",...}
 *   backend  -> {"type":"response",...} -> host calls webview_return
 *   backend  -> {"type":"eval",...}     -> host calls webview_eval
 *   backend  -> {"type":"quit"}         -> host terminates the run loop
 *   backend  -> window/tray/menu/dialog -> platform dispatch (platform impl)
 *
 * Newline-delimited JSON framing. The backend connects to the host; the host
 * prints "PORT=<n>" on stdout so the CLI can pass it to the backend.
 *
 * Build: host.c + host_platform.<plat>.c (see host_platform.h).
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
typedef int socklen_t;
typedef long zt_ssize_t;
/* write(2)/read(2) stand-ins over winsock; SOCKET_ERROR is already -1. */
static zt_ssize_t zt_sock_write(int fd, const char *buf, size_t n) {
  return send(fd, buf, (int)n, 0);
}
static zt_ssize_t zt_sock_read(int fd, char *buf, size_t n) {
  return recv(fd, buf, (int)n, 0);
}
#define zt_close(fd) closesocket(fd)
/* SRWLOCK statically initializes like PTHREAD_MUTEX_INITIALIZER. */
static SRWLOCK g_lock = SRWLOCK_INIT;
#define zt_lock() AcquireSRWLockExclusive(&g_lock)
#define zt_unlock() ReleaseSRWLockExclusive(&g_lock)
#else
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
typedef ssize_t zt_ssize_t;
static zt_ssize_t zt_sock_write(int fd, const char *buf, size_t n) {
  return write(fd, buf, n);
}
#define zt_close(fd) close(fd)
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
#define zt_lock() pthread_mutex_lock(&g_lock)
#define zt_unlock() pthread_mutex_unlock(&g_lock)
#endif

#include "host_platform.h"

/* ---- tiny JSON helpers (flat objects, string/int fields) ---- */

static const char *skip_ws(const char *s) {
  while (*s == ' ' || *s == '\t' || *s == '\n' || *s == '\r') s++;
  return s;
}

/* extracts "key":"..." (decoding JSON escapes) into out; returns 1 on success */
int zt_json_str(const char *json, const char *key, char *out, size_t outsz) {
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

int zt_json_int(const char *json, const char *key, int def) {
  char pat[128];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p = strchr(p + strlen(pat), ':');
  if (!p) return def;
  p = skip_ws(p + 1);
  return atoi(p);
}

double zt_json_double(const char *json, const char *key, double def) {
  char pat[128];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p = strchr(p + strlen(pat), ':');
  if (!p) return def;
  p = skip_ws(p + 1);
  return atof(p);
}

/* JSON booleans (`true`/`false`) parse to 1/0; plain ints fall through. */
int zt_json_bool(const char *json, const char *key, int def) {
  char pat[128];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(json, pat);
  if (!p) return def;
  p = strchr(p + strlen(pat), ':');
  if (!p) return def;
  p = skip_ws(p + 1);
  if (strncmp(p, "true", 4) == 0) return 1;
  if (strncmp(p, "false", 5) == 0) return 0;
  return atoi(p);
}

/* ---- socket bridge ---- */

static int g_fd = -1;
/* g_lock lives in the platform shim at the top of the file (SRWLOCK on
   Windows, pthread mutex elsewhere). */
webview_t zt_w = NULL;
static int g_exit_code = 0;

/* ---- window registry (label -> webview) ---- */

#define MAX_WEBVIEWS 16

typedef struct {
  char label[64];
  webview_t w;
} ZtWebview;

static ZtWebview g_webviews[MAX_WEBVIEWS];
static int g_webview_count = 0;

webview_t zt_webview(const char *label) {
  if (!label || !label[0]) return zt_w;
  for (int i = 0; i < g_webview_count; i++) {
    if (strcmp(g_webviews[i].label, label) == 0) return g_webviews[i].w;
  }
  return zt_w;
}

/* Maps a native window handle to its registry label ("main" if unknown). */
const char *zt_label_for_window(void *wnd) {
  if (!wnd) return "main";
  if (webview_get_native_handle(zt_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW) ==
      wnd)
    return "main";
  for (int i = 0; i < g_webview_count; i++) {
    if (webview_get_native_handle(g_webviews[i].w,
                                  WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW) ==
        wnd)
      return g_webviews[i].label;
  }
  return "main";
}

/* Drops a label from the webview registry (window closed). */
void zt_remove_webview_label(const char *label) {
  if (!label || !label[0] || strcmp(label, "main") == 0) return;
  for (int i = 0; i < g_webview_count; i++) {
    if (strcmp(g_webviews[i].label, label) == 0) {
      for (int j = i; j < g_webview_count - 1; j++) g_webviews[j] = g_webviews[j + 1];
      g_webview_count--;
      return;
    }
  }
}

/* Registry iteration (for per-window broadcasts). */
int zt_webview_count(void) { return g_webview_count; }
const char *zt_webview_label_at(int i) {
  return (i >= 0 && i < g_webview_count) ? g_webviews[i].label : NULL;
}
void *zt_webview_handle_at(int i) {
  if (i < 0 || i >= g_webview_count) return NULL;
  return webview_get_native_handle(g_webviews[i].w,
                                  WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

static void add_webview(const char *label, webview_t w) {
  if (g_webview_count >= MAX_WEBVIEWS) return;
  strncpy(g_webviews[g_webview_count].label, label ? label : "",
          sizeof(g_webviews[0].label) - 1);
  g_webviews[g_webview_count].w = w;
  g_webview_count++;
}

static void send_line_unlocked(const char *line) {
  if (g_fd < 0) return;
  size_t n = strlen(line);
  zt_ssize_t r = zt_sock_write(g_fd, line, n);
  if (r == (zt_ssize_t)n) zt_sock_write(g_fd, "\n", 1);
}

void zt_send_line(const char *line) {
  if (g_fd < 0) return;
  zt_lock();
  send_line_unlocked(line);
  zt_unlock();
}

/* runs on the GUI thread (queued via webview_dispatch) */
static void ipc_cb(const char *id, const char *req, void *arg);
static void on_gui(webview_t w, void *arg);

/* ---- engine-creation reentrancy guard (WebView2) ------------------------ */
/* webview_create's ctor pumps the message loop NESTED until its controller
   is ready. Any on_gui item processed inside that pump is reentrant, and
   WebView2 silently drops content ops issued then: Navigate() returns S_OK
   but the page stays about:blank (observed on Windows bring-up). Defer
   content ops while an engine is being created and flush afterwards. */
static int g_creating_webview = 0;
/* Deferred node: Msg stays first so on_gui's free(&node->msg) — the pointer
   it receives — releases the whole allocation. */
typedef struct ZtDeferred { Msg msg; struct ZtDeferred *next; } ZtDeferred;
static ZtDeferred *g_deferred_head = NULL;
static ZtDeferred *g_deferred_tail = NULL;

static int zt_is_content_op(const Msg *m) {
  return strcmp(m->type, "eval") == 0 ||
         strcmp(m->type, "set_html") == 0 ||
         strcmp(m->type, "navigate") == 0;
}

/* Copies m into a deferred node; takes over the caller's reference (the
   caller must not touch m after this and must not free it). */
static void zt_defer_msg(Msg *m) {
  ZtDeferred *d = (ZtDeferred *)malloc(sizeof(*d));
  d->msg = *m;
  d->next = NULL;
  free(m);
  if (g_deferred_tail) g_deferred_tail->next = d;
  else g_deferred_head = d;
  g_deferred_tail = d;
}

static void zt_flush_deferred(void) {
  while (g_deferred_head) {
    ZtDeferred *d = g_deferred_head;
    g_deferred_head = d->next;
    if (!g_deferred_head) g_deferred_tail = NULL;
    if (getenv("ZT_TRACE"))
      fprintf(stderr, "[zt] flush deferred %s label=%s\n",
              d->msg.type, d->msg.win_label);
    on_gui(NULL, &d->msg); /* frees the node via free(&d->msg) */
  }
}

static void on_gui(webview_t w, void *arg) {
  Msg *m = (Msg *)arg;
  /* Resolve the TARGET webview here, on the GUI thread: the socket thread
     resolves labels when ENQUEUEING, but the registry is only populated by
     create_window (which itself runs later on this queue) — so early
     label-routed messages would otherwise fall back to the main window
     (e.g. the new page's set_html loading into main). FIFO order on the
     main queue makes the re-resolution here correct. */
  webview_t target = m->win_label[0] ? zt_webview(m->win_label) : w;
  if (!target) target = w;
  w = target;
  if (getenv("ZT_TRACE"))
    fprintf(stderr, "[zt] on_gui %s label=%s\n", m->type, m->win_label);
  /* Defer content ops while an engine is being created (see guard above):
     takes ownership of m, so return without freeing. */
  if (g_creating_webview && zt_is_content_op(m)) {
    if (getenv("ZT_TRACE"))
      fprintf(stderr, "[zt]   defer %s label=%s (engine creation in flight)\n",
              m->type, m->win_label);
    zt_defer_msg(m);
    return;
  }
  if (strcmp(m->type, "eval") == 0) {
    webview_error_t zt_e = webview_eval(w, m->str);
    if (getenv("ZT_TRACE") && zt_e) fprintf(stderr, "[zt]   eval -> %d\n", zt_e);
  } else if (strcmp(m->type, "set_html") == 0) {
    webview_error_t zt_e = webview_set_html(w, m->str);
    if (getenv("ZT_TRACE") && zt_e) fprintf(stderr, "[zt]   set_html -> %d\n", zt_e);
  } else if (strcmp(m->type, "navigate") == 0) {
    webview_error_t zt_e = webview_navigate(w, m->str);
    if (getenv("ZT_TRACE"))
      fprintf(stderr, "[zt]   navigate(%s) w=%p -> %d\n", m->str, (void *)w, zt_e);
  } else if (strcmp(m->type, "set_title") == 0) {
    webview_set_title(w, m->id); /* `title` maps to m->id on the wire */
  } else if (strcmp(m->type, "set_size") == 0) {
    webview_set_size(w, m->width, m->height, 0);
  } else if (strcmp(m->type, "set_zoom") == 0) {
    /* CSS zoom via eval (works for WKWebView content) */
    char js[64];
    snprintf(js, sizeof(js), "document.body.style.zoom=%g;", m->opacity_val);
    webview_eval(w, js);
  } else if (strcmp(m->type, "response") == 0) {
    webview_return(w, m->id, m->status, m->str);
  } else if (strcmp(m->type, "quit") == 0) {
    webview_terminate(w);
  } else if (strcmp(m->type, "app_exit") == 0) {
    g_exit_code = m->status;
    webview_terminate(w);
  } else if (strcmp(m->type, "app_relaunch") == 0) {
    zt_platform.relaunch();
  } else if (strcmp(m->type, "create_window") == 0) {
    /* Multi-window: create (or configure) the webview for m->win_label. */
    webview_t nw = zt_webview(m->win_label);
    if (nw == zt_w && m->win_label[0] &&
        strcmp(m->win_label, "main") != 0) {
      g_creating_webview++;
      nw = webview_create(1, NULL);
      g_creating_webview--;
      if (nw) {
        add_webview(m->win_label, nw);
        /* strdup: the bind arg must outlive this Msg (freed below). */
        webview_bind(nw, "__ZTRON_IPC__", ipc_cb, strdup(m->win_label));
        if (zt_platform.attach_webview) zt_platform.attach_webview(nw);
      }
      /* Content ops queued behind this creation were re-routed into the
         defer list by the guard; run them now that the engine exists. */
      zt_flush_deferred();
    }
    if (nw) {
      if (m->width > 0 && m->height > 0)
        webview_set_size(nw, m->width, m->height, 0);
      if (m->id[0]) webview_set_title(nw, m->id);
      if (m->str[0]) webview_set_html(nw, m->str);
    }
  } else if (zt_platform.dispatch(m, w)) {
    /* handled by the platform implementation */
  }
  free(m);
}

/* Parses one backend line and dispatches it to the GUI thread; returns 0
   when the reader should stop ("quit" received). Does NOT own `line`. */
static int zt_handle_backend_line(char *line) {
  Msg *m = calloc(1, sizeof(Msg));
  if (!m) return 1;
  if (!zt_json_str(line, "type", m->type, sizeof(m->type))) {
    free(m);
    return 1;
  }
  /* Common fields: content + window config */
  zt_json_str(line, "html", m->str, sizeof(m->str));
  zt_json_str(line, "url", m->str, sizeof(m->str));
  zt_json_str(line, "js", m->str, sizeof(m->str));
  zt_json_str(line, "path", m->str, sizeof(m->str));
  zt_json_str(line, "title", m->id, sizeof(m->id));
  zt_json_str(line, "menu_id", m->str, sizeof(m->str));
  zt_json_str(line, "item_id", m->id, sizeof(m->id));
  zt_json_str(line, "id", m->id, sizeof(m->id)); /* bind/response id */
  zt_json_str(line, "label", m->win_label, sizeof(m->win_label));
  zt_json_str(line, "text", m->str2, sizeof(m->str2));
  zt_json_str(line, "tooltip", m->str2, sizeof(m->str2));
  zt_json_str(line, "message", m->str2, sizeof(m->str2));
  zt_json_str(line, "accelerator", m->str2, sizeof(m->str2));
  zt_json_str(line, "icon", m->str2, sizeof(m->str2));
  zt_json_str(line, "cursor", m->str2, sizeof(m->str2));
  zt_json_str(line, "default_name", m->id, sizeof(m->id));
  zt_json_str(line, "result", m->str, sizeof(m->str));
  m->width = zt_json_int(line, "width", 0);
  m->height = zt_json_int(line, "height", 0);
  m->x = zt_json_int(line, "x", 0);
  m->y = zt_json_int(line, "y", 0);
  m->req_id = zt_json_int(line, "req_id", -1);
  m->bool_val = zt_json_bool(line, "value", 0);
  m->bool_val = zt_json_bool(line, "separator", m->bool_val);
  m->bool_val = zt_json_bool(line, "directory", m->bool_val);
  m->opacity_val = zt_json_double(line, "opacity", 0);
  m->opacity_val = zt_json_double(line, "zoom", m->opacity_val);
  m->opacity_val = zt_json_double(line, "radius", m->opacity_val); /* effects */
  m->checked = zt_json_bool(line, "checked", 0);
  m->kind = zt_json_int(line, "kind", 0);
  zt_json_str(line, "submenu", m->id, sizeof(m->id)); /* submenu id */
  zt_json_str(line, "image_id", m->id, sizeof(m->id)); /* image id */
  zt_json_str(line, "b64", m->str2, sizeof(m->str2)); /* base64 image */
  zt_json_str(line, "aux", m->aux, sizeof(m->aux)); /* secondary text */
  m->req_index = zt_json_int(line, "at", -1);
  zt_json_str(line, "status", m->aux, sizeof(m->aux)); /* named state */
  m->status = zt_json_int(line, "status", 0);
  m->status = zt_json_int(line, "state", m->status); /* effect state */
  m->status = zt_json_bool(line, "enabled", m->status);

  if (strcmp(m->type, "quit") == 0) {
    webview_dispatch(zt_webview(m->win_label), on_gui, m);
    return 0;
  }
  webview_dispatch(zt_webview(m->win_label), on_gui, m);
  return 1;
}

#if defined(_WIN32)
/* winsock sockets are not FILE*-able (no fdopen/getline): buffer recv()
   data and carve out newline-delimited lines instead. Single consumer
   thread, so one static buffer is enough. */
static char *g_rbuf = NULL;
static size_t g_rcap = 0;
static size_t g_rlen = 0;

/* Returns a heap-owned line (trailing \r\n stripped), or NULL on
   error/peer-close. */
static char *zt_read_line(int fd) {
  for (;;) {
    if (g_rlen > 0) {
      char *nl = (char *)memchr(g_rbuf, '\n', g_rlen);
      if (nl) {
        size_t len = (size_t)(nl - g_rbuf);
        while (len > 0 && g_rbuf[len - 1] == '\r') len--;
        char *line = (char *)malloc(len + 1);
        if (!line) return NULL;
        memcpy(line, g_rbuf, len);
        line[len] = '\0';
        size_t consumed = (size_t)(nl - g_rbuf) + 1;
        memmove(g_rbuf, g_rbuf + consumed, g_rlen - consumed);
        g_rlen -= consumed;
        return line;
      }
    }
    if (g_rlen == g_rcap) {
      size_t ncap = g_rcap ? g_rcap * 2 : 4096;
      char *nb = (char *)realloc(g_rbuf, ncap);
      if (!nb) return NULL;
      g_rbuf = nb;
      g_rcap = ncap;
    }
    zt_ssize_t r = zt_sock_read(fd, g_rbuf + g_rlen, g_rcap - g_rlen);
    if (r <= 0) return NULL; /* error or peer closed */
    g_rlen += (size_t)r;
  }
}

/* backend -> host reader thread */
static DWORD WINAPI socket_thread(void *arg) {
  (void)arg;
  for (;;) {
    char *line = zt_read_line(g_fd);
    if (!line) break;
    int cont = zt_handle_backend_line(line);
    free(line);
    if (!cont) break;
  }
  return 0;
}
#else
/* backend -> host reader thread */
static void *socket_thread(void *arg) {
  (void)arg;
  FILE *f = fdopen(g_fd, "r");
  if (!f) return NULL;
  char *line = NULL;
  size_t cap = 0;
  ssize_t n;
  while ((n = getline(&line, &cap, f)) != -1) {
    while (n > 0 && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = '\0';
    if (!zt_handle_backend_line(line)) break;
  }
  free(line);
  fclose(f);
  return NULL;
}
#endif

/* webview_bind callback (GUI thread) -> backend */
static void ipc_cb(const char *id, const char *req, void *arg) {
  const char *label = (const char *)arg;
  if (!label || !label[0]) label = "main";
  /* Static, not stack: ~1 MiB exceeds the 1 MiB default thread stack on
     Windows — a stack copy overflowed the moment the first frontend IPC
     arrived (macOS's 8 MiB main-thread stack masked it). ipc_cb always runs
     on the GUI thread, so a single static buffer is safe. */
  static char buf[MSG_STR_LEN + 256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"request\",\"id\":\"%s\",\"label\":\"%s\",\"req\":%s}",
           id, label, req);
  zt_send_line(buf);
}

int main(int argc, char **argv) {
#if defined(_WIN32)
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
    fprintf(stderr, "WSAStartup failed\n");
    return 1;
  }
#endif
  const char *host = "127.0.0.1";
  int port = argc > 1 ? atoi(argv[1]) : 0;

  int lfd = socket(AF_INET, SOCK_STREAM, 0);
  if (lfd < 0) {
    perror("socket");
    return 1;
  }
  int one = 1;
  /* winsock prototypes the value as const char *; POSIX takes const void * —
     the cast satisfies both. */
  setsockopt(lfd, SOL_SOCKET, SO_REUSEADDR, (const char *)&one, sizeof(one));
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
  zt_w = webview_create(1, NULL);
  if (!zt_w) {
    fprintf(stderr, "webview_create failed\n");
    return 1;
  }
  webview_set_title(zt_w, "Ztron");
  webview_set_size(zt_w, 900, 640, 0);
  webview_bind(zt_w, "__ZTRON_IPC__", ipc_cb, (void *)"main");
  if (zt_platform.init && !zt_platform.init()) {
    fprintf(stderr, "platform init failed\n");
    webview_destroy(zt_w);
    return 1;
  }

  /* wait for the backend to connect */
  struct sockaddr_in caddr;
  socklen_t clen = sizeof(caddr);
  int cfd = accept(lfd, (struct sockaddr *)&caddr, &clen);
  if (cfd < 0) {
    perror("accept");
    webview_destroy(zt_w);
    return 1;
  }
  g_fd = cfd;
#if defined(_WIN32)
  HANDLE thr = CreateThread(NULL, 0, socket_thread, NULL, 0, NULL);
  if (!thr) {
    fprintf(stderr, "CreateThread failed\n");
    webview_destroy(zt_w);
    return 1;
  }
#else
  pthread_t thr;
  pthread_create(&thr, NULL, socket_thread, NULL);
#endif

  webview_run(zt_w);
  if (getenv("ZT_TRACE")) fprintf(stderr, "[zt] run loop exited\n");
  webview_destroy(zt_w);
  if (getenv("ZT_TRACE")) fprintf(stderr, "[zt] host shutting down\n");
  zt_close(cfd);
  zt_close(lfd);
#if defined(_WIN32)
  WSACleanup();
#endif
  return g_exit_code;
}
