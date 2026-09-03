# Command Surface Reference

Source: `tests/helpers/manifest.ts` — mirrors the runtime registration surface one-to-one; the surface tests guarantee no missing and no extra commands.

## plugin:event (4 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:event\|listen` | `event` | [`event`](./api/event) |
| `plugin:event\|unlisten` | `event` | [`event`](./api/event) |
| `plugin:event\|emit` | `event` | [`event`](./api/event) |
| `plugin:event\|emit_to` | `event` | [`event`](./api/event) |

## plugin:app (13 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:app\|name` | `app` | [`app`](./api/app) |
| `plugin:app\|version` | `app` | [`app`](./api/app) |
| `plugin:app\|tauri_version` | `app` | [`app`](./api/app) |
| `plugin:app\|get_config` | `app` | [`app`](./api/app) |
| `plugin:app\|identifier` | `app` | [`app`](./api/app) |
| `plugin:app\|show` | `app` | [`app`](./api/app) |
| `plugin:app\|hide` | `app` | [`app`](./api/app) |
| `plugin:app\|set_dock_visibility` | `app` | [`app`](./api/app) |
| `plugin:app\|bundle_type` | `app` | [`app`](./api/app) |
| `plugin:app\|supports_multiple_windows` | `app` | [`app`](./api/app) |
| `plugin:app\|default_window_icon` | `app` | [`app`](./api/app) |
| `plugin:app\|fetch_data_store_identifiers` | `app` | [`app`](./api/app) |
| `plugin:app\|remove_data_store` | `app` | [`app`](./api/app) |

## plugin:webview (7 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:webview\|get_all_webviews` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|capabilities` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|create` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|clear_all_browsing_data` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|print` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|set_background_color` | `webview` | [`webview-window`](./api/webview-window) |
| `plugin:webview\|toggle_devtools` | `webview` | [`webview-window`](./api/webview-window) |

## plugin:process (2 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:process\|exit` | `process` | [`process`](./api/process) |
| `plugin:process\|relaunch` | `process` | [`process`](./api/process) |

