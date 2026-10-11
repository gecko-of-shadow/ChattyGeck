use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

use tauri::{AppHandle, Manager};

const PORTABLE_DIR: &str = "ZooChattr-data";
const SETTINGS_FILE: &str = "settings.json";

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
}
