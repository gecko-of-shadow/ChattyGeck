import { create } from "zustand";

interface UiState {
  loginOpen: boolean;
  settingsOpen: boolean;
  /** Mobile channel drawer. */
  navOpen: boolean;
  /** Tray "Quit" asked the UI to confirm before exiting. */
  quitConfirmOpen: boolean;
  /** Bumped when the tray asks Settings to run Check for updates. */
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
