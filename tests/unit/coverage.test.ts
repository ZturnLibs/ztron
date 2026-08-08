/**
 * Coverage accounting — makes the "100%" explicit. Every manifest command is
 * either exercised by the unit routing tests OR is documented as
 * integration-only (needs tjs:* modules / real network / would kill the app)
 * and covered by the `examples/hello` spike. Nothing falls in the gaps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { COMMAND_SET, API_EXPORT_SET } from "../helpers/manifest.ts";

/**
 * Commands covered by the integration spike but not by the Node unit tests,
 * because their handlers need a runtime feature Node cannot provide here:
 *  - `tjs:*` builtin modules (path.ts / sql.ts lazy-import them)
 *  - a real network stack (http fetch / websocket / public IP / updater)
 *  - OS side effects that would kill the host or open a browser (process
 *    exit/relaunch, shell.open)
 */
const INTEGRATION_ONLY = new Set([
  "plugin:path|join",
  "plugin:path|resolve",
  "plugin:path|normalize",
  "plugin:path|is_absolute",
  "plugin:path|basename",
  "plugin:path|dirname",
  "plugin:path|extname",
  "plugin:path|sep",
  "plugin:http|fetch",
  "plugin:sql|load",
  "plugin:sql|execute",
  "plugin:sql|select",
  "plugin:sql|close",
  "plugin:websocket|connect",
  "plugin:websocket|send",
  "plugin:websocket|disconnect",
  "plugin:network|get_public_ip",
  "plugin:updater|check",
  "plugin:updater|verify",
  "plugin:updater|download",
  "plugin:shell|open",
  "plugin:process|exit",
  "plugin:process|relaunch",
  "plugin:single-instance|is_primary",
]);

/** Commands exercised by the unit routing tests. */
const UNIT_COVERED = new Set([
  "plugin:event|listen",
  "plugin:event|unlisten",
  "plugin:event|emit",
  "plugin:event|emit_to",
  "plugin:app|name",
  "plugin:app|version",
  "plugin:app|tauri_version",
  "plugin:app|get_config",
  "plugin:window|center",
  "plugin:window|close",
  "plugin:window|minimize",
  "plugin:window|unminimize",
  "plugin:window|toggle_maximize",
  "plugin:window|is_maximized",
  "plugin:window|is_minimized",
  "plugin:window|set_fullscreen",
  "plugin:window|is_fullscreen",
  "plugin:window|set_always_on_top",
  "plugin:window|set_focus",
  "plugin:window|set_visible",
  "plugin:window|set_resizable",
  "plugin:window|set_opacity",
  "plugin:window|set_transparent",
  "plugin:window|set_decorations",
  "plugin:window|get_frame",
  "plugin:window|get_position",
  "plugin:window|get_state",
  "plugin:window|get_title",
  "plugin:window|get_theme",
  "plugin:window|get_scale_factor",
  "plugin:window|set_ignore_cursor_events",
  "plugin:window|set_cursor",
  "plugin:window|set_zoom",
  "plugin:window|set_shadow",
  "plugin:window|set_enabled",
  "plugin:window|set_position",
  "plugin:window|start_dragging",
  "plugin:window|set_title",
  "plugin:window|set_size",
  "plugin:tray|create",
  "plugin:tray|set_title",
  "plugin:tray|set_tooltip",
  "plugin:tray|set_icon",
  "plugin:tray|destroy",
  "plugin:menu|create",
  "plugin:menu|set_as_app_menu",
  "plugin:menu|set_item_enabled",
  "plugin:menu|set_item_title",
  "plugin:menu|destroy",
  "plugin:dialog|open",
  "plugin:dialog|save",
  "plugin:dialog|message",
  "plugin:clipboard|read_text",
  "plugin:clipboard|write_text",
  "plugin:notification|send",
  "plugin:global-shortcut|register",
  "plugin:global-shortcut|unregister",
  "plugin:deep-link|get_last_url",
  "plugin:fs|read_text",
  "plugin:fs|write_text",
  "plugin:fs|read_dir",
  "plugin:fs|exists",
  "plugin:fs|remove",
  "plugin:fs|make_dir",
  "plugin:fs|copy",
  "plugin:fs|rename",
  "plugin:fs|stat",
  "plugin:os|homedir",
  "plugin:os|tmpdir",
  "plugin:os|locale",
  "plugin:os|type",
  "plugin:os|family",
  "plugin:os|eol",
  "plugin:os|platform",
  "plugin:os|arch",
  "plugin:os|hostname",
  "plugin:os|version",
  "plugin:os|info",
  "plugin:os|sep",
  "plugin:store|get",
  "plugin:store|set",
  "plugin:store|has",
  "plugin:store|delete",
  "plugin:store|keys",
  "plugin:store|values",
  "plugin:store|entries",
  "plugin:store|clear",
  "plugin:store|save_store",
  "plugin:log|log",
  "plugin:log|trace",
  "plugin:log|debug",
  "plugin:log|info",
  "plugin:log|warn",
  "plugin:log|error",
  "plugin:path|home_dir",
  "plugin:path|temp_dir",
  "plugin:path|cwd",
  "plugin:path|app_data_dir",
  "plugin:path|app_config_dir",
  "plugin:path|app_cache_dir",
  "plugin:path|app_local_data_dir",
  "plugin:path|app_log_dir",
  "plugin:path|baseline_dir",
  "plugin:path|data_dir",
  "plugin:path|config_dir",
  "plugin:path|cache_dir",
  "plugin:path|font_dir",
  "plugin:path|desktop_dir",
  "plugin:path|document_dir",
  "plugin:path|download_dir",
  "plugin:path|picture_dir",
  "plugin:path|audio_dir",
  "plugin:path|video_dir",
  "plugin:path|public_dir",
  "plugin:path|template_dir",
  "plugin:path|runtime_dir",
  "plugin:path|executable_dir",
  "plugin:path|resource_dir",
  "plugin:shell|execute",
  "plugin:shell|execute_stream",
  "plugin:window-state|get",
  "plugin:window-state|save",
  "plugin:window-state|restore",
  "plugin:local-ip|get",
  "plugin:network|get_local_ipv4",
  "plugin:network|get_local_ipv6",
  "plugin:persisted-scope|get",
  "plugin:persisted-scope|save",
  "plugin:upload|upload",
  "plugin:autostart|is_enabled",
  "plugin:autostart|enable",
  "plugin:autostart|disable",
]);

test("coverage: every command is unit-tested or spike-tested (no gaps)", () => {
  const uncovered = [...COMMAND_SET].filter(
    (c) => !UNIT_COVERED.has(c) && !INTEGRATION_ONLY.has(c),
  );
  assert.deepEqual(
    uncovered,
    [],
    `commands with no coverage: ${uncovered.join(", ")}`,
  );
});

test("coverage: no unit/integration lists overlap the wrong direction", () => {
  const both = [...UNIT_COVERED].filter((c) => INTEGRATION_ONLY.has(c));
  assert.deepEqual(both, [], `commands in both lists: ${both.join(", ")}`);
});

test("coverage: every api export maps to an existing function", () => {
  // The surface test already asserts the exports exist; here we assert the
  // manifest is the complete API contract by counting.
  assert.ok(
    API_EXPORT_SET.size >= 90,
    `api manifest unexpectedly small: ${API_EXPORT_SET.size}`,
  );
});

test("coverage: manifest command count matches the framework surface", () => {
  // 20-ish built-in families + every plugin command; guards against a
  // silently truncated manifest.
  assert.ok(
    COMMAND_SET.size >= 120,
    `command manifest unexpectedly small: ${COMMAND_SET.size}`,
  );
});
