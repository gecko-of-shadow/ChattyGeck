//! Portable updates from GitHub Releases.
//! Downloads the zip, replaces only ZooChattr.exe next to this process, and keeps ZooChattr-data.

use std::{
    fs,
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::Serialize;

const REPO: &str = "gecko-of-shadow/ZooChattr";
const USER_AGENT: &str = "ZooChattr";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub tag: String,
    pub version: String,
    pub download_url: String,
    pub notes: String,
    pub published_at: String,
}

fn http_get(url: &str) -> Result<Vec<u8>, String> {
    let response = ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|err| format!("Couldn't reach GitHub: {err}"))?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Couldn't read the response: {err}"))?;
    Ok(bytes)
}

pub fn check_for_update() -> Result<Option<UpdateInfo>, String> {
    let bytes = http_get(&format!("https://api.github.com/repos/{REPO}/releases/latest"))?;
    let body: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|err| format!("GitHub's reply wasn't JSON: {err}"))?;
    let tag = body
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if tag.is_empty() {
        return Ok(None);
    }
    let assets = body.get("assets").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let download_url = assets
        .iter()
        .find_map(|asset| {
            let name = asset.get("name")?.as_str()?;
            if name.starts_with("ZooChattr-portable-") && name.ends_with(".zip") {
                asset.get("browser_download_url")?.as_str().map(str::to_string)
            } else {
                None
            }
        })
        .ok_or_else(|| "That release has no ZooChattr-portable zip.".to_string())?;
    Ok(Some(UpdateInfo {
        version: tag.trim_start_matches('v').to_string(),
        tag,
        download_url,
        notes: body.get("body").and_then(|v| v.as_str()).unwrap_or("").trim().to_string(),
        published_at: body
            .get("published_at")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
    }))
}

fn exe_dir() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|err| format!("Couldn't find this program: {err}"))?;
    exe.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Couldn't find this program's folder.".to_string())
}

fn find_exe_in_zip(archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>) -> Result<usize, String> {
    for i in 0..archive.len() {
        let name = archive
            .by_index(i)
            .map_err(|err| err.to_string())?
            .name()
            .replace('\\', "/")
            .to_lowercase();
        if name.ends_with("zoochattr.exe") && !name.contains("data/") {
            return Ok(i);
        }
    }
    Err("The zip didn't contain ZooChattr.exe.".to_string())
}

/// Downloads the portable zip and schedules a swap of the running exe, keeping ZooChattr-data.
/// Returns after spawning the helper; the process should then exit.
pub fn apply_update(download_url: &str) -> Result<(), String> {
    let dir = exe_dir()?;
    let exe_name = if cfg!(windows) { "ZooChattr.exe" } else { "ZooChattr" };
    let current = dir.join(exe_name);
    if !current.exists() {
        // Dev / Linux builds may be named differently.
        let fallback = std::env::current_exe().map_err(|err| err.to_string())?;
        return apply_update_to(&fallback, download_url);
    }
    apply_update_to(&current, download_url)
}

/// Portable zips come from this repo's GitHub release. Anything else is refused.
fn allowed_download_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host = host.split('@').next_back().unwrap_or(host);
    let host = host.split(':').next().unwrap_or(host);
    host == "github.com" || host.ends_with(".githubusercontent.com")
}

