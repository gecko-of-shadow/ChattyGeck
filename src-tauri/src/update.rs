//! Portable updates from GitHub Releases.
//! Downloads the zip, replaces only ZooChattr.exe next to this process, and keeps ZooChattr-data.
//!
//! Safety check before anything is installed: the link must be a ZooChattr-portable zip in this repo's
//! GitHub releases, and the zip's SHA-256 must match the `<zip>.sha256` file published next to it
//! (written by .github/workflows/release.yml). Otherwise nothing is changed.

use std::{
    fs,
    io::{self, Cursor, Read},
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::Serialize;
use sha2::{Digest, Sha256};

const REPO: &str = "gecko-of-shadow/ZooChattr";
const USER_AGENT: &str = "ZooChattr";
/// Shown (and matched by the app) when the link or the fingerprint check fails.
pub const SAFETY_CHECK_FAILED: &str = "This update didn't pass its safety check. Nothing was changed.";

/// The release file name if `url` is `https://github.com/gecko-of-shadow/ZooChattr/releases/download/<tag>/ZooChattr-portable-<version>.zip`.
/// Anything else (another host or repo, a query, `..`, odd characters) is refused.
pub fn trusted_release_zip(url: &str) -> Option<&str> {
    let prefix = format!("https://github.com/{REPO}/releases/download/");
    let rest = url.strip_prefix(prefix.as_str())?;
    let (tag, name) = rest.split_once('/')?;
    let safe = |part: &str| {
        !part.is_empty()
            && part != "."
            && part != ".."
            && part.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_' | '+'))
    };
    if !safe(tag) || !safe(name) {
        return None;
    }
    release_zip_version(name)?;
    Some(name)
}

/// The `<version>` of `ZooChattr-portable-<version>.zip` (prefix and suffix stripped once).
fn release_zip_version(name: &str) -> Option<&str> {
    let version = name.strip_prefix("ZooChattr-portable-")?.strip_suffix(".zip")?;
    (!version.is_empty()).then_some(version)
}

/// Lower-case hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

/// Reads a `sha256sum`-style line ("<64 hex>  <file name>", or just the hex). When a name is given it must be `zip_name`.
pub fn parse_fingerprint(text: &str, zip_name: &str) -> Option<String> {
    let mut parts = text.trim().split_whitespace();
    let hex = parts.next()?.to_ascii_lowercase();
    if hex.len() != 64 || !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return None;
    }
    match parts.next() {
        None => Some(hex),
        Some(name) if name.trim_start_matches('*') == zip_name && parts.next().is_none() => Some(hex),
        Some(_) => None,
    }
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        // Like parseVersion in src/lib/updates.ts: non-numeric parts are skipped, not a stop.
        .filter_map(|part| part.parse().ok())
        .collect()
}

/// True when `candidate` is a higher version than `current` (same rule as isNewerVersion in src/lib/updates.ts).
pub fn is_newer_version(candidate: &str, current: &str) -> bool {
    let (a, b) = (version_parts(candidate), version_parts(current));
    for i in 0..a.len().max(b.len()) {
        let (left, right) = (a.get(i).copied().unwrap_or(0), b.get(i).copied().unwrap_or(0));
        if left != right {
            return left > right;
        }
    }
    false
}

/// The fingerprint file, at most 4 KB. Not there (404 / 403): the safety message. A connection problem, rate limit
/// or GitHub error: "Couldn't reach GitHub", so a hiccup isn't mistaken for a bad release.
fn fetch_fingerprint(url: &str) -> Result<String, String> {
    let response = match ureq::get(url).set("User-Agent", USER_AGENT).timeout(Duration::from_secs(30)).call() {
        Ok(response) => response,
        Err(ureq::Error::Status(404 | 403, _)) => return Err(SAFETY_CHECK_FAILED.to_string()),
        Err(ureq::Error::Status(code, _)) => return Err(format!("Couldn't reach GitHub (status {code}). Try again in a minute.")),
        Err(err) => return Err(format!("Couldn't reach GitHub: {err}")),
    };
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(4096)
        .read_to_end(&mut bytes)
        .map_err(|err| format!("Couldn't reach GitHub: {err}"))?;
    String::from_utf8(bytes).map_err(|_| SAFETY_CHECK_FAILED.to_string())
}

