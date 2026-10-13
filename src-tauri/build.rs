fn main() {
    // Gate every #[tauri::command] behind allow-*/deny-* so capabilities can
    // fence Settings away from session_load and apply_update.
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "app_info",
                "settings_load",
                "settings_save",
                "chat_history_load",
                "chat_history_save",
                "chat_history_append",
                "chat_history_clear",
                "session_load",
                "session_save",
                "session_clear",
                "auth_display",
                "set_close_to_tray",
                "set_tray_status",
                "quit_app",
                "finish_exit",
                "get_launch_at_login",
                "set_launch_at_login",
                "check_for_update",
                "apply_update",
                "open_settings_window_cmd",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
