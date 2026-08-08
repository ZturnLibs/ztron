/*
 * host_linux.c — Linux platform implementation (GTK3 + WebKitGTK).
 *
 * Implements `zt_platform` for host.c. Native features reach the GTK window /
 * webview widget via `webview_get_native_handle`:
 *
 *   WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW  -> GtkWindow*
 *   WEBVIEW_NATIVE_HANDLE_KIND_UI_WIDGET  -> GtkWidget* (webview)
 *
 * Build (Linux, with webview/webview built for GTK):
 *   cc host.c host_linux.c $(pkg-config --cflags --libs gtk+-3.0) webview.a
 */
#include <string.h>
#include <stdio.h>
#include <stdlib.h>
#include <gtk/gtk.h>
#include <webkit2/webkit2.h>

#include "host_platform.h"

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

/* ---- window states ---- */

static GtkWindow *zt_window(void) {
  return (GtkWindow *)webview_get_native_handle(
      zt_w, WEBVIEW_NATIVE_HANDLE_KIND_UI_WINDOW);
}

static int is_window_op(const char *t) {
  static const char *ops[] = {
      "minimize",         "unminimize",      "toggle_maximize",
      "is_maximized",     "is_minimized",    "set_fullscreen",
      "is_fullscreen",    "set_always_on_top", "center",
      "set_focus",        "set_visible",     "set_resizable",
      "set_opacity",      "set_transparent", "set_decorations",
  };
  for (size_t i = 0; i < sizeof(ops) / sizeof(ops[0]); i++)
    if (strcmp(t, ops[i]) == 0) return 1;
  return 0;
}

static void handle_window_op(Msg *m) {
  GtkWindow *w = zt_window();
  if (!w) return;
  int result = 0;

  if (strcmp(m->type, "minimize") == 0) {
    gtk_window_iconify(w);
  } else if (strcmp(m->type, "unminimize") == 0) {
    gtk_window_deiconify(w);
  } else if (strcmp(m->type, "toggle_maximize") == 0) {
    if (gtk_window_is_maximized(w)) gtk_window_unmaximize(w);
    else gtk_window_maximize(w);
  } else if (strcmp(m->type, "is_maximized") == 0) {
    result = gtk_window_is_maximized(w);
  } else if (strcmp(m->type, "is_minimized") == 0) {
    GdkWindow *gdk = gtk_widget_get_window(GTK_WIDGET(w));
    if (gdk) result = gdk_window_get_state(gdk) & GDK_WINDOW_STATE_ICONIFIED;
  } else if (strcmp(m->type, "is_fullscreen") == 0) {
    GdkWindow *gdk = gtk_widget_get_window(GTK_WIDGET(w));
    if (gdk) result = gdk_window_get_state(gdk) & GDK_WINDOW_STATE_FULLSCREEN;
  } else if (strcmp(m->type, "set_fullscreen") == 0) {
    if (m->bool_val) gtk_window_fullscreen(w);
    else gtk_window_unfullscreen(w);
  } else if (strcmp(m->type, "set_always_on_top") == 0) {
    gtk_window_set_keep_above(w, m->bool_val);
  } else if (strcmp(m->type, "center") == 0) {
    gtk_window_set_position(w, GTK_WIN_POS_CENTER);
  } else if (strcmp(m->type, "set_focus") == 0) {
    gtk_window_present(w);
  } else if (strcmp(m->type, "set_visible") == 0) {
    if (m->bool_val) gtk_widget_show(GTK_WIDGET(w));
    else gtk_widget_hide(GTK_WIDGET(w));
  } else if (strcmp(m->type, "set_resizable") == 0) {
    gtk_window_set_resizable(w, m->bool_val);
  } else if (strcmp(m->type, "set_opacity") == 0) {
    gtk_widget_set_opacity(GTK_WIDGET(w), m->opacity_val);
  } else if (strcmp(m->type, "set_transparent") == 0) {
    GdkScreen *screen = gtk_widget_get_screen(GTK_WIDGET(w));
    GdkVisual *visual = gdk_screen_get_rgba_visual(screen);
    if (visual) gtk_widget_set_visual(GTK_WIDGET(w), visual);
    gtk_widget_set_app_paintable(GTK_WIDGET(w), m->bool_val);
  } else if (strcmp(m->type, "set_decorations") == 0) {
    gtk_window_set_decorated(w, m->bool_val);
  }

  if (m->req_id >= 0) zt_reply_query(m->req_id, result ? "true" : "false");
}

/* ---- window events (GTK signals) ---- */

static void emit_window_event(const char *event) {
  char buf[256];
  snprintf(buf, sizeof(buf),
           "{\"type\":\"window_event\",\"label\":\"main\",\"event\":\"%s\"}",
           event);
  zt_send_line(buf);
}

