//! Edge's WebView2 draws the right-click menu. ZooChattr logs in with a Twitch
//! device code and never asks for a password, but Edge still adds "Import passwords"
//! (unlocalized name `importPasswords`). Strip that, and the other browser commands,
//! and leave text editing.

use tauri::webview::PlatformWebview;
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR,
    COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU, ICoreWebView2ContextMenuItem,
    ICoreWebView2ContextMenuItemCollection, ICoreWebView2Settings4, ICoreWebView2_11,
};
use webview2_com::ContextMenuRequestedEventHandler;
use windows::Win32::System::Com::CoTaskMemFree;
use windows::core::{Interface, PWSTR};

pub fn tame_webview_menu(window: &tauri::WebviewWindow) {
    let _ = window.with_webview(|webview| {
        if let Err(err) = install(&webview) {
            eprintln!("ZooChattr: context menu filter was not installed: {err}");
        }
    });
}

fn install(webview: &PlatformWebview) -> windows::core::Result<()> {
    unsafe {
        let core = webview.controller().CoreWebView2()?;
        if let Ok(settings) = core.Settings() {
            if let Ok(settings) = settings.cast::<ICoreWebView2Settings4>() {
                let _ = settings.SetIsPasswordAutosaveEnabled(false);
                let _ = settings.SetIsGeneralAutofillEnabled(false);
            }
        }
        let core = core.cast::<ICoreWebView2_11>()?;
        let handler = ContextMenuRequestedEventHandler::create(Box::new(|_sender, args| {
            if let Some(args) = args {
                if let Ok(items) = args.MenuItems() {
                    strip_menu(&items);
                }
            }
            Ok(())
        }));
        let mut token = 0i64;
        core.add_ContextMenuRequested(&handler, &mut token)?;
        Ok(())
    }
}

fn strip_menu(items: &ICoreWebView2ContextMenuItemCollection) {
    let Some(count) = item_count(items) else {
        return;
    };
    let mut index = count;
    while index > 0 {
        index -= 1;
        let Ok(item) = (unsafe { items.GetValueAtIndex(index) }) else {
            continue;
        };
        let name = webview_string(|out| unsafe { item.Name(out) });
        let label = webview_string(|out| unsafe { item.Label(out) });
        if drop_item(&name, &label) {
            let _ = unsafe { items.RemoveValueAtIndex(index) };
            continue;
        }
        if is_kind(&item, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SUBMENU) {
            if let Ok(children) = unsafe { item.Children() } {
                strip_menu(&children);
                if submenu_is_empty(&children) {
                    let _ = unsafe { items.RemoveValueAtIndex(index) };
                }
            }
        }
    }
    collapse_separators(items);
}

/// Browser commands Edge inserts. Text editing (`cut`, `copy`, `paste`, `undo`,
/// `redo`, `selectAll`, `spellCheck`, and copying a link or image) stays.
fn drop_item(name: &str, label: &str) -> bool {
    let name_folded = name.to_ascii_lowercase();
    let label_folded: String = label
        .chars()
        .filter(|ch| *ch != '&')
        .flat_map(|ch| ch.to_lowercase())
        .collect();
    if name_folded.contains("password") || label_folded.contains("password") {
        return true;
    }
    matches!(
        name,
        "back"
            | "forward"
            | "reload"
            | "saveAs"
            | "saveImage"
            | "saveImageAs"
            | "saveLinkAs"
            | "share"
            | "webCapture"
            | "print"
            | "createQrCode"
            | "inspectElement"
            | "openLinkInNewWindow"
            | "openLinkInNewTab"
            | "openImageInNewWindow"
            | "openInNewTab"
            | "openInNewWindow"
    )
}

fn submenu_is_empty(items: &ICoreWebView2ContextMenuItemCollection) -> bool {
    let Some(count) = item_count(items) else {
        return false;
    };
    if count == 0 {
        return true;
    }
    (0..count).all(|index| {
        unsafe { items.GetValueAtIndex(index) }
            .ok()
            .is_some_and(|item| is_separator(&item))
    })
}

fn collapse_separators(items: &ICoreWebView2ContextMenuItemCollection) {
    let mut index = 0u32;
    let mut previous_separator = true;
    loop {
        let Some(count) = item_count(items) else {
            return;
        };
        if index >= count {
            return;
        }
        let Ok(item) = (unsafe { items.GetValueAtIndex(index) }) else {
            index += 1;
            previous_separator = false;
            continue;
        };
        let separator = is_separator(&item);
        if separator && (previous_separator || index + 1 == count) {
            if unsafe { items.RemoveValueAtIndex(index) }.is_err() {
                index += 1;
            }
            continue;
        }
        previous_separator = separator;
        index += 1;
    }
}

fn item_count(items: &ICoreWebView2ContextMenuItemCollection) -> Option<u32> {
    let mut count = 0u32;
    unsafe { items.Count(&mut count) }.ok()?;
    Some(count)
}

fn is_separator(item: &ICoreWebView2ContextMenuItem) -> bool {
    is_kind(item, COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND_SEPARATOR)
}

fn is_kind(
    item: &ICoreWebView2ContextMenuItem,
    expected: COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND,
) -> bool {
    let mut kind = COREWEBVIEW2_CONTEXT_MENU_ITEM_KIND(0);
    unsafe { item.Kind(&mut kind) }.is_ok() && kind == expected
}

#[cfg(test)]
mod tests {
    use super::drop_item;

    #[test]
    fn drops_import_passwords_and_browser_commands() {
        assert!(drop_item("importPasswords", "Import passwords"));
        assert!(drop_item("importPasswords", "Import &passwords"));
        assert!(drop_item("managePasswords", "Manage passwords"));
        assert!(drop_item("other", "Import passwords"));
        assert!(drop_item("saveAs", "Save as"));
        assert!(drop_item("inspectElement", "Inspect"));
        assert!(drop_item("share", "Share"));
        assert!(drop_item("openLinkInNewWindow", "Open link in new window"));
    }

    #[test]
    fn keeps_text_editing() {
        for name in [
            "undo",
            "redo",
            "cut",
            "copy",
            "paste",
            "pasteAndMatchStyle",
            "selectAll",
            "spellCheck",
            "copyLink",
            "copyImage",
            "copyImageLink",
        ] {
            assert!(!drop_item(name, name), "{name} should stay");
        }
    }
}

fn webview_string(read: impl FnOnce(*mut PWSTR) -> windows::core::Result<()>) -> String {
    let mut raw = PWSTR::null();
    let read_ok = read(&mut raw).is_ok();
    if raw.is_null() {
        return String::new();
    }
    let text = if read_ok {
        unsafe { raw.to_string() }.unwrap_or_default()
    } else {
        String::new()
    };
    unsafe { CoTaskMemFree(Some(raw.as_ptr() as *const std::ffi::c_void)) };
    text
}
