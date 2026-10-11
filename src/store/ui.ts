import { create } from "zustand";

interface UiState {
  loginOpen: boolean;
  settingsOpen: boolean;
  /** Mobile channel drawer. */
  navOpen: boolean;
  /** Text the composer should insert (e.g. "@name "), with a nonce so repeats still fire. */
  insert: { text: string; nonce: number } | null;
}

export const useUi = create<UiState>(() => ({
  loginOpen: false,
  settingsOpen: false,
  navOpen: false,
  insert: null,
}));

export function insertIntoComposer(text: string): void {
  useUi.setState((s) => ({ insert: { text, nonce: (s.insert?.nonce ?? 0) + 1 } }));
}
