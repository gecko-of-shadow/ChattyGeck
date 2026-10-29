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
  /** Grid box under the pointer, used when Ctrl+G opens Single. */
  hoveredChannel: string | null;
  /** Grid box currently under a drag, so it can show a highlight. */
  dropTarget: string | null;
  /** Quick switcher (Ctrl+K). */
  quickSwitchOpen: boolean;
  /** Polite announcements for drag, swap, and shortcuts. */
  liveMessage: string;
  liveNonce: number;
  /** Text a channel's composer should insert (e.g. "@name "), with a nonce so repeats still fire. */
  insert: { text: string; channel: string; nonce: number } | null;
  /** Message the composer will send as a Twitch reply. Stays on its channel when you look at another chat. */
  replyTo: ReplyTarget | null;
  /** Channel whose emote status is open (from a channel's right-click menu), under its picker row or pane header. */
  emoteStatusFor: string | null;
  /** The pane whose channel picker is open: a grid pane's index, or "single" for view 1. One at a time. */
  pickerPane: PaneTarget | null;
}

/** A pane the channel picker loads into: grid pane `index` (0-based), or the one pane of view 1. */
export type PaneTarget = number | "single";

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
  hoveredChannel: null,
  dropTarget: null,
  quickSwitchOpen: false,
  liveMessage: "",
  liveNonce: 0,
  insert: null,
  replyTo: null,
  emoteStatusFor: null,
  pickerPane: null,
}));

/** Opens the channel picker inside a pane (closes any other pane's picker). */
export function openPicker(pane: PaneTarget): void {
  useUi.setState({ pickerPane: pane });
}

/**
 * Closes the picker. Keyboard focus goes back to the pane: its "⋯" button, or its "Pick a channel" button when empty
 * (both carry `data-pane-return`).
 */
export function closePicker(returnFocus = true): void {
  const pane = useUi.getState().pickerPane;
  if (pane === null) return;
  useUi.setState({ pickerPane: null });
  if (!returnFocus || typeof document === "undefined") return;
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-pane-return="${String(pane)}"]`)?.focus();
  });
}

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

/**
 * Settings opens as a panel inside the main window (Bran's choice), from the gear and from the tray's Settings….
 * The old separate Settings window (`open_settings_window_cmd`) is no longer opened.
 */
export async function openSettings(): Promise<void> {
  useUi.setState({ navOpen: false, settingsOpen: true });
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
