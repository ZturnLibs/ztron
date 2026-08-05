/*
 * ztron-host — Windows backend (WebView2) — ARCHITECTURE SKELETON.
 *
 * NOT COMPILED HERE: Windows requires WebView2 (msedgewebview2.h) + Win32
 * windowing. This file mirrors the socket protocol of host.c so the SAME
 * `@ztron/runtime-ffi` HostRuntime works unmodified on Windows.
 *
 * Build (on Windows): link against WebView2 SDK + ws2_32 + ole32 + comctl32.
 *
 * Wire protocol (identical to native/host/host.c):
 *   backend -> host: create_window / set_html / navigate / eval / response /
 *                    minimize / is_maximized / ... / quit
 *   host -> backend: request / window_event / query_result / menu_event /
 *                    tray_event
 *
 * Window states / tray / menu / dialogs map onto Win32 + WebView2 APIs:
 *   minimize   -> ShowWindow(hwnd, SW_MINIMIZE)
 *   maximize   -> ShowWindow(hwnd, SW_MAXIMIZE)
 *   fullscreen -> MonitorFromWindow + SetWindowPos(cover)
 *   alwaysOnTop-> SetWindowPos(HWND_TOPMOST)
 *   tray       -> Shell_NotifyIcon(NIM_ADD, &nid)
 *   open dialog-> GetOpenFileName / IFileOpenDialog (COM)
 */
#include <windows.h>
#include <winsock2.h>
#include <ws2tcpip.h>

/* The main entry: create a Win32 window + WebView2 controller, accept the
 * backend socket connection, and bridge messages (same loop as host.c).
 * WebView2 init is async (ICoreWebView2Environment::CreateCoreWebView2EnvironmentWithOptions);
 * navigation/eval must be queued until the controller is ready. */
int WINAPI wWinMain(HINSTANCE h, HINSTANCE, PWSTR, int) {
  /* 1. WSAStartup(MAKEWORD(2,2)) + socket() + bind() + listen() on 127.0.0.1:0
   *    print "PORT=<n>", accept the backend connection.               */
  /* 2. Register a window class; CreateWindowEx(...) main HWND.          */
  /* 3. CreateCoreWebView2EnvironmentWithOptions(NULL, NULL, NULL, ...)
   *    in the callback: CreateCoreWebView2Controller(hwnd, ...)
   *    then ICoreWebView2::add_ScriptToExecuteOnDocumentCreated for the
   *    __TAURI_INTERNALS__ bootstrap, and ICoreWebView2::Navigate.      */
  /* 4. Message loop: GetMessage/DispatchMessage + a socket-thread that
   *    reads backend lines and posts them to the UI thread via PostMessage. */
  /* 5. webview_postWebMessageAsJson for frontend->backend; return via
   *    the injected `window.__TAURI_IPC__` binding.                     */
  return 0;
}
