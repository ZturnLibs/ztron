/*
 * ztron-launcher (Windows) — GUI-subsystem launcher for packaged ztron apps.
 *
 * Windows counterpart of launcher_macos.c; flat install layout:
 *   <dir>/ztron-launcher.exe   (this binary, shortcut target)
 *   <dir>/ztron-host.exe       GUI/webview process, prints PORT=<n> on stdout
 *   <dir>/ztron-backend.exe    tjs-compiled backend (needs ffi-8.dll beside it)
 *   <dir>/frontend/index.html  built frontend, loaded via file:// URL
 *   <dir>/ztron.conf.json      staged project config (forwarded as ZTRON_CONF)
 *   <dir>/capabilities/        staged capabilities (ZTRON_CAPABILITIES_DIR)
 *
 * Flow: spawn host with stdout redirected to .host.log (CREATE_NO_WINDOW —
 * the host itself is a console binary), poll the log for PORT=, then spawn
 * the backend with the coordination env vars and wait; the host is killed
 * when the backend exits. Compiled with
 *   cl /O2 /DZTRON_INVOKE_KEY="..." launcher_windows.c
 *      /link /SUBSYSTEM:WINDOWS /ENTRY:mainCRTStartup
 * so no console window flashes. All paths are wide-char (Chinese/space
 * install dirs are first-class).
 */
#ifndef UNICODE
#define UNICODE
#define _UNICODE
#endif
#include <windows.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef ZTRON_INVOKE_KEY
#define ZTRON_INVOKE_KEY "dev"
#endif

#define POLL_ATTEMPTS 100 /* 100 x 100ms ~ 10s for the host to bind */
#define ZT_MAX_PATH 4096

static wchar_t *to_wide(const char *s) {
  int n = MultiByteToWideChar(CP_UTF8, 0, s, -1, NULL, 0);
  if (n <= 0) return NULL;
  wchar_t *w = malloc((size_t)n * sizeof(wchar_t));
  if (w) MultiByteToWideChar(CP_UTF8, 0, s, -1, w, n);
  return w;
}

/** Wide -> malloc'd UTF-8, or NULL. */
static char *to_utf8(const wchar_t *w) {
  int n = WideCharToMultiByte(CP_UTF8, 0, w, -1, NULL, 0, NULL, NULL);
  if (n <= 0) return NULL;
  char *s = malloc((size_t)n);
  if (s) WideCharToMultiByte(CP_UTF8, 0, w, -1, s, n, NULL, NULL);
  return s;
}

/**
 * Percent-encode a UTF-8 path for a file:// URL: RFC 3986 unreserved bytes
 * and '/' pass through, everything else (spaces, '#', '%', CJK lead/continuation
 * bytes) becomes %XX. CJK/space install dirs are first-class here — an
 * unencoded path only worked because WebView2 is lenient.
 */
static void url_encode_utf8(const char *s, wchar_t *out, size_t cap) {
  static const wchar_t hex[] = L"0123456789ABCDEF";
  size_t o = 0;
  for (const unsigned char *p = (const unsigned char *)s; *p && o + 3 < cap;
       p++) {
    unsigned char c = *p;
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' ||
        c == '~' || c == '/') {
      out[o++] = (wchar_t)c;
    } else {
      out[o++] = L'%';
      out[o++] = hex[c >> 4];
      out[o++] = hex[c & 0xF];
    }
  }
  out[o] = L'\0';
}

/**
 * Scan the host log for the "PORT=<n>" line; returns 1 when the full
 * number is seen. The snapshot is read to current EOF into ONE buffer —
 * a chunked scan could split "PORT=" (or the digits) across ReadFile
 * boundaries and miss or mangle the port. A digit run reaching EOF is
 * rejected (the write may still be landing); the caller re-polls.
 * Raw CreateFileW+ReadFile with FILE_SHARE_WRITE — the host keeps its
 * write handle open for the process lifetime, and CRT _wfopen (ccs=UTF-8)
 * fails to open under that share mode, so the port would never be seen.
 */
