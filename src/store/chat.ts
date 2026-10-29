import { create } from "zustand";
import type { ConnectionDetail, ConnectionStatus } from "@/lib/irc/connection";
import type { FollowView } from "@/lib/follows";
import type { AppInfo } from "@/lib/platform";
import type { ChatMessage, RoomState, UserState } from "@/lib/twitch/types";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

export type ChannelStatus = "joining" | "joined" | "error";

export interface ChannelView {
  login: string;
  status: ChannelStatus;
  error?: string;
  roomId?: string;
  roomState: RoomState;
  unread: number;
  mentions: number;
  messages: ChatMessage[];
  displayName?: string;
  avatarUrl?: string;
  /** Our own USERSTATE in this channel (name colour, badges, mod status). */
  me?: UserState;
  joinRequestedAt: number;
  /** Last message seen before switching away; a divider marks what came after. */
  readMarker?: string;
}

export type AuthView =
  | { status: "booting" }
  | { status: "anonymous" }
  | { status: "logged_in"; login: string; userId: string; remembered: boolean };

export interface ConnectionView {
  status: ConnectionStatus;
  detail: ConnectionDetail;
  since: number;
}

export interface ChatState {
  ready: boolean;
  /** True when a saved settings file was read at boot (false: first start, or the read failed and defaults are in use). */
  settingsLoaded: boolean;
  settings: Settings;
  appInfo: AppInfo | null;
  channels: Record<string, ChannelView>;
  auth: AuthView;
  read: ConnectionView;
  write: ConnectionView | null;
  /** Bumped when a channel's emote map changes, so rows re-tokenize. */
  emoteVersions: Record<string, number>;
  globalEmoteVersion: number;
  badgeVersion: number;
  /**
   * Channels the logged-in user follows on Twitch, by login. Only listed in the channel picker: chat joins only the
   * channels in settings.channels. Not saved; fetched again each launch.
   */
  follows: Record<string, FollowView>;
  /**
   * "off": logged out. "loading": first fetch running. "needs-login": logged in before the follows permission existed,
   * so the picker asks to log in again. "error": the fetch failed and there's no list yet (the picker offers Retry).
   */
  followsState: "off" | "loading" | "needs-login" | "ok" | "error";
  /** Viewer counts of channels that are live (app list and follows); missing = offline. Null = not known (logged out). */
  live: Record<string, number> | null;
}

export const useChat = create<ChatState>(() => ({
  ready: false,
  settingsLoaded: false,
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  channels: {},
  auth: { status: "booting" },
  read: { status: "idle", detail: {}, since: Date.now() },
  write: null,
  emoteVersions: {},
  globalEmoteVersion: 0,
  badgeVersion: 0,
  follows: {},
  followsState: "off",
  live: null,
}));

export function newChannelView(login: string): ChannelView {
  return {
    login,
    status: "joining",
    roomState: {},
    unread: 0,
    mentions: 0,
    messages: [],
    joinRequestedAt: Date.now(),
  };
}