static gboolean on_configure(GtkWidget *w, GdkEventConfigure *e, gpointer d) {
  (void)w; (void)e; (void)d;
  emit_window_event("resize");
  return FALSE;
}
static gboolean on_move(GtkWidget *w, GdkEvent *e, gpointer d) {
  (void)w; (void)e; (void)d;
  emit_window_event("move");
  return FALSE;
}
static gboolean on_focus_in(GtkWidget *w, GdkEventFocus *e, gpointer d) {
  (void)w; (void)e; (void)d;
  emit_window_event("focus");
  return FALSE;
}
static gboolean on_focus_out(GtkWidget *w, GdkEventFocus *e, gpointer d) {
  (void)w; (void)e; (void)d;
  emit_window_event("blur");
  return FALSE;
}
static gboolean on_delete(GtkWidget *w, GdkEvent *e, gpointer d) {
  (void)w; (void)e; (void)d;
  emit_window_event("close");
  return FALSE; /* let webview/webview handle the close */
}

/* ---- tray (GtkStatusIcon; deprecated but dependency-free) ---- */

static GtkStatusIcon *g_icon = NULL;

static void emit_tray_event(const char *event) {
  char buf[128];
  snprintf(buf, sizeof(buf), "{\"type\":\"tray_event\",\"event\":\"%s\"}", event);
  zt_send_line(buf);
}
static void on_tray_activate(GtkStatusIcon *icon, gpointer d) {
  (void)icon; (void)d;
  emit_tray_event("click");
}
static void tray_create(const char *title) {
  g_icon = gtk_status_icon_new_from_icon_name("application-x-executable");
  gtk_status_icon_set_title(g_icon, title);
  gtk_status_icon_set_tooltip_text(g_icon, title);
  g_signal_connect(g_icon, "activate", G_CALLBACK(on_tray_activate), NULL);
  gtk_status_icon_set_visible(g_icon, TRUE);
}
static void tray_set_title(const char *title) {
  if (g_icon) gtk_status_icon_set_tooltip_text(g_icon, title);
}
static void tray_set_tooltip(const char *tooltip) { tray_set_title(tooltip); }
static void tray_destroy(void) {
  if (g_icon) { gtk_status_icon_set_visible(g_icon, FALSE); g_icon = NULL; }
}

/* ---- menu (GtkMenu + GtkMenuBar) ---- */

static GtkWidget *g_menu = NULL;
static GtkWidget *g_menubar = NULL;
static char g_menu_items[256][128];
static int g_menu_item_count = 0;

static void menu_create(const char *menu_id) {
  (void)menu_id;
  if (g_menu) gtk_widget_destroy(g_menu);
  g_menu = gtk_menu_new();
  g_menu_item_count = 0;
}
static void menu_add_item(const char *menu_id, const char *item_id,
                          const char *text, int enabled, int separator) {
  (void)menu_id;
  if (!g_menu) return;
  if (separator) {
    gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), gtk_separator_menu_item_new());
    return;
  }
  GtkWidget *item = gtk_menu_item_new_with_label(text);
  gtk_widget_set_sensitive(item, enabled);
  int idx = g_menu_item_count < 256 ? g_menu_item_count++ : 255;
  snprintf(g_menu_items[idx], sizeof(g_menu_items[0]), "%s", item_id);
  gtk_menu_shell_append(GTK_MENU_SHELL(g_menu), item);
  gtk_widget_show(item);
}
static void menu_set_app(const char *menu_id) {
  (void)menu_id;
  GtkWindow *w = zt_window();
  if (!w || !g_menu) return;
  /* Attach as the window's application menu via a menu bar button. */
  if (g_menubar) gtk_widget_destroy(g_menubar);
  g_menubar = gtk_menu_bar_new();
  GtkWidget *top = gtk_menu_item_new_with_label("Menu");
  gtk_menu_item_set_submenu(GTK_MENU_ITEM(top), g_menu);
  gtk_menu_shell_append(GTK_MENU_SHELL(g_menubar), top);
  gtk_widget_show_all(g_menubar);
  gtk_window_set_titlebar(w, g_menubar);
}
static void menu_destroy(const char *menu_id) {
  (void)menu_id;
  if (g_menu) { gtk_widget_destroy(g_menu); g_menu = NULL; }
}
static void menu_set_item_enabled(const char *menu_id, const char *item_id, int enabled) {
  (void)menu_id;
  (void)item_id; (void)enabled; /* GTK menu item state tracked via refs (simplified) */
}
static void menu_set_item_title(const char *menu_id, const char *item_id, const char *title) {
  (void)menu_id; (void)item_id; (void)title;
}
/* Menu item activation -> event (simplified: not wired in v1 on GTK) */

/* ---- dialogs ---- */

