//! `ZOOCHATTR_VERIFY=1` isolates a verification run from the owner's real app.
//! Anything else, including an unset variable, is a normal launch.

pub const PRODUCTION_SERVICE: &str = "ZooChattr";
pub const VERIFY_SERVICE: &str = "ZooChattr-verify";
pub const PRODUCTION_DBUS_ID: &str = "com.geckoofshadow.zoochattr";
pub const VERIFY_DBUS_ID: &str = "com.geckoofshadow.zoochattr.verify";
pub const WINDOW_TITLE: &str = "ZooChattr verify";

pub fn enabled() -> bool {
    enabled_value(std::env::var("ZOOCHATTR_VERIFY").ok().as_deref())
}

pub fn enabled_value(value: Option<&str>) -> bool {
    value == Some("1")
}

pub fn credential_service(verify: bool) -> &'static str {
    if verify { VERIFY_SERVICE } else { PRODUCTION_SERVICE }
}

/// Windows Credential Manager target written by the `keyring` crate (`username.service`).
pub fn credential_target(account: &str, service: &str) -> String {
    format!("{account}.{service}")
}

/// False in verify mode: the real Startup shortcut must not be created or deleted.
pub fn startup_shortcut_mutable() -> bool {
    !enabled()
}

pub fn updates_allowed() -> bool {
    !enabled()
}

pub fn single_instance_dbus_id(verify: bool) -> &'static str {
    if verify { VERIFY_DBUS_ID } else { PRODUCTION_DBUS_ID }
}

pub fn guard_note() -> String {
    let verify = enabled();
    let service = credential_service(verify);
    format!(
        "verify={}\ncredential_service={service}\ncredential_target_session={}\ncredential_target_history={}\nstartup_shortcut=skipped\nupdates=skipped\nsingle_instance={}\nwindow_title={WINDOW_TITLE}\n",
        if verify { "1" } else { "0" },
        credential_target("twitch-session", service),
        credential_target("history-token", service),
        single_instance_dbus_id(verify),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_exact_flag_turns_verify_on() {
        assert!(enabled_value(Some("1")));
        assert!(!enabled_value(Some("true")));
        assert!(!enabled_value(Some("0")));
        assert!(!enabled_value(Some("")));
        assert!(!enabled_value(None));
    }

    #[test]
    fn verify_credentials_are_not_the_owners() {
        assert_eq!(credential_service(false), "ZooChattr");
        assert_eq!(credential_service(true), "ZooChattr-verify");
        assert_eq!(credential_target("twitch-session", "ZooChattr"), "twitch-session.ZooChattr");
        assert_eq!(
            credential_target("twitch-session", "ZooChattr-verify"),
            "twitch-session.ZooChattr-verify"
        );
        assert_eq!(credential_target("history-token", "ZooChattr"), "history-token.ZooChattr");
        assert_ne!(
            credential_target("twitch-session", credential_service(true)),
            credential_target("twitch-session", credential_service(false))
        );
    }

    #[test]
    fn verify_instance_id_is_not_the_production_one() {
        assert_eq!(single_instance_dbus_id(false), "com.geckoofshadow.zoochattr");
        assert_eq!(single_instance_dbus_id(true), "com.geckoofshadow.zoochattr.verify");
        assert_ne!(single_instance_dbus_id(true), single_instance_dbus_id(false));
    }
}
