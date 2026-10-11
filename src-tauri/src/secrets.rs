//! Twitch login is kept in the OS credential store (Windows Credential Manager on Windows),
//! never in the portable data folder.

use keyring::Entry;

const SERVICE: &str = "ChatDeck";
const ACCOUNT: &str = "twitch-session";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|err| err.to_string())
}

pub fn load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(err.to_string()),
    }
}

pub fn save(payload: &str) -> Result<(), String> {
    entry()?.set_password(payload).map_err(|err| err.to_string())
}

pub fn clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

pub fn store_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Windows Credential Manager"
    } else if cfg!(target_os = "macos") {
        "macOS Keychain"
    } else {
        "Linux kernel keyring (cleared on logout)"
    }
}
