import { create } from "zustand";

interface UiState {
  loginOpen: boolean;
  settingsOpen: boolean;
  /** Mobile channel drawer. */
  navOpen: boolean;
  /** Tray "Quit" asked the UI to confirm before exiting. */
  quitConfirmOpen: boolean;
  /** Tray / menu asked Settings to open and run an update check. */
  pendingUpdateCheck: boolean;
  /**
   * Channel whose message box is armed for typing/sending.
   * Other composers show a "Switch to #channel" button first so messages don't land in the wrong room.
   */
  armedComposer: string | null;
  /** Text a channel's composer should insert (e.g. "@name "), with a nonce so repeats still fire. */
  insert: { text: string; channel: string; nonce: number } | null;
}

export const useUi = create<UiState>(() => ({
  loginOpen: false,
  settingsOpen: false,
  navOpen: false,
  quitConfirmOpen: false,
  pendingUpdateCheck: false,
  armedComposer: null,
  insert: null,
}));

export function insertIntoComposer(text: string, channel: string): void {
  useUi.setState((s) => ({
    insert: { text, channel, nonce: (s.insert?.nonce ?? 0) + 1 },
    armedComposer: channel,
  }));
}

export function armComposer(channel: string): void {
  useUi.setState({ armedComposer: channel });
}
