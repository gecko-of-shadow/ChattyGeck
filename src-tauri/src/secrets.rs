//! Twitch login is kept in the OS credential store (Windows Credential Manager on Windows),
//! never in the portable data folder. So is the history server's read token.

use keyring::Entry;

const ACCOUNT: &str = "twitch-session";
/// READ_TOKEN for the chat logger (Settings → History server).
const HISTORY_TOKEN: &str = "history-token";

fn entry(account: &str) -> Result<Entry, String> {
    // Verify mode uses ZooChattr-verify so it never reads or deletes twitch-session.ZooChattr.
    Entry::new(crate::verify::credential_service(crate::verify::enabled()), account).map_err(|err| err.to_string())
}

fn load_from(account: &str) -> Result<Option<String>, String> {
    match entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

fn clear_from(account: &str) -> Result<(), String> {
    match entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

pub fn load() -> Result<Option<String>, String> {
    load_from(ACCOUNT)
}

pub fn save(payload: &str) -> Result<(), String> {
    entry(ACCOUNT)?.set_password(payload).map_err(|err| err.to_string())
}

pub fn clear() -> Result<(), String> {
    clear_from(ACCOUNT)
}

pub fn load_history_token() -> Result<Option<String>, String> {
    load_from(HISTORY_TOKEN)
}

/// An empty token removes the saved one.
pub fn save_history_token(token: &str) -> Result<(), String> {
    let token = token.trim();
    if token.is_empty() {
        return clear_from(HISTORY_TOKEN);
    }
    entry(HISTORY_TOKEN)?.set_password(token).map_err(|err| err.to_string())
}

/// Credential-store label shown in Settings. Verify mode adds the separate service name.
/// A normal launch stays the plain backend name, including exactly `Windows Credential Manager`.
pub fn format_store_name(backend: &str, verify: bool) -> String {
    if verify {
        format!("{backend} (ZooChattr-verify)")
    } else {
        backend.to_string()
    }
}

pub fn store_name() -> String {
    let backend = if cfg!(target_os = "windows") {
        "Windows Credential Manager"
    } else if cfg!(target_os = "macos") {
        "macOS Keychain"
    } else {
        "Linux kernel keyring (cleared on logout)"
    };
    format_store_name(backend, crate::verify::enabled())
}

#[cfg(test)]
mod tests {
    use super::format_store_name;

    #[test]
    fn windows_store_name_is_exact_until_verify_mode() {
        assert_eq!(format_store_name("Windows Credential Manager", false), "Windows Credential Manager");
        assert_eq!(
            format_store_name("Windows Credential Manager", true),
            "Windows Credential Manager (ZooChattr-verify)"
        );
        assert_eq!(
            format_store_name("Linux kernel keyring (cleared on logout)", false),
            "Linux kernel keyring (cleared on logout)"
        );
    }
}
