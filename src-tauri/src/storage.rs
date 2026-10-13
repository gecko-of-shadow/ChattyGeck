use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const PORTABLE_DIR: &str = "ZooChattr-data";
const SETTINGS_FILE: &str = "settings.json";
const WINDOW_STATE_FILE: &str = "window.json";

/// Last known main-window placement (portable-friendly; lives next to settings).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowState {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub maximized: bool,
}

impl WindowState {
    pub fn looks_usable(&self) -> bool {
        self.width >= 360
            && self.height >= 420
            && self.width <= 10_000
            && self.height <= 10_000
            // Keep a sliver of the window on a typical desktop so a dead monitor can't hide it.
            && self.x > -((self.width as i32).saturating_sub(80))
            && self.y > -80
            && self.x < 16_000
            && self.y < 16_000
    }
}

pub struct DataDir {
    pub path: PathBuf,
    /// True when data lives next to the executable (portable mode).
    pub portable: bool,
}

/// Portable first: `<exe folder>/ZooChattr-data`. Falls back to the per-user app data folder
/// when the exe sits somewhere read-only (e.g. Program Files).
pub fn resolve_data_dir(app: &AppHandle) -> DataDir {
    if let Some(dir) = std::env::var_os("ZOOCHATTR_DATA_DIR") {
        let path = PathBuf::from(dir);
        if ensure_writable(&path) {
            return DataDir { path, portable: true };
        }
    }

    let beside_exe = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join(PORTABLE_DIR)));
    if let Some(path) = beside_exe {
        if ensure_writable(&path) {
            return DataDir { path, portable: true };
        }
    }

    let path = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("ZooChattr"));
    let _ = fs::create_dir_all(&path);
    DataDir {
        path,
        portable: false,
    }
}

fn ensure_writable(path: &Path) -> bool {
    if fs::create_dir_all(path).is_err() {
        return false;
    }
    let probe = path.join(".write-test");
    let ok = fs::write(&probe, b"ok").is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

/// Paths as shown to the user. The home folder is abbreviated so screenshots and streams
/// don't reveal the Windows account name.
pub fn display_path(path: &Path) -> String {
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
    if let Some(rest) = home.and_then(|home| path.strip_prefix(PathBuf::from(home)).ok()) {
        let prefix = if cfg!(windows) { "%USERPROFILE%" } else { "~" };
        if rest.as_os_str().is_empty() {
            return prefix.to_string();
        }
        return format!("{prefix}{}{}", std::path::MAIN_SEPARATOR, rest.display());
    }
    path.display().to_string()
}

pub fn load_settings(data: &DataDir) -> Result<Option<serde_json::Value>, String> {
    let file = data.path.join(SETTINGS_FILE);
    let text = match fs::read_to_string(&file) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("Couldn't read {}: {err}", display_path(&file))),
    };

    match serde_json::from_str(&text) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            // Keep the unreadable file around for inspection instead of silently overwriting it.
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default();
            let _ = fs::rename(&file, data.path.join(format!("settings.corrupt-{stamp}.json")));
            Ok(None)
        }
    }
}

pub fn save_settings(data: &DataDir, value: &serde_json::Value) -> Result<(), String> {
    let file = data.path.join(SETTINGS_FILE);
    let tmp = data.path.join(format!("{SETTINGS_FILE}.tmp"));
    let text = serde_json::to_string_pretty(value).map_err(|err| err.to_string())?;
    fs::write(&tmp, text).map_err(|err| format!("Couldn't write {}: {err}", display_path(&tmp)))?;
    fs::rename(&tmp, &file).map_err(|err| format!("Couldn't save {}: {err}", display_path(&file)))
}

pub fn load_window_state(data: &DataDir) -> Option<WindowState> {
    let file = data.path.join(WINDOW_STATE_FILE);
    let text = fs::read_to_string(&file).ok()?;
    let state: WindowState = serde_json::from_str(&text).ok()?;
    state.looks_usable().then_some(state)
}

pub fn save_window_state(data: &DataDir, state: &WindowState) -> Result<(), String> {
    if !state.looks_usable() {
        return Ok(());
    }
    let file = data.path.join(WINDOW_STATE_FILE);
    let tmp = data.path.join(format!("{WINDOW_STATE_FILE}.tmp"));
    let text = serde_json::to_string_pretty(state).map_err(|err| err.to_string())?;
    fs::write(&tmp, text).map_err(|err| format!("Couldn't write {}: {err}", display_path(&tmp)))?;
    fs::rename(&tmp, &file).map_err(|err| format!("Couldn't save {}: {err}", display_path(&file)))
}

