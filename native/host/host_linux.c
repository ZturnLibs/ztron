/*
 * ztron-host — Linux backend (WebKitGTK) — ARCHITECTURE SKELETON.
 *
 * NOT COMPILED HERE (needs WebKitGTK 4.x headers on Linux). Mirrors the
 * socket protocol of host.c so the SAME `@ztron/runtime-ffi` HostRuntime works
 * on Linux unmodified.
 *
 * Build (on Linux): pkg-config webkit2gtk-4.1 + gtk+-3.0, link libwebkit2gtk.
 *
 * Wire protocol: identical to native/host/host.c.
 *
 * Window states / tray / menu / dialogs map onto GTK + WebKitGTK APIs:
 *   minimize   -> gtk_window_iconify
 *   maximize   -> gtk_window_maximize
 *   fullscreen -> gtk_window_fullscreen
 *   alwaysOnTop-> gtk_window_set_keep_above
 *   tray       -> GtkStatusIcon (deprecated) or libayatana-appindicator
 *   dialogs    -> GtkFileChooserNative / GtkMessageDialog
 *   frontend<->backend: webkit_web_view_run_javascript (eval) +
 *                       webkit_web_view_register_uri_scheme (custom protocol)
 */
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

int main(int argc, char **argv) {
  /* 1. gtk_init(&argc, &argv);                                  */
  /* 2. socket() + bind(127.0.0.1:0) + listen + print PORT + accept; */
  /* 3. GtkWindow + webkit_web_view_new();                        */
  /* 4. socket-thread reads backend lines, marshals to the GTK main
   *    thread via g_idle_add; execute JS with run_javascript.     */
  /* 5. gtk_main();                                               */
  return 0;
}
