import { useEffect } from "react";
import { chat } from "@/lib/chat/controller";
import { cycleChannel } from "@/lib/view/reorder";
import { viewShortcut } from "@/lib/view/shortcuts";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

/** A real overlay (dialog, menu, completion list) is open. The Settings panel isn't one: chat keeps working beside it. */
function overlayOpen(): boolean {
  return !!document.querySelector(
    "[role='dialog']:not([data-testid='settings-panel']), [role='menu'], [data-testid='tab-complete'], [data-testid='spell-menu']",
  );
}

/** Makes the grid pane focused, then puts the caret in the shared message box once it has switched to it. */
function focusComposer(channel: string): void {
  chat.setActivePane(channel);
  useUi.setState({ hoveredChannel: channel });
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>(`[data-composer="${CSS.escape(channel)}"]`);
    // With "Confirm channel before typing" the box shows its "chat in #channel" button instead of the input.
    (input ?? document.querySelector<HTMLButtonElement>("[data-testid='channel-switch-unlock']"))?.focus();
  });
}

/** Ctrl+G, Ctrl+K, Ctrl+1..9, Ctrl+Tab, Alt+Shift+Arrow, Esc back to the grid, Ctrl+Shift+R read only, Ctrl+Shift+H hide UI. */
export function ViewHotkeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const shortcut = viewShortcut({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
      });
      if (!shortcut) return;

      if (shortcut.type === "quick-switch") {
        event.preventDefault();
        useUi.setState((s) => ({ quickSwitchOpen: !s.quickSwitchOpen }));
        return;
      }

      if (shortcut.type === "escape") {
        if (useUi.getState().quickSwitchOpen) {
          event.preventDefault();
          useUi.setState({ quickSwitchOpen: false });
          return;
        }
        if (overlayOpen()) return;
        // Esc closes the Settings panel first (the panel handles it), not the single view behind it.
        if (useUi.getState().settingsOpen) return;
        if (useChat.getState().settings.mode === "focused") {
          event.preventDefault();
          chat.setMode("grid");
        }
        return;
      }

      if (shortcut.type === "read-only" || shortcut.type === "hide-ui") {
        // Always swallow these (Ctrl+Shift+R is the browser's hard reload), even with a menu open.
        event.preventDefault();
        if (overlayOpen()) return;
        const s = useChat.getState().settings;
        const on = shortcut.type === "read-only" ? !s.readOnly : !s.chromeHidden;
        chat.updateSettings(shortcut.type === "read-only" ? { readOnly: on } : { chromeHidden: on });
        const text =
          shortcut.type === "read-only"
            ? on
              ? "Read only on: message box hidden"
              : "Read only off"
            : on
              ? "Top strip hidden. Ctrl+Shift+H shows it again"
              : "Top strip shown";
        useUi.setState((u) => ({ liveMessage: text, liveNonce: u.liveNonce + 1 }));
        return;
      }

      if (overlayOpen()) return;
      const settings = useChat.getState().settings;

      if (shortcut.type === "toggle-mode") {
        event.preventDefault();
        if (settings.mode === "grid") {
          const hovered = useUi.getState().hoveredChannel;
          const target =
            (hovered && settings.gridChannels.includes(hovered) ? hovered : null) ??
            settings.focused ??
            settings.gridChannels[0] ??
            settings.channels[0];
          if (target) chat.focus(target);
          else chat.setMode("focused");
        } else {
          chat.setMode("grid");
        }
        return;
      }

      if (shortcut.type === "slot") {
        const name = settings.gridChannels[shortcut.index];
        if (!name) return;
        event.preventDefault();
        if (settings.mode === "grid") focusComposer(name);
        else chat.focus(name);
        useUi.setState((s) => ({ liveMessage: `#${name}`, liveNonce: s.liveNonce + 1 }));
        return;
      }

      if (shortcut.type === "cycle") {
        if (settings.mode !== "focused") return;
        const order = settings.gridChannels.length ? settings.gridChannels : settings.channels;
        const next = cycleChannel(order, settings.focused, shortcut.direction);
        if (!next || next === settings.focused) return;
        event.preventDefault();
        chat.focus(next);
        return;
      }

      if (shortcut.type === "move-box") {
        const hovered = useUi.getState().hoveredChannel;
        const name =
          hovered && settings.gridChannels.includes(hovered)
            ? hovered
            : settings.focused && settings.gridChannels.includes(settings.focused)
              ? settings.focused
              : settings.gridChannels[0];
        if (!name) return;
        event.preventDefault();
        chat.moveGridChannel(name, shortcut.direction);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return null;
}
