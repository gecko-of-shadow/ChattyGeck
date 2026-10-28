//! Start ZooChattr when the user signs in to Windows (Startup folder shortcut).

#[cfg(windows)]
use std::path::PathBuf;

#[cfg(windows)]
const LINK_NAME: &str = "ZooChattr.lnk";

#[cfg(windows)]
fn startup_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var_os("APPDATA").ok_or_else(|| "APPDATA isn't set.".to_string())?;
    Ok(PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup"))
}

#[cfg(windows)]
fn shortcut_path() -> Result<PathBuf, String> {
    Ok(startup_dir()?.join(LINK_NAME))
}

#[cfg(windows)]
pub fn get_launch_at_login() -> Result<bool, String> {
    // Don't even stat the owner's shortcut during a verify run.
    if !crate::verify::startup_shortcut_mutable() {
        return Ok(false);
    }
    Ok(shortcut_path()?.exists())
}

/// Creates or removes a Startup-folder shortcut to this exe (VBScript, no extra crates).
#[cfg(windows)]
pub fn set_launch_at_login(enabled: bool) -> Result<(), String> {
    if !crate::verify::startup_shortcut_mutable() {
        return Ok(());
    }
    let link = shortcut_path()?;
    if !enabled {
        if link.exists() {
            std::fs::remove_file(&link).map_err(|err| format!("Couldn't remove the Startup shortcut: {err}"))?;
        }
        return Ok(());
    }
    let exe = std::env::current_exe().map_err(|err| format!("Couldn't find this program: {err}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "Couldn't find this program's folder.".to_string())?;
    std::fs::create_dir_all(startup_dir()?).map_err(|err| format!("Couldn't open the Startup folder: {err}"))?;

    // Write a tiny .vbs that creates the .lnk, then run it once with wscript.
    let script = format!(
        "Set sh = CreateObject(\"WScript.Shell\")\r\n\
         Set sc = sh.CreateShortcut(\"{link}\")\r\n\
         sc.TargetPath = \"{exe}\"\r\n\
         sc.WorkingDirectory = \"{dir}\"\r\n\
         sc.Description = \"ZooChattr\"\r\n\
         sc.Save\r\n",
        link = link.to_string_lossy().replace('\\', "\\\\").replace('"', ""),
        exe = exe.to_string_lossy().replace('\\', "\\\\").replace('"', ""),
        dir = dir.to_string_lossy().replace('\\', "\\\\").replace('"', ""),
    );
    let vbs = std::env::temp_dir().join("zoochattr-startup.vbs");
    std::fs::write(&vbs, script).map_err(|err| format!("Couldn't write the Startup helper: {err}"))?;
    let status = std::process::Command::new("wscript")
        .arg("//B")
        .arg(&vbs)
        .status()
        .map_err(|err| format!("Couldn't create the Startup shortcut: {err}"))?;
    let _ = std::fs::remove_file(&vbs);
    if !status.success() {
        return Err("Couldn't create the Startup shortcut.".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn get_launch_at_login() -> Result<bool, String> {
    Ok(false)
}

#[cfg(not(windows))]
pub fn set_launch_at_login(_enabled: bool) -> Result<(), String> {
    // A verify run on Linux must not report a failure that the UI then "fixes" by rewriting settings.
    // There is no Startup folder here either way.
    if !crate::verify::startup_shortcut_mutable() {
        return Ok(());
    }
    Err("Start on login is only available on Windows.".into())
}