const CHAT_DIR: &str = "chat";

fn chat_dir(data: &DataDir) -> PathBuf {
    data.path.join(CHAT_DIR)
}

/// Channel login → safe file name (Twitch logins are already [a-z0-9_]).
fn chat_file(data: &DataDir, channel: &str) -> Result<PathBuf, String> {
    let safe: String = channel
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '_' { c } else { '_' })
        .collect();
    if safe.is_empty() || safe.len() > 64 {
        return Err("That channel name can't be saved.".into());
    }
    Ok(chat_dir(data).join(format!("{safe}.json")))
}

pub fn load_chat_history(data: &DataDir, channel: &str) -> Result<Option<serde_json::Value>, String> {
    let file = chat_file(data, channel)?;
    let text = match fs::read_to_string(&file) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("Couldn't read chat history: {err}")),
    };
    match serde_json::from_str(&text) {
        Ok(value) => Ok(Some(value)),
        Err(_) => {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or_default();
            let _ = fs::rename(&file, chat_dir(data).join(format!("{channel}.corrupt-{stamp}.json")));
            Ok(None)
        }
    }
}

pub fn save_chat_history(data: &DataDir, channel: &str, messages: &serde_json::Value) -> Result<(), String> {
    let dir = chat_dir(data);
    fs::create_dir_all(&dir).map_err(|err| format!("Couldn't make the chat history folder: {err}"))?;
    let file = chat_file(data, channel)?;
    let tmp = file.with_extension("json.tmp");
    let text = serde_json::to_string(messages).map_err(|err| err.to_string())?;
    fs::write(&tmp, text).map_err(|err| format!("Couldn't write chat history: {err}"))?;
    fs::rename(&tmp, &file).map_err(|err| format!("Couldn't save chat history: {err}"))
}

pub fn clear_chat_history(data: &DataDir, channel: Option<&str>) -> Result<(), String> {
    if let Some(name) = channel {
        let file = chat_file(data, name)?;
        match fs::remove_file(&file) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!("Couldn't clear chat history: {err}")),
        }
    } else {
        let dir = chat_dir(data);
        match fs::remove_dir_all(&dir) {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(format!("Couldn't clear chat history: {err}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_data_dir(name: &str) -> DataDir {
        let path = std::env::temp_dir().join(format!("zoochattr-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        DataDir {
            path,
            portable: true,
        }
    }

    #[test]
    fn settings_round_trip() {
        let data = temp_data_dir("roundtrip");
        assert!(load_settings(&data).unwrap().is_none());
        let value = serde_json::json!({ "channels": ["xqc", "shroud"], "mode": "merged" });
        save_settings(&data, &value).unwrap();
        assert_eq!(load_settings(&data).unwrap(), Some(value));
    }

    #[test]
    fn display_path_hides_the_home_folder() {
        let home = PathBuf::from(std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap());
        let shown = display_path(&home.join("Downloads").join("ZooChattr-data"));
        assert!(!shown.contains(&*home.to_string_lossy()), "{shown}");
        assert!(shown.ends_with("ZooChattr-data"), "{shown}");
        assert_eq!(display_path(Path::new("/opt/elsewhere")), Path::new("/opt/elsewhere").display().to_string());
    }

    #[test]
    fn corrupt_settings_are_set_aside() {
        let data = temp_data_dir("corrupt");
        fs::write(data.path.join(SETTINGS_FILE), "{ not json").unwrap();
        assert!(load_settings(&data).unwrap().is_none());
        let kept = fs::read_dir(&data.path)
            .unwrap()
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().starts_with("settings.corrupt-"));
        assert!(kept, "corrupt settings file should be renamed, not deleted");
    }

    #[test]
    fn window_state_round_trip() {
        let data = temp_data_dir("window");
        assert!(load_window_state(&data).is_none());
        let state = WindowState {
            x: 120,
            y: 80,
            width: 1180,
            height: 760,
            maximized: false,
        };
        save_window_state(&data, &state).unwrap();
        assert_eq!(load_window_state(&data), Some(state));
    }

    #[test]
    fn junk_window_state_is_ignored() {
        let data = temp_data_dir("window-junk");
        let bad = WindowState {
            x: -50_000,
            y: 0,
            width: 10,
            height: 10,
            maximized: false,
        };
        assert!(!bad.looks_usable());
        save_window_state(&data, &bad).unwrap();
        assert!(load_window_state(&data).is_none());
    }
}