## plugin:window (85 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:window\|show` | `window` | [`window`](./api/window) |
| `plugin:window\|hide` | `window` | [`window`](./api/window) |
| `plugin:window\|close` | `window` | [`window`](./api/window) |
| `plugin:window\|prevent_close` | `window` | [`window`](./api/window) |
| `plugin:window\|destroy` | `window` | [`window`](./api/window) |
| `plugin:window\|minimize` | `window` | [`window`](./api/window) |
| `plugin:window\|unminimize` | `window` | [`window`](./api/window) |
| `plugin:window\|toggle_maximize` | `window` | [`window`](./api/window) |
| `plugin:window\|is_maximized` | `window` | [`window`](./api/window) |
| `plugin:window\|is_minimized` | `window` | [`window`](./api/window) |
| `plugin:window\|set_fullscreen` | `window` | [`window`](./api/window) |
| `plugin:window\|is_fullscreen` | `window` | [`window`](./api/window) |
| `plugin:window\|set_always_on_top` | `window` | [`window`](./api/window) |
| `plugin:window\|center` | `window` | [`window`](./api/window) |
| `plugin:window\|set_focus` | `window` | [`window`](./api/window) |
| `plugin:window\|set_visible` | `window` | [`window`](./api/window) |
| `plugin:window\|set_resizable` | `window` | [`window`](./api/window) |
| `plugin:window\|set_opacity` | `window` | [`window`](./api/window) |
| `plugin:window\|set_transparent` | `window` | [`window`](./api/window) |
| `plugin:window\|set_decorations` | `window` | [`window`](./api/window) |
| `plugin:window\|get_frame` | `window` | [`window`](./api/window) |
| `plugin:window\|get_position` | `window` | [`window`](./api/window) |
| `plugin:window\|inner_position` | `window` | [`window`](./api/window) |
| `plugin:window\|get_state` | `window` | [`window`](./api/window) |
| `plugin:window\|get_title` | `window` | [`window`](./api/window) |
| `plugin:window\|get_theme` | `window` | [`window`](./api/window) |
| `plugin:window\|get_scale_factor` | `window` | [`window`](./api/window) |
| `plugin:window\|set_ignore_cursor_events` | `window` | [`window`](./api/window) |
| `plugin:window\|set_cursor` | `window` | [`window`](./api/window) |
| `plugin:window\|set_zoom` | `window` | [`window`](./api/window) |
| `plugin:window\|set_shadow` | `window` | [`window`](./api/window) |
| `plugin:window\|set_enabled` | `window` | [`window`](./api/window) |
| `plugin:window\|set_position` | `window` | [`window`](./api/window) |
| `plugin:window\|set_bounds` | `window` | [`window`](./api/window) |
| `plugin:window\|set_size_constraints` | `window` | [`window`](./api/window) |
| `plugin:window\|set_min_size` | `window` | [`window`](./api/window) |
| `plugin:window\|set_max_size` | `window` | [`window`](./api/window) |
| `plugin:window\|set_minimizable` | `window` | [`window`](./api/window) |
| `plugin:window\|is_minimizable` | `window` | [`window`](./api/window) |
| `plugin:window\|set_maximizable` | `window` | [`window`](./api/window) |
| `plugin:window\|is_maximizable` | `window` | [`window`](./api/window) |
| `plugin:window\|set_closable` | `window` | [`window`](./api/window) |
| `plugin:window\|is_closable` | `window` | [`window`](./api/window) |
| `plugin:window\|is_decorated` | `window` | [`window`](./api/window) |
| `plugin:window\|is_focused` | `window` | [`window`](./api/window) |
| `plugin:window\|set_skip_taskbar` | `window` | [`window`](./api/window) |
| `plugin:window\|set_always_on_bottom` | `window` | [`window`](./api/window) |
| `plugin:window\|set_content_protected` | `window` | [`window`](./api/window) |
| `plugin:window\|request_user_attention` | `window` | [`window`](./api/window) |
| `plugin:window\|set_progress_bar` | `window` | [`window`](./api/window) |
| `plugin:window\|set_badge_count` | `window` | [`window`](./api/window) |
| `plugin:window\|set_badge_label` | `window` | [`window`](./api/window) |
| `plugin:window\|set_background_color` | `window` | [`window`](./api/window) |
| `plugin:window\|set_titlebar_style` | `window` | [`window`](./api/window) |
| `plugin:window\|maximize` | `window` | [`window`](./api/window) |
| `plugin:window\|unmaximize` | `window` | [`window`](./api/window) |
| `plugin:window\|is_enabled` | `window` | [`window`](./api/window) |
| `plugin:window\|inner_size` | `window` | [`window`](./api/window) |
| `plugin:window\|set_focusable` | `window` | [`window`](./api/window) |
| `plugin:window\|set_cursor_visible` | `window` | [`window`](./api/window) |
| `plugin:window\|cursor_position` | `window` | [`window`](./api/window) |
| `plugin:window\|set_cursor_position` | `window` | [`window`](./api/window) |
| `plugin:window\|set_theme` | `window` | [`window`](./api/window) |
| `plugin:window\|set_visible_on_all_workspaces` | `window` | [`window`](./api/window) |
| `plugin:window\|set_simple_fullscreen` | `window` | [`window`](./api/window) |
| `plugin:window\|get_all_windows` | `window` | [`window`](./api/window) |
| `plugin:window\|available_monitors` | `window` | [`window`](./api/window) |
| `plugin:window\|primary_monitor` | `window` | [`window`](./api/window) |
| `plugin:window\|current_monitor` | `window` | [`window`](./api/window) |
| `plugin:window\|monitor_from_point` | `window` | [`window`](./api/window) |
| `plugin:window\|set_traffic_light_position` | `window` | [`window`](./api/window) |
| `plugin:window\|start_dragging` | `window` | [`window`](./api/window) |
| `plugin:window\|start_resize_dragging` | `window` | [`window`](./api/window) |
| `plugin:window\|set_file_drop_enabled` | `window` | [`window`](./api/window) |
| `plugin:window\|set_cursor_grab` | `window` | [`window`](./api/window) |
| `plugin:window\|set_icon` | `window` | [`window`](./api/window) |
| `plugin:window\|set_overlay_icon` | `window` | [`window`](./api/window) |
| `plugin:window\|set_effects` | `window` | [`window`](./api/window) |
| `plugin:window\|clear_effects` | `window` | [`window`](./api/window) |
| `plugin:window\|set_title` | `window` | [`window`](./api/window) |
| `plugin:window\|set_size` | `window` | [`window`](./api/window) |
| `plugin:window\|activity_name` | `window` | [`window`](./api/window) |
| `plugin:window\|set_activity_name` | `window` | [`window`](./api/window) |
| `plugin:window\|scene_identifier` | `window` | [`window`](./api/window) |
| `plugin:window\|set_scene_identifier` | `window` | [`window`](./api/window) |