/// Downloads the zip and its fingerprint file; returns the zip only when they match and it is newer than this build.
fn download_checked_zip(download_url: &str) -> Result<Vec<u8>, String> {
    let zip_name = trusted_release_zip(download_url).ok_or_else(|| SAFETY_CHECK_FAILED.to_string())?;
    // Never "update" to the same or an older release.
    let version = release_zip_version(zip_name).ok_or_else(|| SAFETY_CHECK_FAILED.to_string())?;
    if !is_newer_version(version, env!("CARGO_PKG_VERSION")) {
        return Err(SAFETY_CHECK_FAILED.to_string());
    }
    let zip_bytes = http_get(download_url)?;
    let text = fetch_fingerprint(&format!("{download_url}.sha256"))?;
    let expected = parse_fingerprint(&text, zip_name).ok_or_else(|| SAFETY_CHECK_FAILED.to_string())?;
    if sha256_hex(&zip_bytes) != expected {
        return Err(SAFETY_CHECK_FAILED.to_string());
    }
    Ok(zip_bytes)
}

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

/// Cmd expands `%VAR%` inside double quotes. In a batch file, `%%` is one `%`.
#[cfg(windows)]
fn batch_escape(path: &Path) -> String {
    path.display().to_string().replace('%', "%%")
}

/// Single-quote a path for `sh`. An embedded `'` becomes `'\''`.
fn shell_single_quote(text: &str) -> String {
    format!("'{}'", text.replace('\'', "'\\''"))
}

