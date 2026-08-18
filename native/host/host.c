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
#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
#else
#include <unistd.h>
#include <pthread.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
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
static pthread_mutex_t g_lock = PTHREAD_MUTEX_INITIALIZER;
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
  ssize_t r = write(g_fd, line, n);
  if (r == (ssize_t)n) write(g_fd, "\n", 1);
}

void zt_send_line(const char *line) {
  if (g_fd < 0) return;
  pthread_mutex_lock(&g_lock);
  send_line_unlocked(line);
  pthread_mutex_unlock(&g_lock);
}

/* runs on the GUI thread (queued via webview_dispatch) */
static void ipc_cb(const char *id, const char *req, void *arg);
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
  if (strcmp(m->type, "eval") == 0) {
    webview_eval(w, m->str);
  } else if (strcmp(m->type, "set_html") == 0) {
    webview_set_html(w, m->str);
  } else if (strcmp(m->type, "navigate") == 0) {
    webview_navigate(w, m->str);
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
      nw = webview_create(1, NULL);
      if (nw) {
        add_webview(m->win_label, nw);
        /* strdup: the bind arg must outlive this Msg (freed below). */
        webview_bind(nw, "__TAURI_IPC__", ipc_cb, strdup(m->win_label));
        if (zt_platform.attach_webview) zt_platform.attach_webview(nw);
      }
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
    if (!zt_json_str(line, "type", m->type, sizeof(m->type))) {
      free(m);
      continue;
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
    m->status = zt_json_int(line, "status", 0);
    m->status = zt_json_int(line, "state", m->status); /* effect state */
    m->status = zt_json_bool(line, "enabled", m->status);

    if (strcmp(m->type, "quit") == 0) {
      webview_dispatch(zt_webview(m->win_label), on_gui, m);
      break;
    }
    webview_dispatch(zt_webview(m->win_label), on_gui, m);
  }
  fclose(f);
  return NULL;
}

/* webview_bind callback (GUI thread) -> backend */
static void ipc_cb(const char *id, const char *req, void *arg) {
  const char *label = (const char *)arg;
  if (!label || !label[0]) label = "main";
  char buf[MSG_STR_LEN + 256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"request\",\"id\":\"%s\",\"label\":\"%s\",\"req\":%s}",
           id, label, req);
  zt_send_line(buf);
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
  zt_w = webview_create(1, NULL);
  if (!zt_w) {
    fprintf(stderr, "webview_create failed\n");
    return 1;
  }
  webview_set_title(zt_w, "Ztron");
  webview_set_size(zt_w, 900, 640, 0);
  webview_bind(zt_w, "__TAURI_IPC__", ipc_cb, (void *)"main");
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
  pthread_t thr;
  pthread_create(&thr, NULL, socket_thread, NULL);

  webview_run(zt_w);
  webview_destroy(zt_w);
  close(cfd);
  close(lfd);
  return g_exit_code;
}