static void dialog_open(Msg *m) {
  GtkWidget *dlg = gtk_file_chooser_native_new(
      m->str, zt_window(), GTK_FILE_CHOOSER_ACTION_OPEN, "_Open", "_Cancel");
  if (gtk_native_dialog_run(GTK_NATIVE_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
    char *path = gtk_file_chooser_get_filename(
        GTK_FILE_CHOOSER(gtk_file_chooser_native_get_file_chooser(GTK_FILE_CHOOSER_NATIVE(dlg))));
    zt_reply_string(m->req_id, path);
    g_free(path);
  } else {
    zt_reply_null(m->req_id);
  }
  g_object_unref(dlg);
}
static void dialog_save(Msg *m) {
  GtkWidget *dlg = gtk_file_chooser_native_new(
      m->str, zt_window(), GTK_FILE_CHOOSER_ACTION_SAVE, "_Save", "_Cancel");
  if (m->id[0]) {
    gtk_file_chooser_set_current_name(
        GTK_FILE_CHOOSER(gtk_file_chooser_native_get_file_chooser(GTK_FILE_CHOOSER_NATIVE(dlg))),
        m->id);
  }
  if (gtk_native_dialog_run(GTK_NATIVE_DIALOG(dlg)) == GTK_RESPONSE_ACCEPT) {
    char *path = gtk_file_chooser_get_filename(
        GTK_FILE_CHOOSER(gtk_file_chooser_native_get_file_chooser(GTK_FILE_CHOOSER_NATIVE(dlg))));
    zt_reply_string(m->req_id, path);
    g_free(path);
  } else {
    zt_reply_null(m->req_id);
  }
  g_object_unref(dlg);
}
static void dialog_message(Msg *m) {
  GtkWidget *dlg = gtk_message_dialog_new(
      zt_window(), GTK_DIALOG_MODAL, GTK_MESSAGE_INFO, GTK_BUTTONS_OK,
      "%s", m->str);
  gtk_message_dialog_format_secondary_text(GTK_MESSAGE_DIALOG(dlg), "%s", m->str2);
  gint r = gtk_dialog_run(GTK_DIALOG(dlg));
  gtk_widget_destroy(dlg);
  char tmp[16];
  snprintf(tmp, sizeof(tmp), "%d", r == GTK_RESPONSE_OK ? 0 : 1);
  zt_reply_string(m->req_id, tmp);
}

/* ---- platform ops ---- */

static int dispatch(Msg *m) {
  if (is_window_op(m->type)) { handle_window_op(m); return 1; }
  if (strcmp(m->type, "window_get_frame") == 0) {
    GtkWidget *w = zt_window();
    if (w && m->req_id >= 0) {
      gint x, y, width, height;
      gtk_window_get_position(GTK_WINDOW(w), &x, &y);
      gtk_window_get_size(GTK_WINDOW(w), &width, &height);
      char buf[256];
      snprintf(buf, sizeof(buf),
               "{\"type\":\"query_result\",\"req_id\":%d,\"result\":{\"x\":%d,"
               "\"y\":%d,\"width\":%d,\"height\":%d}}",
               m->req_id, x, y, width, height);
      zt_send_line(buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "window_set_position") == 0) {
    GtkWidget *w = zt_window();
    if (w) gtk_window_move(GTK_WINDOW(w), m->x, m->y);
    return 1;
  }
  if (strcmp(m->type, "window_get_state") == 0) {
    GtkWidget *w = zt_window();
    if (w && m->req_id >= 0) {
      char buf[256];
      snprintf(buf, sizeof(buf),
               "{\"maximized\":%s,\"minimized\":%s,\"fullscreen\":%s,"
               "\"always_on_top\":%s,\"visible\":%s,\"resizable\":%s}",
               gtk_window_is_maximized(GTK_WINDOW(w)) ? "true" : "false",
               "false",
               gtk_window_is_fullscreen(GTK_WINDOW(w)) ? "true" : "false",
               "false",
               gtk_widget_get_visible(GTK_WIDGET(w)) ? "true" : "false",
               gtk_window_get_resizable(GTK_WINDOW(w)) ? "true" : "false");
      zt_reply_query(m->req_id, buf);
    } else if (m->req_id >= 0) {
      zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "notification_send") == 0) {
    char cmd[1024];
    snprintf(cmd, sizeof(cmd), "notify-send %s %s", m->id, m->str2);
    (void)!system(cmd);
    return 1;
  }
  if (strcmp(m->type, "shortcut_register") == 0 ||
      strcmp(m->type, "shortcut_unregister") == 0) {
    /* Global shortcuts need X11 XGrabKey; not implemented on Wayland. */
    if (m->req_id >= 0) zt_reply_query(m->req_id, "false");
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
      GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
      gchar *text = gtk_clipboard_wait_for_text(cb);
      if (text) { zt_reply_string(m->req_id, text); g_free(text); }
      else zt_reply_null(m->req_id);
    }
    return 1;
  }
  if (strcmp(m->type, "clipboard_write_text") == 0) {
    GtkClipboard *cb = gtk_clipboard_get(GDK_SELECTION_CLIPBOARD);
    gtk_clipboard_set_text(cb, m->str2[0] ? m->str2 : m->str, -1);
    return 1;
  }
  return 0;
}

static int init(void) {
  GtkWindow *w = zt_window();
  if (w) {
    GtkWidget *wid = GTK_WIDGET(w);
    g_signal_connect(wid, "configure-event", G_CALLBACK(on_configure), NULL);
    g_signal_connect(wid, "focus-in-event", G_CALLBACK(on_focus_in), NULL);
    g_signal_connect(wid, "focus-out-event", G_CALLBACK(on_focus_out), NULL);
    g_signal_connect(wid, "delete-event", G_CALLBACK(on_delete), NULL);
  }
  return 1;
}

const HostPlatformOps zt_platform = { dispatch, init };