fn apply_update_to(current_exe: &Path, download_url: &str) -> Result<(), String> {
    let dir = current_exe
        .parent()
        .ok_or_else(|| "Couldn't find this program's folder.".to_string())?;
    // Checked before any file is written: a refused update leaves everything as it was.
    let zip_bytes = download_checked_zip(download_url)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let staging = std::env::temp_dir().join(format!("zoochattr-update-{stamp}"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|err| format!("Couldn't make a temp folder: {err}"))?;

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
        // The script must not live in `staging`: that folder is deleted as soon as `sh` starts.
        let helper = std::env::temp_dir().join(format!("zoochattr-apply-{stamp}.sh"));
        let script = format!(
            "#!/bin/sh\nsleep 1\nmv -f {new} {current}\nchmod +x {current}\nexec {current} &\nrm -f {helper}\n",
            new = shell_single_quote(&dest_new.display().to_string()),
            current = shell_single_quote(&current_exe.display().to_string()),
            helper = shell_single_quote(&helper.display().to_string()),
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
    // Cmd expands %VAR% even inside quotes. A folder named "100%" would miss the real exe.
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
        current = batch_escape(current_exe),
        bak = batch_escape(&bak),
        new = batch_escape(new_exe),
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
    use super::*;

    const GOOD: &str = "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip";

    #[test]
    fn accepts_only_this_repos_portable_zip() {
        assert_eq!(trusted_release_zip(GOOD), Some("ZooChattr-portable-0.6.0.zip"));
        for bad in [
            "http://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
            "https://github.com/someone-else/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
            "https://github.com.example.test/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
            "https://example.test/https://github.com/gecko-of-shadow/ZooChattr/releases/download/v1/ZooChattr-portable-1.zip",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip?x=1",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip#a",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/../ZooChattr-portable-0.6.0.zip",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/sub/ZooChattr-portable-0.6.0.zip",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-.zip",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/Other-0.6.0.zip",
            "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.exe",
            "https://user@github.com/gecko-of-shadow/ZooChattr/releases/download/v0.6.0/ZooChattr-portable-0.6.0.zip",
            "",
        ] {
            assert_eq!(trusted_release_zip(bad), None, "{bad}");
        }
    }

    #[test]
    fn only_newer_versions_count() {
        assert!(is_newer_version("0.6.0", "0.5.0"));
        assert!(is_newer_version("v1.0", "0.9.9"));
        assert!(is_newer_version("0.5.1", "0.5.0"));
        assert!(!is_newer_version("0.5.0", "0.5.0"));
        assert!(!is_newer_version("0.4.9", "0.5.0"));
        assert!(!is_newer_version("..", "0.5.0"));
        // Same answer as isNewerVersion in src/lib/updates.test.ts.
        assert!(is_newer_version("0.6.0-beta.2", "0.6.0"));
    }

    #[test]
    fn version_comes_from_the_checked_name() {
        assert_eq!(release_zip_version("ZooChattr-portable-0.6.0.zip"), Some("0.6.0"));
        assert_eq!(release_zip_version("ZooChattr-portable-ZooChattr-portable-9.zip"), Some("ZooChattr-portable-9"));
        assert_eq!(release_zip_version("ZooChattr-portable-1.zip.zip"), Some("1.zip"));
        let doubled = "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v9/ZooChattr-portable-ZooChattr-portable-0.zip";
        assert_eq!(download_checked_zip(doubled), Err(SAFETY_CHECK_FAILED.to_string()));
    }

    #[test]
    fn refuses_a_release_that_isnt_newer() {
        let older = "https://github.com/gecko-of-shadow/ZooChattr/releases/download/v0.0.1/ZooChattr-portable-0.0.1.zip";
        assert_eq!(download_checked_zip(older), Err(SAFETY_CHECK_FAILED.to_string()));
    }

    #[test]
    fn sha256_matches_known_values() {
        // FIPS 180-2 test vectors.
        assert_eq!(sha256_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn reads_fingerprint_files() {
        let hex = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        let name = "ZooChattr-portable-0.6.0.zip";
        assert_eq!(parse_fingerprint(&format!("{hex}  {name}\n"), name).as_deref(), Some(hex));
        assert_eq!(parse_fingerprint(&format!("{hex} *{name}"), name).as_deref(), Some(hex));
        assert_eq!(parse_fingerprint(&hex.to_uppercase(), name).as_deref(), Some(hex));
        assert_eq!(parse_fingerprint(&format!("{hex}  ZooChattr-portable-0.5.0.zip"), name), None);
        assert_eq!(parse_fingerprint(&hex[..63], name), None);
        assert_eq!(parse_fingerprint("not a hash", name), None);
        assert_eq!(parse_fingerprint("", name), None);
        assert_eq!(parse_fingerprint(&format!("{hex}  {name} extra"), name), None);
    }

    /// Dry run against files written by the release workflow's fingerprint step:
    /// `$env:ZOO_DRYRUN_ZIP = "...\ZooChattr-portable-x.zip"; cargo test -- --ignored`
    #[test]
    #[ignore]
    fn matches_a_release_fingerprint_file() {
        let zip = std::env::var("ZOO_DRYRUN_ZIP").expect("set ZOO_DRYRUN_ZIP to a zip with a .sha256 next to it");
        let name = Path::new(&zip).file_name().unwrap().to_string_lossy().to_string();
        let bytes = fs::read(&zip).unwrap();
        let text = fs::read_to_string(format!("{zip}.sha256")).unwrap();
        assert_eq!(parse_fingerprint(&text, &name), Some(sha256_hex(&bytes)));
        let mut tampered = bytes.clone();
        tampered.push(0);
        assert_ne!(parse_fingerprint(&text, &name), Some(sha256_hex(&tampered)));
    }

    #[test]
    fn refuses_untrusted_links_before_downloading() {
        assert_eq!(
            download_checked_zip("https://example.test/ZooChattr-portable-0.6.0.zip"),
            Err(SAFETY_CHECK_FAILED.to_string())
        );
    }
}
