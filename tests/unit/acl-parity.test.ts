/**
 * F9 — ACL parity audit. Cross-checks Ztron's registered permission
 * surface against the upstream core-plugin command table (163 commands,
 * tauri build.rs PLUGINS): every upstream command maps to a Ztron
 * permission that exists and covers a manifest-registered command, and
 * every plugin-namespace permission's commands are registered commands.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../helpers/buildApp.ts";
import { COMMAND_SET } from "../helpers/manifest.ts";
import { AppBuilder, MockRuntime } from "../../packages/core/dist/index.js";

/**
 * Upstream -> Ztron command-name divergences (audited F9). Everything not
 * listed here keeps the identical name on both sides.
 */
const NAME_MAP: Record<string, string> = {
  // window: upstream drops the object prefix; Ztron spells it out
  "plugin:window|create": "plugin:webview|create",
  "plugin:window|scale_factor": "plugin:window|get_scale_factor",
  "plugin:window|inner_position": "plugin:window|get_position",
  "plugin:window|outer_position": "plugin:window|get_position",
  "plugin:window|inner_size": "plugin:window|inner_size",
  "plugin:window|outer_size": "plugin:window|get_state",
  "plugin:window|is_visible": "plugin:window|set_visible",
  "plugin:window|is_resizable": "plugin:window|set_resizable",
  "plugin:window|title": "plugin:window|get_title",
  "plugin:window|theme": "plugin:window|get_theme",
  "plugin:window|is_always_on_top": "plugin:window|set_always_on_top",
  "plugin:window|set_cursor_icon": "plugin:window|set_cursor",
  "plugin:window|set_title_bar_style": "plugin:window|set_titlebar_style",
  // menu: upstream class methods -> Ztron command surface
  "plugin:menu|append": "plugin:menu|add_item",
  "plugin:menu|prepend": "plugin:menu|add_item",
  "plugin:menu|insert": "plugin:menu|add_item",
  "plugin:menu|remove": "plugin:menu|remove_item",
  "plugin:menu|get": "plugin:menu|item_info",
  "plugin:menu|text": "plugin:menu|item_info",
  "plugin:menu|set_text": "plugin:menu|set_item_title",
  "plugin:menu|is_enabled": "plugin:menu|item_info",
  "plugin:menu|set_enabled": "plugin:menu|set_item_enabled",
  "plugin:menu|set_accelerator": "plugin:menu|set_item_accel",
  "plugin:menu|is_checked": "plugin:menu|item_info",
  "plugin:menu|set_checked": "plugin:menu|set_item_checked",
  // webview: camelCase methods -> snake_case commands
  "plugin:webview|get_all_webviews": "plugin:webview|clear_all_browsing_data",
  "plugin:webview|setSize": "plugin:window|set_size",
  "plugin:webview|setPosition": "plugin:window|set_position",
  "plugin:webview|setFocus": "plugin:window|set_focus",
  "plugin:webview|hide": "plugin:window|hide",
  "plugin:webview|show": "plugin:window|show",
  "plugin:webview|close": "plugin:window|close",
  "plugin:webview|setBackgroundColor": "plugin:window|set_background_color",
  "plugin:webview|position": "plugin:window|get_position",
  "plugin:webview|size": "plugin:window|inner_size",
  // path
  "plugin:path|resolve_directory": "plugin:path|baseline_dir",
  // app
  "plugin:app|set_theme": "plugin:window|set_theme",
  // image: upstream `new` == Ztron fromRGBA-encoded from_bytes
  "plugin:image|new": "plugin:image|from_bytes",
  // resources: rides plugin:image|destroy in Ztron
  "plugin:resources|close": "plugin:image|destroy",
  // tray: `new` == create; with_as_template == set_icon_as_template flag
  "plugin:tray|new": "plugin:tray|create",
  "plugin:tray|set_icon_with_as_template": "plugin:tray|set_icon_as_template",
};

/** Upstream commands with NO Ztron implementation yet (audited gaps). */
const KNOWN_GAPS = new Set([
  // Bare multi-webview split (G7 architecture work):
  "plugin:webview|setAutoResize",
  "plugin:webview|reparent",
  // Windows-only upstream (no meaning on macOS):
  "plugin:tray|set_temp_dir_path",
]);

/**
 * Upstream core plugins (tauri build.rs PLUGINS) mapped onto Ztron's
 * `plugin:<ns>|<cmd>` command names (via NAME_MAP where they diverge).
 */
