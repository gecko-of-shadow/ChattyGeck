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
  /** Text a channel's composer should insert (e.g. "@name "), with a nonce so repeats still fire. */
  insert: { text: string; channel: string; nonce: number } | null;
}

export const useUi = create<UiState>(() => ({
  loginOpen: false,
  settingsOpen: false,
  navOpen: false,
  quitConfirmOpen: false,
  updateCheckNonce: 0,
  insert: null,
}));

export function insertIntoComposer(text: string, channel: string): void {
  useUi.setState((s) => ({ insert: { text, channel, nonce: (s.insert?.nonce ?? 0) + 1 } }));
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
