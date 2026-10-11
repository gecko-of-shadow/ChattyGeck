export interface Badge {
  setId: string;
  version: string;
  /** Extra info from `badge-info`, e.g. exact subscription months. */
  info?: string;
}

export interface TwitchEmoteRange {
  id: string;
  /** Inclusive code-point offsets, as sent by Twitch. */
  start: number;
  end: number;
}

export type MessageKind = "chat" | "action" | "event" | "notice" | "system";
export type NoticeTone = "info" | "warn" | "error" | "success";

export interface ChatMessage {
  id: string;
  channel: string;
  kind: MessageKind;
  ts: number;
  login?: string;
  userId?: string;
  displayName?: string;
  color?: string;
  badges: Badge[];
  text: string;
  twitchEmotes: TwitchEmoteRange[];
  /** First message ever in this channel ("first chirp"). */
  firstMsg?: boolean;
  /** Highlighted with channel points. */
  highlighted?: boolean;
  reply?: { login: string; displayName: string; text: string };
  /** Twitch's own description for subs, raids, announcements… */
  systemText?: string;
  tone?: NoticeTone;
  mention?: boolean;
  self?: boolean;
  deleted?: boolean;
  pending?: "sending" | "sent" | "failed";
  failReason?: string;
}

export interface RoomState {
  roomId?: string;
  emoteOnly?: boolean;
  /** Minutes; -1 = off, 0 = any follower. */
  followersOnly?: number;
  slow?: number;
  subsOnly?: boolean;
  r9k?: boolean;
}

export interface UserState {
  displayName?: string;
  color?: string;
  badges: Badge[];
  mod: boolean;
}
