//! Twitch login is kept in the OS credential store (Windows Credential Manager on Windows),
//! never in the portable data folder. So is the history server's read token.

use keyring::Entry;

const SERVICE: &str = "ZooChattr";
const ACCOUNT: &str = "twitch-session";
/// READ_TOKEN for the chat logger (Settings → History server).
const HISTORY_TOKEN: &str = "history-token";

fn entry(account: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, account).map_err(|err| err.to_string())
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

pub fn store_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "Windows Credential Manager"
    } else if cfg!(target_os = "macos") {
        "macOS Keychain"
    } else {
        "Linux kernel keyring (cleared on logout)"
    }
}
