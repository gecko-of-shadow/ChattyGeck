mod secrets;
mod storage;

use serde::Serialize;
use tauri::{Manager, State, WebviewWindowBuilder};

struct AppState {
    data: storage::DataDir,
    /// Commands run on a thread pool; two saves must not share the temp file at once.
    save_lock: std::sync::Mutex<()>,
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
        data_dir: state.data.path.display().to_string(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data = storage::resolve_data_dir(app.handle());
            let webview_dir = data.portable.then(|| data.path.join("webview"));
            app.manage(AppState {
                data,
                save_lock: std::sync::Mutex::new(()),
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
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            settings_load,
            settings_save,
            session_load,
            session_save,
            session_clear
        ])
        .run(tauri::generate_context!())
        .expect("error while running ChatDeck");
}
