import { create } from "zustand";
import type { ConnectionDetail, ConnectionStatus } from "@/lib/irc/connection";
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
}

export const useChat = create<ChatState>(() => ({
  ready: false,
  settings: DEFAULT_SETTINGS,
  appInfo: null,
  channels: {},
  auth: { status: "booting" },
  read: { status: "idle", detail: {}, since: Date.now() },
  write: null,
  emoteVersions: {},
  globalEmoteVersion: 0,
  badgeVersion: 0,
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