## plugin:tray (11 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:tray\|create` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_title` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_tooltip` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_icon` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|destroy` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_menu` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_visible` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_icon_as_template` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|get_by_id` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|remove_by_id` | `tray` | [`tray`](./api/tray) |
| `plugin:tray\|set_show_menu_on_left_click` | `tray` | [`tray`](./api/tray) |

## plugin:resources (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:resources\|close` | `resources` | — |

## plugin:menu (19 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:menu\|create` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_as_app_menu` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_item_enabled` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_item_title` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_item_checked` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_item_accel` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|popup` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|add_item` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|remove_item` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|item_info` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|destroy` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|add_submenu` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|remove_at` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|items` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|create_default` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_as_window_menu` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_as_windows_menu_for_nsapp` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_as_help_menu_for_nsapp` | `menu` | [`menu`](./api/menu) |
| `plugin:menu\|set_icon` | `menu` | [`menu`](./api/menu) |

## plugin:dialog (5 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:dialog\|open` | `dialog` | [`dialog`](./api/dialog) |
| `plugin:dialog\|save` | `dialog` | [`dialog`](./api/dialog) |
| `plugin:dialog\|message` | `dialog` | [`dialog`](./api/dialog) |
| `plugin:dialog\|ask` | `dialog` | [`dialog`](./api/dialog) |
| `plugin:dialog\|confirm` | `dialog` | [`dialog`](./api/dialog) |

## plugin:clipboard (7 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:clipboard\|read_text` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|write_text` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|read_image` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|write_image` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|read_html` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|write_html` | `clipboard` | [`clipboard`](./api/clipboard) |
| `plugin:clipboard\|clear` | `clipboard` | [`clipboard`](./api/clipboard) |

## plugin:notification (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:notification\|send` | `notification` | [`notification`](./api/notification) |
| `plugin:notification\|is_permission_granted` | `notification` | [`notification`](./api/notification) |
| `plugin:notification\|request_permission` | `notification` | [`notification`](./api/notification) |

## plugin:global-shortcut (5 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:global-shortcut\|register` | `global-shortcut` | [`global-shortcut`](./api/global-shortcut) |
| `plugin:global-shortcut\|unregister` | `global-shortcut` | [`global-shortcut`](./api/global-shortcut) |
| `plugin:global-shortcut\|is_registered` | `global-shortcut` | [`global-shortcut`](./api/global-shortcut) |
| `plugin:global-shortcut\|register_all` | `global-shortcut` | [`global-shortcut`](./api/global-shortcut) |
| `plugin:global-shortcut\|unregister_all` | `global-shortcut` | [`global-shortcut`](./api/global-shortcut) |

## plugin:deep-link (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:deep-link\|get_last_url` | `deep-link` | [`deep-link`](./api/deep-link) |

## plugin:image (5 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:image\|from_bytes` | `image` | [`image`](./api/image) |
| `plugin:image\|from_path` | `image` | [`image`](./api/image) |
| `plugin:image\|rgba` | `image` | [`image`](./api/image) |
| `plugin:image\|size` | `image` | [`image`](./api/image) |
| `plugin:image\|destroy` | `image` | [`image`](./api/image) |

## plugin:fs (23 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:fs\|read_text` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|write_text` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|read_file` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|write_file` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|read_dir` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|exists` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|remove` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|make_dir` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|copy` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|rename` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|stat` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|watch` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|unwatch` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|open` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|read` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|seek` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|write` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|flush` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|close` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|truncate` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|lstat` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|read_link` | `fs` | [`fs`](./api/fs) |
| `plugin:fs\|chmod` | `fs` | [`fs`](./api/fs) |

## plugin:path (32 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:path\|join` | `path` | [`path`](./api/path) |
| `plugin:path\|resolve` | `path` | [`path`](./api/path) |
| `plugin:path\|normalize` | `path` | [`path`](./api/path) |
| `plugin:path\|is_absolute` | `path` | [`path`](./api/path) |
| `plugin:path\|basename` | `path` | [`path`](./api/path) |
| `plugin:path\|dirname` | `path` | [`path`](./api/path) |
| `plugin:path\|extname` | `path` | [`path`](./api/path) |
| `plugin:path\|sep` | `path` | [`path`](./api/path) |
| `plugin:path\|home_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|temp_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|cwd` | `path` | [`path`](./api/path) |
| `plugin:path\|app_data_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|app_config_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|app_cache_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|app_local_data_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|app_log_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|baseline_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|data_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|config_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|cache_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|font_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|desktop_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|document_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|download_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|picture_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|audio_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|video_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|public_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|template_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|runtime_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|executable_dir` | `path` | [`path`](./api/path) |
| `plugin:path\|resource_dir` | `path` | [`path`](./api/path) |

