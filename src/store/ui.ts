import { create } from "zustand";
import { isTauri } from "@/lib/platform";

interface UiState {
  loginOpen: boolean;
  settingsOpen: boolean;
  /** Mobile channel drawer. */
  navOpen: boolean;
  /** Tray "Quit" asked the UI to confirm before exiting. */
  quitConfirmOpen: boolean;
  /** Bumped when Settings should run Check for updates (tray or popout). */
  updateCheckNonce: number;
  /**
   * Channel the user confirmed for sending. Shared so grid panes lock when you
   * move to another pane. `null` means nothing confirmed yet.
   */
  sendAckChannel: string | null;
  /** Channel whose message box was armed by an insert. */
  armedComposer: string | null;
  /** Text a channel's composer should insert (e.g. "@name "), with a nonce so repeats still fire. */
  insert: { text: string; channel: string; nonce: number } | null;
}

export const useUi = create<UiState>(() => ({
  loginOpen: false,
  settingsOpen: false,
  navOpen: false,
  quitConfirmOpen: false,
  updateCheckNonce: 0,
  sendAckChannel: null,
  armedComposer: null,
  insert: null,
}));

/** Confirm this channel as the send target (unlocks its composer; locks the others). */
export function ackSendChannel(channel: string): void {
  useUi.setState({ sendAckChannel: channel });
}

export function insertIntoComposer(text: string, channel: string): void {
  useUi.setState((s) => ({
    insert: { text, channel, nonce: (s.insert?.nonce ?? 0) + 1 },
    armedComposer: channel,
  }));
}

export function armComposer(channel: string): void {
  useUi.setState({ armedComposer: channel });
}

/** Desktop: own Settings window (main stays blocked). Browser: in-app dialog. */
export async function openSettings(): Promise<void> {
  useUi.setState({ navOpen: false });
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_settings_window_cmd");
    return;
  }
  useUi.setState({ settingsOpen: true });
}

export async function closeSettingsWindow(): Promise<void> {
  if (!isTauri) {
    useUi.setState({ settingsOpen: false });
    return;
  }
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const win = getCurrentWindow();
  if (win.label === "settings") await win.close();
}