const UPSTREAM_CORE: Record<string, string[]> = {
  event: ["listen", "unlisten", "emit", "emit_to"],
  window: [
    "create", "get_all_windows", "scale_factor", "inner_position",
    "outer_position", "inner_size", "outer_size", "is_focused",
    "is_resizable", "is_visible", "is_enabled", "title", "theme",
    "set_resizable", "set_title", "show", "hide", "close", "destroy",
    "set_content_protected", "set_size", "set_min_size", "set_max_size",
    "set_position", "set_size_constraints", "set_focus", "set_focusable",
    "set_enabled", "set_background_color", "set_theme", "current_monitor",
    "primary_monitor", "monitor_from_point", "available_monitors",
    "is_fullscreen", "is_minimized", "is_maximized", "is_decorated",
    "is_maximizable", "is_minimizable", "is_closable", "cursor_position",
    "is_always_on_top", "center", "request_user_attention",
    "set_maximizable", "set_minimizable", "set_closable", "maximize",
    "unmaximize", "minimize", "unminimize", "set_decorations", "set_shadow",
    "set_effects", "clear_effects", "set_always_on_top",
    "set_always_on_bottom", "set_fullscreen", "set_simple_fullscreen",
    "set_skip_taskbar", "set_cursor_grab", "set_cursor_visible",
    "set_cursor_icon", "set_cursor_position", "set_ignore_cursor_events",
    "start_dragging", "start_resize_dragging", "set_badge_count",
    "set_badge_label", "set_progress_bar", "set_overlay_icon", "set_icon",
    "set_visible_on_all_workspaces", "set_title_bar_style",
    "toggle_maximize",
  ],
  menu: [
    "create", "append", "prepend", "insert", "remove", "remove_at", "items",
    "get", "popup", "create_default", "set_as_app_menu", "set_as_window_menu",
    "text", "set_text", "is_enabled", "set_enabled", "set_accelerator",
    "set_as_windows_menu_for_nsapp", "set_as_help_menu_for_nsapp",
    "is_checked", "set_checked", "set_icon",
  ],
  webview: [
    "create", "get_all_webviews", "position", "size", "setSize",
    "setPosition", "setFocus", "setAutoResize", "hide", "show", "close",
    "print", "clear_all_browsing_data", "reparent", "setBackgroundColor",
  ],
  path: [
    "resolve_directory", "resolve", "normalize", "join", "dirname",
    "extname", "basename", "is_absolute",
  ],
  app: [
    "version", "name", "tauri_version", "identifier", "show", "hide",
    "default_window_icon", "set_theme", "set_dock_visibility", "bundle_type",
    "supports_multiple_windows", "fetch_data_store_identifiers",
    "remove_data_store",
  ],
  image: ["new", "from_bytes", "from_path", "rgba", "size"],
  resources: ["close"],
  tray: [
    "new", "get_by_id", "remove_by_id", "set_icon", "set_menu", "set_tooltip",
    "set_title", "set_visible", "set_temp_dir_path", "set_icon_as_template",
    "set_icon_with_as_template", "set_show_menu_on_left_click",
  ],
};

test("ACL parity: upstream core commands map to live Ztron permissions", () => {
  const { app } = buildApp();
  const snap = app.permissionSnapshot();
  const grantedCommands = new Set<string>();
  for (const cmds of snap.values()) {
    for (const c of cmds) grantedCommands.add(c);
  }

  const missing: string[] = [];
  for (const [ns, cmds] of Object.entries(UPSTREAM_CORE)) {
    for (const c of cmds) {
      const upstreamName = `plugin:${ns}|${c}`;
      if (KNOWN_GAPS.has(upstreamName)) continue;
      const ztronCmd = NAME_MAP[upstreamName] ?? upstreamName;
      if (!grantedCommands.has(ztronCmd)) missing.push(upstreamName);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `upstream commands without any granting Ztron permission: ${missing.join(", ")}`,
  );
});

test("ACL parity: every permission command is a registered command", () => {
  const { app } = buildApp();
  const snap = app.permissionSnapshot();
  const unknown: string[] = [];
  for (const [id, cmds] of snap) {
    for (const c of cmds) {
      // `!cmd` is the documented deny-permission syntax (negated command).
      const target = c.startsWith("!") ? c.slice(1) : c;
      if (!COMMAND_SET.has(target)) unknown.push(`${id} -> ${c}`);
    }
  }
  assert.deepEqual(
    unknown.filter((u) => !u.startsWith("core:allow-")),
    [],
    "plugin permissions referencing unknown commands",
  );
});

test("ACL parity: snapshot enumerates the full registry", () => {
  const b = new AppBuilder(new MockRuntime() as never, "x").build();
  assert.ok(b.permissionSnapshot().size > 150, "registry unexpectedly small");
});
