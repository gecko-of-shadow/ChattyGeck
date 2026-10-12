mod secrets;
mod startup;
mod storage;
mod update;

use std::sync::{
    Mutex,
    atomic::{AtomicBool, Ordering},
};

use serde::Serialize;
use tauri::{
    AppHandle, Emitter, Manager, State, WebviewWindowBuilder, WindowEvent,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

const TRAY_ID: &str = "main";

struct AppState {
    data: storage::DataDir,
    /// Commands run on a thread pool; two saves must not share the temp file at once.
    save_lock: Mutex<()>,
    /// Closing the window hides it in the tray (chats stay connected) instead of quitting.
    close_to_tray: AtomicBool,
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    version: String,
    data_dir: String,
    portable: bool,
    token_store: &'static str,
    platform: &'static str,
}

#[tauri::command]
fn app_info(app: tauri::AppHandle, state: State<'_, AppState>) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: storage::display_path(&state.data.path),
        portable: state.data.portable,
        token_store: secrets::store_name(),
        platform: std::env::consts::OS,
    }
}

#[tauri::command]
fn settings_load(state: State<'_, AppState>) -> Result<Option<serde_json::Value>, String> {
    storage::load_settings(&state.data)
}

#[tauri::command]
fn settings_save(state: State<'_, AppState>, settings: serde_json::Value) -> Result<(), String> {
    let _guard = state.save_lock.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    storage::save_settings(&state.data, &settings)
}

#[tauri::command]
fn session_load() -> Result<Option<String>, String> {
    secrets::load()
}

#[tauri::command]
fn session_save(payload: String) -> Result<(), String> {
    secrets::save(&payload)
}

#[tauri::command]
fn session_clear() -> Result<(), String> {
    secrets::clear()
}

#[tauri::command]
fn set_close_to_tray(state: State<'_, AppState>, enabled: bool) {
    state.close_to_tray.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn set_tray_status(app: AppHandle, mentions: u32) {
    let tooltip = match mentions {
        0 => "ZooChattr".to_string(),
        1 => "ZooChattr · 1 mention".to_string(),
        n => format!("ZooChattr · {n} mentions"),
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_launch_at_login() -> Result<bool, String> {
    startup::get_launch_at_login()
}

#[tauri::command]
fn set_launch_at_login(enabled: bool) -> Result<(), String> {
    startup::set_launch_at_login(enabled)
}

#[tauri::command]
fn check_for_update() -> Result<Option<update::UpdateInfo>, String> {
    update::check_for_update()
}

/// Downloads the portable zip, swaps only the exe (ZooChattr-data stays), then restarts.
#[tauri::command]
fn apply_update(app: AppHandle, download_url: String) -> Result<(), String> {
    update::apply_update(&download_url)?;
    // Helper script waits for this process to exit, then launches the new exe.
    app.exit(0);
    Ok(())
}

fn request_quit_confirm(app: &AppHandle) {
    show_main_window(app);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("quit-requested", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    // A second launch just brings the running copy (maybe hidden in the tray) forward. This plugin must
    // be registered first. On Linux it needs a `unix:` session D-Bus address and panics on anything else.
    let single_instance = cfg!(not(target_os = "linux"))
        || std::env::var("DBUS_SESSION_BUS_ADDRESS").is_ok_and(|address| address.starts_with("unix:"));
    if single_instance {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main_window(app)));
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = storage::resolve_data_dir(app.handle());
            let webview_dir = data.portable.then(|| data.path.join("webview"));
            app.manage(AppState {
                data,
                save_lock: Mutex::new(()),
                close_to_tray: AtomicBool::new(true),
            });

            let window_config = app
                .config()
                .app
                .windows
                .iter()
                .find(|window| window.label == "main")
                .cloned()
                .ok_or("tauri.conf.json is missing the main window")?;
            let mut builder = WebviewWindowBuilder::from_config(app.handle(), &window_config)?;
            if let Some(dir) = webview_dir {
                // Keeps the webview cache inside the portable folder instead of %LOCALAPPDATA%.
                builder = builder.data_directory(dir);
            }
            builder.build()?;

            let show = MenuItem::with_id(app, "show", "Show ZooChattr", true, None::<&str>)?;
            let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit ZooChattr", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &settings, &quit])?;
            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .tooltip("ZooChattr")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "settings" => {
                        show_main_window(app);
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("settings-requested", ());
                        }
                    }
                    "quit" => request_quit_confirm(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                if window.label() == "main" && state.close_to_tray.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            settings_load,
            settings_save,
            session_load,
            session_save,
            session_clear,
            set_close_to_tray,
            set_tray_status,
            quit_app,
            get_launch_at_login,
            set_launch_at_login,
            check_for_update,
            apply_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running ZooChattr");
}