fn apply_update_to(current_exe: &Path, download_url: &str) -> Result<(), String> {
    if !allowed_download_url(download_url) {
        return Err("Refusing an update that is not hosted on GitHub.".to_string());
    }
    let dir = current_exe
        .parent()
        .ok_or_else(|| "Couldn't find this program's folder.".to_string())?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let staging = std::env::temp_dir().join(format!("zoochattr-update-{stamp}"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|err| format!("Couldn't make a temp folder: {err}"))?;

    let zip_bytes = http_get(download_url)?;
    let mut archive = zip::ZipArchive::new(Cursor::new(zip_bytes)).map_err(|err| format!("Couldn't open the zip: {err}"))?;
    let index = find_exe_in_zip(&mut archive)?;
    let mut file = archive.by_index(index).map_err(|err| err.to_string())?;
    let new_exe = staging.join("ZooChattr.exe.new");
    {
        let mut out = fs::File::create(&new_exe).map_err(|err| format!("Couldn't write the new exe: {err}"))?;
        io::copy(&mut file, &mut out).map_err(|err| format!("Couldn't extract the new exe: {err}"))?;
    }

    let dest_new = dir.join(format!("{}.new", current_exe.file_name().unwrap().to_string_lossy()));
    fs::copy(&new_exe, &dest_new).map_err(|err| format!("Couldn't place the new exe: {err}"))?;

    if cfg!(windows) {
        write_and_spawn_windows_helper(current_exe, &dest_new)?;
    } else {
        // Unix: replace in place after a short delay via a shell script.
        let helper = staging.join("apply.sh");
        let script = format!(
            "#!/bin/sh\nsleep 1\nmv -f '{}' '{}'\nchmod +x '{}'\nexec '{}' &\n",
            dest_new.display(),
            current_exe.display(),
            current_exe.display(),
            current_exe.display()
        );
        fs::write(&helper, script).map_err(|err| err.to_string())?;
        Command::new("sh")
            .arg(&helper)
            .spawn()
            .map_err(|err| format!("Couldn't start the update helper: {err}"))?;
    }
    let _ = fs::remove_dir_all(&staging);
    Ok(())
}

#[cfg(windows)]
fn write_and_spawn_windows_helper(current_exe: &Path, new_exe: &Path) -> Result<(), String> {
    use std::io::Write;
    let dir = current_exe.parent().unwrap();
    let helper = dir.join("zoochattr-update.cmd");
    let bak = current_exe.with_extension("exe.bak");
    // Wait for this process to exit, swap the exe, restart, clean up. ZooChattr-data is never touched.
    let script = format!(
        "@echo off\r\n\
         setlocal\r\n\
         :wait\r\n\
         timeout /t 1 /nobreak >nul\r\n\
         del /f /q \"{current}\" 2>nul\r\n\
         if exist \"{current}\" goto wait\r\n\
         if exist \"{bak}\" del /f /q \"{bak}\"\r\n\
         move /y \"{new}\" \"{current}\"\r\n\
         start \"\" \"{current}\"\r\n\
         del /f /q \"%~f0\"\r\n",
        current = current_exe.display(),
        bak = bak.display(),
        new = new_exe.display(),
    );
    {
        let mut file = fs::File::create(&helper).map_err(|err| format!("Couldn't write the update helper: {err}"))?;
        file.write_all(script.as_bytes())
            .map_err(|err| format!("Couldn't write the update helper: {err}"))?;
    }
    Command::new("cmd")
        .args(["/C", "start", "", "/MIN", &helper.to_string_lossy()])
        .spawn()
        .map_err(|err| format!("Couldn't start the update helper: {err}"))?;
    Ok(())
}

#[cfg(not(windows))]
fn write_and_spawn_windows_helper(_current_exe: &Path, _new_exe: &Path) -> Result<(), String> {
    Err("Windows-only helper".into())
}

#[cfg(test)]
mod tests {
    use super::allowed_download_url;

    #[test]
    fn accepts_github_release_hosts() {
        assert!(allowed_download_url(
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.4.15/ZooChattr-portable-0.4.15.zip"
        ));
        assert!(allowed_download_url(
            "https://release-assets.githubusercontent.com/github-production-release-asset/abc"
        ));
    }

    #[test]
    fn rejects_other_download_urls() {
        assert!(!allowed_download_url("http://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.4.15/x.zip"));
        assert!(!allowed_download_url("https://evil.example/ZooChattr.exe"));
        assert!(!allowed_download_url("https://github.com.evil.example/x.zip"));
        assert!(!allowed_download_url("not a url"));
    }
}