## plugin:http (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:http\|fetch` | `http` | [`http`](./api/http) |

## plugin:os (12 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:os\|info` | `os` | [`os`](./api/os) |
| `plugin:os\|platform` | `os` | [`os`](./api/os) |
| `plugin:os\|arch` | `os` | [`os`](./api/os) |
| `plugin:os\|hostname` | `os` | [`os`](./api/os) |
| `plugin:os\|version` | `os` | [`os`](./api/os) |
| `plugin:os\|homedir` | `os` | [`os`](./api/os) |
| `plugin:os\|tmpdir` | `os` | [`os`](./api/os) |
| `plugin:os\|sep` | `os` | [`os`](./api/os) |
| `plugin:os\|locale` | `os` | [`os`](./api/os) |
| `plugin:os\|type` | `os` | [`os`](./api/os) |
| `plugin:os\|family` | `os` | [`os`](./api/os) |
| `plugin:os\|eol` | `os` | [`os`](./api/os) |

## plugin:store (16 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:store\|get` | `store` | [`store`](./api/store) |
| `plugin:store\|set` | `store` | [`store`](./api/store) |
| `plugin:store\|has` | `store` | [`store`](./api/store) |
| `plugin:store\|delete` | `store` | [`store`](./api/store) |
| `plugin:store\|clear` | `store` | [`store`](./api/store) |
| `plugin:store\|keys` | `store` | [`store`](./api/store) |
| `plugin:store\|values` | `store` | [`store`](./api/store) |
| `plugin:store\|entries` | `store` | [`store`](./api/store) |
| `plugin:store\|save_store` | `store` | [`store`](./api/store) |
| `plugin:store\|load` | `store` | [`store`](./api/store) |
| `plugin:store\|save` | `store` | [`store`](./api/store) |
| `plugin:store\|save_to` | `store` | [`store`](./api/store) |
| `plugin:store\|reset` | `store` | [`store`](./api/store) |
| `plugin:store\|close` | `store` | [`store`](./api/store) |
| `plugin:store\|set_auto_save` | `store` | [`store`](./api/store) |
| `plugin:store\|on_change` | `store` | [`store`](./api/store) |

## plugin:localhost (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:localhost\|start` | `localhost` | [`localhost`](./api/localhost) |
| `plugin:localhost\|stop` | `localhost` | [`localhost`](./api/localhost) |
| `plugin:localhost\|status` | `localhost` | [`localhost`](./api/localhost) |

## plugin:stronghold (11 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:stronghold\|load` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|get` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|set` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|has` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|remove` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|keys` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|clear` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|save` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|save_to` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|close` | `stronghold` | [`stronghold`](./api/stronghold) |
| `plugin:stronghold\|reload` | `stronghold` | [`stronghold`](./api/stronghold) |

## plugin:barcode-scanner (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:barcode-scanner\|scan` | `barcode-scanner` | [`barcode-scanner`](./api/barcode-scanner) |

## plugin:biometric (2 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:biometric\|authenticate` | `biometric` | [`biometric`](./api/biometric) |
| `plugin:biometric\|status` | `biometric` | [`biometric`](./api/biometric) |

## plugin:geolocation (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:geolocation\|get_current_position` | `geolocation` | [`geolocation`](./api/geolocation) |
| `plugin:geolocation\|watch_position` | `geolocation` | [`geolocation`](./api/geolocation) |
| `plugin:geolocation\|clear_watch` | `geolocation` | [`geolocation`](./api/geolocation) |

## plugin:haptics (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:haptics\|impact_occurred` | `haptics` | [`haptics`](./api/haptics) |
| `plugin:haptics\|notification_occurred` | `haptics` | [`haptics`](./api/haptics) |
| `plugin:haptics\|selection_changed` | `haptics` | [`haptics`](./api/haptics) |

## plugin:nfc (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:nfc\|scan` | `nfc` | [`nfc`](./api/nfc) |
| `plugin:nfc\|write` | `nfc` | [`nfc`](./api/nfc) |
| `plugin:nfc\|stop` | `nfc` | [`nfc`](./api/nfc) |