static int find_port_in_log(const wchar_t *log_path, wchar_t *port, DWORD cap) {
  HANDLE h = CreateFileW(log_path, GENERIC_READ,
                         FILE_SHARE_READ | FILE_SHARE_WRITE, NULL,
                         OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
  if (h == INVALID_HANDLE_VALUE) return 0;
  static char buf[65536]; /* the log is tiny; one thread, one poll at a time */
  DWORD rd = 0, total = 0;
  while (total < sizeof(buf) &&
         ReadFile(h, buf + total, sizeof(buf) - total, &rd, NULL) && rd > 0) {
    total += rd;
  }
  CloseHandle(h);
  for (DWORD i = 0; i + 5 <= total; i++) {
    if (memcmp(buf + i, "PORT=", 5) != 0) continue;
    DWORD j = i + 5, n = 0;
    while (j < total && buf[j] >= '0' && buf[j] <= '9' && n + 1 < cap)
      port[n++] = (wchar_t)buf[j++];
    if (j >= total) continue; /* digits ran to EOF — incomplete, re-poll */
    port[n] = L'\0';
    if (port[0] != L'\0') return 1;
  }
  return 0;
}

/** Spawn `path` with `args`; stdout/stderr -> `log` when non-NULL. */
static BOOL spawn_process(const wchar_t *path, const wchar_t *args,
                          HANDLE log, BOOL inherit, DWORD flags,
                          PROCESS_INFORMATION *pi) {
  STARTUPINFOW si;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  wchar_t cmd[ZT_MAX_PATH];
  _snwprintf_s(cmd, ZT_MAX_PATH, _TRUNCATE, L"\"%s\" %s", path, args ? args : L"");
  cmd[ZT_MAX_PATH - 1] = L'\0';
  if (log) {
    si.dwFlags = STARTF_USESTDHANDLES;
    si.hStdInput = NULL;
    si.hStdOutput = log;
    si.hStdError = log;
  }
  return CreateProcessW(path, cmd, NULL, NULL, inherit, flags, NULL, NULL, &si,
                        pi);
}

static void fail_box(const wchar_t *msg) {
  MessageBoxW(NULL, msg, L"ztron", MB_ICONERROR | MB_OK);
}

int main(void) {
  wchar_t dir[ZT_MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, dir, ZT_MAX_PATH);
  if (n == 0 || n >= ZT_MAX_PATH) return 1;
  wchar_t *slash = wcsrchr(dir, L'\\');
  if (!slash) return 1;
  *slash = L'\0'; /* dir = install directory */

  wchar_t host_log[ZT_MAX_PATH], host_bin[ZT_MAX_PATH], backend[ZT_MAX_PATH];
  wchar_t url[ZT_MAX_PATH * 3 + 64], conf_path[ZT_MAX_PATH],
      caps_path[ZT_MAX_PATH];
  _snwprintf_s(host_log, ZT_MAX_PATH, _TRUNCATE, L"%s\\.host.log", dir);
  _snwprintf_s(host_bin, ZT_MAX_PATH, _TRUNCATE, L"%s\\ztron-host.exe", dir);
  _snwprintf_s(backend, ZT_MAX_PATH, _TRUNCATE, L"%s\\ztron-backend.exe", dir);
  /* file:/// + percent-encoded forward-slashed dir — canonical local-file
     URL (worst case every UTF-8 byte becomes %XX, hence the x3 buffer) */
  {
    wchar_t fwd[ZT_MAX_PATH];
    wchar_t enc[ZT_MAX_PATH * 3 + 1];
    _snwprintf_s(fwd, ZT_MAX_PATH, _TRUNCATE, L"%s", dir);
    for (wchar_t *c = fwd; *c; c++)
      if (*c == L'\\') *c = L'/';
    char *dir8 = to_utf8(fwd);
    if (dir8) {
      url_encode_utf8(dir8, enc, sizeof(enc) / sizeof(enc[0]));
      free(dir8);
    } else {
      _snwprintf_s(enc, ZT_MAX_PATH, _TRUNCATE, L"%s", fwd); /* degenerate */
    }
    _snwprintf_s(url, ZT_MAX_PATH * 3 + 64, _TRUNCATE,
                 L"file:///%s/frontend/index.html", enc);
  }
  _snwprintf_s(conf_path, ZT_MAX_PATH, _TRUNCATE, L"%s\\ztron.conf.json", dir);
  _snwprintf_s(caps_path, ZT_MAX_PATH, _TRUNCATE, L"%s\\capabilities", dir);
  host_log[ZT_MAX_PATH - 1] = L'\0';
  host_bin[ZT_MAX_PATH - 1] = L'\0';
  backend[ZT_MAX_PATH - 1] = L'\0';
  url[ZT_MAX_PATH * 3 + 63] = L'\0';
  conf_path[ZT_MAX_PATH - 1] = L'\0';
  caps_path[ZT_MAX_PATH - 1] = L'\0';

  /* start the host, stdout+stderr -> .host.log (inheritable for the child) */
  SECURITY_ATTRIBUTES sa;
  ZeroMemory(&sa, sizeof(sa));
  sa.nLength = sizeof(sa);
  sa.bInheritHandle = TRUE;
  HANDLE log = CreateFileW(host_log, GENERIC_WRITE, FILE_SHARE_READ, &sa,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (log == INVALID_HANDLE_VALUE) log = NULL;

  PROCESS_INFORMATION host_pi;
  ZeroMemory(&host_pi, sizeof(host_pi));
  if (!spawn_process(host_bin, L"0", log, TRUE, CREATE_NO_WINDOW, &host_pi)) {
    if (log) CloseHandle(log);
    fail_box(L"ztron: failed to start ztron-host.exe");
    return 1;
  }
  if (log) CloseHandle(log);

  /* poll for PORT= (up to ~10s) */
  wchar_t port[16] = L"";
  for (int i = 0; i < POLL_ATTEMPTS && !port[0]; i++) {
    Sleep(100);
    find_port_in_log(host_log, port, 16);
  }
  if (!port[0]) {
    TerminateProcess(host_pi.hProcess, 1);
    CloseHandle(host_pi.hThread);
    CloseHandle(host_pi.hProcess);
    fail_box(L"ztron: host failed to start (see .host.log)");
    return 1;
  }

  /* coordination env; the backend inherits our (wide) environment */
  SetEnvironmentVariableW(L"ZTRON_HOST", L"127.0.0.1");
  SetEnvironmentVariableW(L"ZTRON_HOST_PORT", port);
  wchar_t *key = to_wide(ZTRON_INVOKE_KEY);
  if (key) {
    SetEnvironmentVariableW(L"ZTRON_INVOKE_KEY", key);
    free(key);
  }
  SetEnvironmentVariableW(L"ZTRON_DEV_URL", url);

  /* staged conf is forwarded as inline JSON content (what main.ts parses) */
  if (GetFileAttributesW(conf_path) != INVALID_FILE_ATTRIBUTES) {
    FILE *cf = _wfopen(conf_path, L"rb");
    if (cf) {
      fseek(cf, 0, SEEK_END);
      long sz = ftell(cf);
      fseek(cf, 0, SEEK_SET);
      if (sz > 0 && sz < 1024 * 1024) {
        char *buf = malloc((size_t)sz + 1);
        if (buf && fread(buf, 1, (size_t)sz, cf) == (size_t)sz) {
          buf[sz] = '\0';
          wchar_t *wconf = to_wide(buf);
          if (wconf) {
            SetEnvironmentVariableW(L"ZTRON_CONF", wconf);
            free(wconf);
          }
        }
        free(buf);
      }
      fclose(cf);
    }
  }
  if ((GetFileAttributesW(caps_path) & FILE_ATTRIBUTE_DIRECTORY) != 0 &&
      GetFileAttributesW(caps_path) != INVALID_FILE_ATTRIBUTES) {
    SetEnvironmentVariableW(L"ZTRON_CAPABILITIES_DIR", caps_path);
  }

  PROCESS_INFORMATION be_pi;
  ZeroMemory(&be_pi, sizeof(be_pi));
  int exit_code = 1;
  if (spawn_process(backend, NULL, NULL, FALSE, CREATE_NO_WINDOW, &be_pi)) {
    CloseHandle(be_pi.hThread);
    WaitForSingleObject(be_pi.hProcess, INFINITE);
    DWORD code = 1;
    GetExitCodeProcess(be_pi.hProcess, &code);
    exit_code = (int)code;
    CloseHandle(be_pi.hProcess);
  } else {
    fail_box(L"ztron: failed to start ztron-backend.exe");
  }

  TerminateProcess(host_pi.hProcess, 1);
  CloseHandle(host_pi.hThread);
  CloseHandle(host_pi.hProcess);
  return exit_code;
}
