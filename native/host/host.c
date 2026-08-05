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
  int status;
  int width;
  int height;
} Msg;

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
    } else {
      free(m);
    }
  }
  fclose(f);
  return NULL;
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