## plugin:log (8 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:log\|log` | `log` | [`log`](./api/log) |
| `plugin:log\|trace` | `log` | [`log`](./api/log) |
| `plugin:log\|debug` | `log` | [`log`](./api/log) |
| `plugin:log\|info` | `log` | [`log`](./api/log) |
| `plugin:log\|warn` | `log` | [`log`](./api/log) |
| `plugin:log\|error` | `log` | [`log`](./api/log) |
| `plugin:log\|__listener` | `log` | [`log`](./api/log) |
| `plugin:log\|__unlistener` | `log` | [`log`](./api/log) |

## plugin:shell (6 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:shell\|execute` | `shell` | [`shell`](./api/shell) |
| `plugin:shell\|execute_stream` | `shell` | [`shell`](./api/shell) |
| `plugin:shell\|spawn_stream` | `shell` | [`shell`](./api/shell) |
| `plugin:shell\|write_stdin` | `shell` | [`shell`](./api/shell) |
| `plugin:shell\|kill` | `shell` | [`shell`](./api/shell) |
| `plugin:shell\|open` | `shell` | [`shell`](./api/shell) |

## plugin:cli (2 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:cli\|get_argv` | `cli` | [`cli`](./api/cli) |
| `plugin:cli\|get_matches` | `cli` | [`cli`](./api/cli) |

## plugin:opener (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:opener\|open_url` | `opener` | [`opener`](./api/opener) |
| `plugin:opener\|open_path` | `opener` | [`opener`](./api/opener) |
| `plugin:opener\|reveal_item_in_dir` | `opener` | [`opener`](./api/opener) |

## plugin:sql (4 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:sql\|load` | `sql` | [`sql`](./api/sql) |
| `plugin:sql\|execute` | `sql` | [`sql`](./api/sql) |
| `plugin:sql\|select` | `sql` | [`sql`](./api/sql) |
| `plugin:sql\|close` | `sql` | [`sql`](./api/sql) |

## plugin:autostart (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:autostart\|is_enabled` | `autostart` | [`autostart`](./api/autostart) |
| `plugin:autostart\|enable` | `autostart` | [`autostart`](./api/autostart) |
| `plugin:autostart\|disable` | `autostart` | [`autostart`](./api/autostart) |

## plugin:window-state (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:window-state\|get` | `window-state` | [`window-state`](./api/window-state) |
| `plugin:window-state\|save` | `window-state` | [`window-state`](./api/window-state) |
| `plugin:window-state\|restore` | `window-state` | [`window-state`](./api/window-state) |

## plugin:single-instance (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:single-instance\|is_primary` | `single-instance` | [`single-instance`](./api/single-instance) |

## plugin:websocket (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:websocket\|connect` | `websocket` | [`websocket`](./api/websocket) |
| `plugin:websocket\|send` | `websocket` | [`websocket`](./api/websocket) |
| `plugin:websocket\|disconnect` | `websocket` | [`websocket`](./api/websocket) |

## plugin:local-ip (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:local-ip\|get` | `local-ip` | [`local-ip`](./api/local-ip) |

## plugin:network (3 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:network\|get_local_ipv4` | `network` | [`network`](./api/network) |
| `plugin:network\|get_local_ipv6` | `network` | [`network`](./api/network) |
| `plugin:network\|get_public_ip` | `network` | [`network`](./api/network) |

## plugin:upload (1 command)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:upload\|upload` | `upload` | [`upload`](./api/upload) |

## plugin:persisted-scope (2 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:persisted-scope\|get` | `persisted-scope` | [`persisted-scope`](./api/persisted-scope) |
| `plugin:persisted-scope\|save` | `persisted-scope` | [`persisted-scope`](./api/persisted-scope) |

## plugin:updater (6 commands)

| Command | Permission owner (group) | API module |
| --- | --- | --- |
| `plugin:updater\|check` | `updater` | [`updater`](./api/updater) |
| `plugin:updater\|verify` | `updater` | [`updater`](./api/updater) |
| `plugin:updater\|download` | `updater` | [`updater`](./api/updater) |
| `plugin:updater\|verify_signature` | `updater` | [`updater`](./api/updater) |
| `plugin:updater\|install_stream` | `updater` | [`updater`](./api/updater) |
| `plugin:updater\|install` | `updater` | [`updater`](./api/updater) |

适用版本：`ztron 0.3.0`
