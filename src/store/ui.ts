import { create } from "zustand";
import { isTauri } from "@/lib/platform";
import { replyParentMsgId, replySnippet } from "@/lib/twitch/reply";

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
  /** Message the composer will send as a Twitch reply. Stays on its channel when you look at another chat. */
  replyTo: ReplyTarget | null;
}

export interface ReplyTarget {
  channel: string;
  id: string;
  login: string;
  displayName: string;
  text: string;
  /** Bumped so picking the same message again still focuses the box. */
  nonce: number;
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
  replyTo: null,
}));

/** Arm a Twitch reply. Also unlocks and focuses that channel's message box. */
export function setReplyTarget(target: { channel: string; id: string; login: string; displayName: string; text: string }): void {
  const id = replyParentMsgId(target.id);
  if (!id || !target.login) return;
  useUi.setState((s) => ({
    replyTo: {
      channel: target.channel,
      id,
      login: target.login,
      displayName: target.displayName || target.login,
      text: replySnippet(target.text),
      nonce: (s.replyTo?.nonce ?? 0) + 1,
    },
    sendAckChannel: target.channel,
    armedComposer: target.channel,
  }));
}

/** Drop the reply. With a channel, a reply aimed at some other chat stays put. */
export function clearReplyTarget(channel?: string): void {
  useUi.setState((s) => {
    if (!s.replyTo) return s;
    if (channel && s.replyTo.channel !== channel) return s;
    return { ...s, replyTo: null };
  });
}

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
