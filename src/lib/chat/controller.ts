import { toast } from "sonner";
import { config } from "@/lib/config";
import { emoteRegistry } from "@/lib/emotes/registry";
import { IrcConnection, type ConnectionDetail, type ConnectionStatus } from "@/lib/irc/connection";
import { channelFromParam, type IrcMessage } from "@/lib/irc/parser";
import * as platform from "@/lib/platform";
import { refreshSession, revokeToken, validateToken, type Session } from "@/lib/twitch/auth";
import {
  HelixUnauthorizedError,
  fetchChannelBadges,
  fetchGlobalBadges,
  fetchUsers,
  publicBadge,
  type BadgeImage,
  type BadgeMap,
} from "@/lib/twitch/helix";
import {
  localId,
  noticeToChat,
  normalizeChannelName,
  parseRoomState,
  parseUserState,
  privmsgToChat,
  systemMessage,
  usernoticeToChat,
} from "@/lib/twitch/messages";
import type { Badge, ChatMessage } from "@/lib/twitch/types";
import { newChannelView, useChat, type ChannelView } from "@/store/chat";
import { sanitizeSettings, type Settings, type ViewMode } from "@/store/settings";

/** System lines addressed to this pseudo-channel show up in every view. */
export const ALL_CHANNELS = "*";

const JOIN_TIMEOUT_MS = 45_000;
const EMOTE_RELOAD_GAP_MS = 5 * 60_000;
const REFRESH_MARGIN_MS = 5 * 60_000;

interface PendingSend {
  id: string;
  channel: string;
  text: string;
  state: "sending" | "sent";
  timer: ReturnType<typeof setTimeout>;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const get = useChat.getState;
const set = useChat.setState;

function anonymousNick(): string {
  return `justinfan${Math.floor(10_000 + Math.random() * 89_999)}`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

class ChatController {
  private session: Session | null = null;
  private readonly read: IrcConnection;
  private write: IrcConnection | null = null;
  private queue: ChatMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private saveDirty = false;
  private saveErrorShown = false;
  private pendingSends: PendingSend[] = [];
  private sentLog: number[] = [];
  private globalBadges: BadgeMap = new Map();
  private channelBadges = new Map<string, BadgeMap>();
  private emoteLoadedAt = new Map<string, number>();
  private refreshing: Promise<Session | null> | null = null;
  private recoveringAuth = false;
  private everConnected = false;
  private dropAnnounced = false;
  private booted = false;
  private lastAttention = 0;

  constructor() {
    this.read = new IrcConnection({
      url: config.ircUrl,
      name: "read",
      getCredentials: async () => {
        const session = this.session ? await this.freshSession() : null;
        return session ? { nick: session.login, pass: `oauth:${session.accessToken}` } : { nick: anonymousNick() };
      },
      onMessage: (message) => this.onReadMessage(message),
      onStatus: (status, detail) => this.onReadStatus(status, detail),
    });

    emoteRegistry.subscribe((channel) => {
      if (channel === null) set((s) => ({ globalEmoteVersion: s.globalEmoteVersion + 1 }));
      else set((s) => ({ emoteVersions: { ...s.emoteVersions, [channel]: (s.emoteVersions[channel] ?? 0) + 1 } }));
    });
  }

  // ---------------------------------------------------------------- lifecycle

  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    const [rawSettings, appInfo] = await Promise.all([
      platform.loadSettings().catch((err) => {
        toast.error("Couldn't read your saved settings", { description: errorText(err) });
        return null;
      }),
      platform.getAppInfo().catch(() => null),
    ]);
    const settings = sanitizeSettings(rawSettings);
    set({
      settings,
      appInfo,
      channels: Object.fromEntries(settings.channels.map((c) => [c, newChannelView(c)])),
      ready: true,
    });

    const stored = await platform.loadSession().catch((err) => {
      toast.error("Couldn't read your saved Twitch login", { description: errorText(err) });
      return null;
    });
    if (stored) {
      const session = await this.revalidate(stored);
      if (session) this.setSession(session, true);
      else {
        this.setSession(null);
        toast.warning("Your Twitch login expired", { description: "You're reading anonymously. Log in again to chat." });
      }
    } else {
      this.setSession(null);
    }

    for (const channel of settings.channels) this.read.join(channel);
    this.read.start();
    if (this.session) this.startWrite();

    void emoteRegistry.loadGlobal();
    if (this.session) {
      void this.loadGlobalBadges();
      void this.loadProfiles(settings.channels);
    }

    window.addEventListener("online", () => {
      this.read.retryNow();
      this.write?.retryNow();
    });
    setInterval(() => this.tick(), 5_000);
    setInterval(() => void this.validateHourly(), 60 * 60_000);
  }

  // ---------------------------------------------------------------- auth

  get clientId(): string {
    return get().settings.clientId || config.builtInClientId;
  }

  private setSession(session: Session | null, remembered = true): void {
    this.session = session;
    set({
      auth: session
        ? { status: "logged_in", login: session.login, userId: session.userId, remembered }
        : { status: "anonymous" },
    });
  }

  private async persistSession(session: Session): Promise<boolean> {
    try {
      await platform.saveSession(session);
      return true;
    } catch (err) {
      toast.warning("Logged in, but your login couldn't be saved", {
        description: `${get().appInfo?.tokenStore ?? "The credential store"} said: ${errorText(err)}. You'll need to log in again next launch.`,
      });
      return false;
    }
  }

  /** Validates a stored session; refreshes it if Twitch says it expired. Keeps it when offline. */
  private async revalidate(session: Session): Promise<Session | null> {
    try {
      const info = await validateToken(session.accessToken);
      if (info) {
        return {
          ...session,
          login: info.login,
          userId: info.user_id,
          scopes: info.scopes ?? session.scopes,
          expiresAt: Date.now() + (info.expires_in || 4 * 3600) * 1000,
        };
      }
      const refreshed = await refreshSession(session);
      if (refreshed) {
        await this.persistSession(refreshed);
        return refreshed;
      }
      await platform.clearSession().catch(() => undefined);
      return null;
    } catch {
      return session;
    }
  }

  private refreshOnce(): Promise<Session | null> {
    if (!this.session) return Promise.resolve(null);
    if (!this.refreshing) {
      const current = this.session;
      this.refreshing = refreshSession(current)
        .then(async (next) => {
          if (next && this.session === current) {
            const remembered = await this.persistSession(next);
            this.setSession(next, remembered);
          }
          return next;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  /** The current session with a token that's good for at least a few more minutes. */
  private async freshSession(): Promise<Session | null> {
    if (!this.session) return null;
    if (this.session.expiresAt - Date.now() > REFRESH_MARGIN_MS) return this.session;
    try {
      const next = await this.refreshOnce();
      if (next) return next;
      await this.logout("Your Twitch login expired, so ChatDeck switched to anonymous reading. Log in again to chat.");
      return null;
    } catch {
      return this.session;
    }
  }

  private async recoverAuth(): Promise<void> {
    if (this.recoveringAuth) return;
    if (!this.session) {
      setTimeout(() => this.read.restart("Retrying anonymously"), 5_000);
      return;
    }
    this.recoveringAuth = true;
    try {
      let next: Session | null | undefined;
      try {
        next = await this.refreshOnce();
      } catch {
        next = undefined;
      }
      if (next) {
        this.read.restart("Logged back in");
        this.write?.restart("Logged back in");
      } else if (next === null) {
        await this.logout("Twitch rejected your saved login, so ChatDeck switched to anonymous reading. Log in again to chat.");
      } else {
        setTimeout(() => {
          this.read.restart("Retrying login");
          this.write?.restart("Retrying login");
        }, 15_000);
      }
    } finally {
      this.recoveringAuth = false;
    }
  }

  private async validateHourly(): Promise<void> {
    if (!this.session) return;
    try {
      const info = await validateToken(this.session.accessToken);
      if (!info) await this.recoverAuth();
      else this.session = { ...this.session, expiresAt: Date.now() + (info.expires_in || 4 * 3600) * 1000 };
    } catch {
      // Offline; try again next hour.
    }
  }

  async completeLogin(session: Session): Promise<void> {
    const remembered = await this.persistSession(session);
    this.setSession(session, remembered);
    this.read.restart("Logging in");
    this.startWrite();
    void this.loadGlobalBadges();
    void this.loadProfiles(get().settings.channels);
    for (const channel of Object.values(get().channels)) {
      if (channel.roomId) void this.loadChannelBadges(channel.login, channel.roomId);
    }
    toast.success(`Logged in as ${session.login}`, { description: "Your messages go out as you now." });
  }

  async logout(reason?: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    this.setSession(null);
    this.stopWrite();
    for (const pending of this.pendingSends) clearTimeout(pending.timer);
    this.pendingSends = [];
    this.globalBadges = new Map();
    this.channelBadges.clear();
    set((s) => ({
      badgeVersion: s.badgeVersion + 1,
      channels: Object.fromEntries(Object.entries(s.channels).map(([k, c]) => [k, { ...c, me: undefined }])),
    }));
    this.read.restart("Switching to anonymous reading");
    await platform.clearSession().catch(() => undefined);
    if (reason) toast.warning(reason);
    else {
      void revokeToken(session.clientId, session.accessToken);
      toast("Logged out", { description: "Still reading chat anonymously." });
    }
  }

  // ---------------------------------------------------------------- connections

  private startWrite(): void {
    this.stopWrite();
    const write = new IrcConnection({
      url: config.ircUrl,
      name: "write",
      joinChannels: false,
      getCredentials: async () => {
        const session = await this.freshSession();
        if (!session) throw new Error("Not logged in");
        return { nick: session.login, pass: `oauth:${session.accessToken}` };
      },
      onMessage: (message) => this.onWriteMessage(message),
      onStatus: (status, detail) => {
        if (this.write !== write) return;
        set({ write: { status, detail, since: Date.now() } });
        if (status === "auth_failed") void this.recoverAuth();
      },
    });
    this.write = write;
    write.start();
  }

  private stopWrite(): void {
    const write = this.write;
    this.write = null;
    write?.stop();
    set({ write: null });
  }

  retryNow(): void {
    this.read.retryNow();
    this.write?.retryNow();
  }

  private onReadStatus(status: ConnectionStatus, detail: ConnectionDetail): void {
    set({ read: { status, detail, since: Date.now() } });
    if (status === "connected") {
      const now = Date.now();
      set((s) => ({
        channels: Object.fromEntries(
          Object.entries(s.channels).map(([k, c]) => [k, { ...c, status: "joining" as const, joinRequestedAt: now }]),
        ),
      }));
      if (this.dropAnnounced) {
        this.enqueue(systemMessage(ALL_CHANNELS, "Reconnected. Anything said while ChatDeck was offline was missed.", "success"));
        this.dropAnnounced = false;
      }
      this.everConnected = true;
    } else if (status === "reconnecting" && this.everConnected && !this.dropAnnounced) {
      this.dropAnnounced = true;
      this.enqueue(
        systemMessage(ALL_CHANNELS, `Lost the connection to Twitch chat (${detail.reason ?? "network error"}). Reconnecting…`, "warn"),
      );
    } else if (status === "auth_failed") {
      void this.recoverAuth();
    }
  }

  private onReadMessage(message: IrcMessage): void {
    const self = this.session?.login;
    switch (message.command) {
      case "PRIVMSG": {
        const chat = privmsgToChat(message, self);
        if (chat.self && this.resolvePending(chat)) return;
        this.enqueue(chat);
        return;
      }
      case "USERNOTICE":
        this.enqueue(usernoticeToChat(message, self));
        return;
      case "ROOMSTATE":
        this.onRoomState(message);
        return;
      case "USERSTATE":
        this.onUserState(message);
        return;
      case "NOTICE":
        this.onNotice(message, false);
        return;
      case "CLEARCHAT":
        this.onClearChat(message);
        return;
      case "CLEARMSG":
        this.onClearMsg(message);
        return;
    }
  }

  private onWriteMessage(message: IrcMessage): void {
    if (message.command === "USERSTATE") {
      this.onUserState(message);
      this.markPendingSent(channelFromParam(message.params[0]));
    } else if (message.command === "NOTICE") {
      this.onNotice(message, true);
    }
  }

  private onRoomState(message: IrcMessage): void {
    const channel = channelFromParam(message.params[0]);
    const current = get().channels[channel];
    if (!current) return;
    const state = parseRoomState(message);
    const roomChanged = !!state.roomId && state.roomId !== current.roomId;
    const nowJoined = !!state.roomId && current.status !== "joined";
    this.patchChannel(channel, (c) => ({
      ...c,
      roomState: { ...c.roomState, ...state },
      roomId: state.roomId ?? c.roomId,
      status: state.roomId ? "joined" : c.status,
      error: state.roomId ? undefined : c.error,
    }));
    if (state.roomId && (nowJoined || roomChanged)) {
      const lastLoad = this.emoteLoadedAt.get(channel) ?? 0;
      if (roomChanged || Date.now() - lastLoad > EMOTE_RELOAD_GAP_MS) {
        this.emoteLoadedAt.set(channel, Date.now());
        void emoteRegistry.loadChannel(channel, state.roomId);
      }
      if (this.session && (roomChanged || !this.channelBadges.has(channel))) {
        void this.loadChannelBadges(channel, state.roomId);
      }
    }
  }

  private onUserState(message: IrcMessage): void {
    const channel = channelFromParam(message.params[0]);
    if (!get().channels[channel]) return;
    const me = parseUserState(message);
    this.patchChannel(channel, (c) => ({ ...c, me }));
  }

  private onNotice(message: IrcMessage, fromWrite: boolean): void {
    const channel = channelFromParam(message.params[0]);
    const text = message.params[1] ?? "";
    const msgId = message.tags["msg-id"] ?? "";
    if (!channel || channel === "*" || !get().channels[channel]) return;
    if (msgId === "msg_channel_suspended") {
      this.patchChannel(channel, (c) => ({ ...c, status: "error", error: text || "This channel is suspended." }));
    }
    if (fromWrite && this.failPending(channel, text)) return;
    const notice = noticeToChat(message);
    if (notice) this.enqueue(notice);
  }

  private onClearChat(message: IrcMessage): void {
    const channel = channelFromParam(message.params[0]);
    const target = message.params[1]?.toLowerCase();
    if (!get().channels[channel]) return;
    if (!target) {
      this.enqueue(systemMessage(channel, "A moderator cleared the chat."));
      return;
    }
    this.markDeleted(channel, (m) => m.login === target);
  }

  private onClearMsg(message: IrcMessage): void {
    const channel = channelFromParam(message.params[0]);
    const targetId = message.tags["target-msg-id"];
    if (targetId) this.markDeleted(channel, (m) => m.id === targetId);
  }

  // ---------------------------------------------------------------- sending

  send(channel: string, raw: string): ActionResult {
    const text = raw.trim();
    if (!text) return { ok: false };
    if (!this.session || !this.write) return { ok: false, error: "Log in with Twitch to chat. Reading works without it." };
    const view = get().channels[channel];
    if (!view) return { ok: false, error: "Join that channel first." };
    if (Array.from(text).length > 500) return { ok: false, error: "Twitch messages max out at 500 characters." };

    let wire = text;
    let shown = text;
    let kind: ChatMessage["kind"] = "chat";
    if (text.startsWith("/")) {
      const command = text.split(/\s/, 1)[0].toLowerCase();
      if (command !== "/me") {
        return {
          ok: false,
          error: `${command} isn't available here. Twitch retired chat commands over IRC; only /me still works.`,
        };
      }
      shown = text.slice(3).trim();
      if (!shown) return { ok: false, error: "Add a message after /me." };
      wire = `\u0001ACTION ${shown}\u0001`;
      kind = "action";
    }

    const limit = view.me?.mod ? 100 : 20;
    const now = Date.now();
    this.sentLog = this.sentLog.filter((t) => now - t < 30_000);
    if (this.sentLog.length >= limit) {
      return { ok: false, error: `Easy there: Twitch allows ${limit} messages every 30 seconds.` };
    }
    if (!this.write.privmsg(channel, wire)) {
      return { ok: false, error: "Not connected to Twitch chat right now. Your message wasn't sent." };
    }
    this.sentLog.push(now);

    const id = localId("send");
    const me = view.me;
    this.enqueue({
      id,
      channel,
      kind,
      ts: now,
      login: this.session.login,
      userId: this.session.userId,
      displayName: me?.displayName ?? this.session.login,
      color: me?.color,
      badges: me?.badges ?? [],
      text: shown,
      twitchEmotes: [],
      self: true,
      pending: "sending",
    });
    this.pendingSends.push({
      id,
      channel,
      text: shown,
      state: "sending",
      timer: setTimeout(() => this.expirePending(id), 10_000),
    });
    return { ok: true };
  }

  /** Twitch echoes our message on the read connection with full emote tags; swap it in. */
  private resolvePending(echo: ChatMessage): boolean {
    let index = this.pendingSends.findIndex((p) => p.channel === echo.channel && p.text === echo.text);
    if (index < 0) index = this.pendingSends.findIndex((p) => p.channel === echo.channel);
    if (index < 0) return false;
    const [pending] = this.pendingSends.splice(index, 1);
    clearTimeout(pending.timer);
    this.replaceMessage(pending.id, () => echo);
    return true;
  }

  private markPendingSent(channel: string): void {
    const pending = this.pendingSends.find((p) => p.channel === channel && p.state === "sending");
    if (!pending) return;
    pending.state = "sent";
    this.replaceMessage(pending.id, (m) => ({ ...m, pending: undefined }));
  }

  private failPending(channel: string, reason: string): boolean {
    const index = this.pendingSends.findIndex((p) => p.channel === channel);
    if (index < 0) return false;
    const [pending] = this.pendingSends.splice(index, 1);
    clearTimeout(pending.timer);
    this.replaceMessage(pending.id, (m) => ({ ...m, pending: "failed", failReason: reason }));
    return true;
  }

  private expirePending(id: string): void {
    const index = this.pendingSends.findIndex((p) => p.id === id);
    if (index < 0) return;
    const [pending] = this.pendingSends.splice(index, 1);
    if (pending.state === "sending") {
      this.replaceMessage(id, (m) => ({
        ...m,
        pending: "failed",
        failReason: "Twitch never confirmed this message, so it probably wasn't sent.",
      }));
    }
  }

  // ---------------------------------------------------------------- message buffer

  /** Total messages received since launch (for soak stats). */
  received = 0;

  private enqueue(message: ChatMessage): void {
    this.received++;
    this.queue.push(message);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 80);
  }

  private flush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (!this.queue.length) return;
    const batch = this.queue;
    this.queue = [];

    if (batch.some((m) => m.mention && !m.self) && !document.hasFocus() && Date.now() - this.lastAttention > 10_000) {
      this.lastAttention = Date.now();
      void platform.requestAttention().catch(() => undefined);
    }

    set((state) => {
      const { mode, focused } = state.settings;
      const additions = new Map<string, ChatMessage[]>();
      const counts = new Map<string, { unread: number; mentions: number }>();
      const mergedAdd: ChatMessage[] = [];
      const add = (channel: string, message: ChatMessage) => {
        const list = additions.get(channel);
        if (list) list.push(message);
        else additions.set(channel, [message]);
      };

      for (const message of batch) {
        if (message.channel === ALL_CHANNELS) {
          mergedAdd.push(message);
          for (const channel of Object.keys(state.channels)) add(channel, message);
          continue;
        }
        if (!state.channels[message.channel]) continue;
        add(message.channel, message);
        mergedAdd.push(message);
        const visible = mode === "merged" || focused === message.channel;
        const countable = message.kind === "chat" || message.kind === "action" || message.kind === "event";
        if (!visible && countable && !message.self) {
          const c = counts.get(message.channel) ?? { unread: 0, mentions: 0 };
          c.unread++;
          if (message.mention) c.mentions++;
          counts.set(message.channel, c);
        }
      }

      const channels = { ...state.channels };
      for (const [channel, list] of additions) {
        const view = channels[channel];
        const next = view.messages.concat(list);
        const c = counts.get(channel);
        channels[channel] = {
          ...view,
          messages: next.length > config.messageCapPerChannel ? next.slice(-config.messageCapPerChannel) : next,
          unread: view.unread + (c?.unread ?? 0),
          mentions: view.mentions + (c?.mentions ?? 0),
        };
      }
      const merged = state.merged.concat(mergedAdd);
      return {
        channels,
        merged: merged.length > config.messageCapMerged ? merged.slice(-config.messageCapMerged) : merged,
      };
    });
  }

  private replaceMessage(id: string, update: (message: ChatMessage) => ChatMessage): void {
    this.flush();
    set((state) => {
      let changed = false;
      const swap = (list: ChatMessage[]) => {
        const index = list.findIndex((m) => m.id === id);
        if (index < 0) return list;
        changed = true;
        const next = list.slice();
        next[index] = update(list[index]);
        return next;
      };
      const merged = swap(state.merged);
      const channels = { ...state.channels };
      for (const [key, view] of Object.entries(channels)) {
        const messages = swap(view.messages);
        if (messages !== view.messages) channels[key] = { ...view, messages };
      }
      return changed ? { merged, channels } : {};
    });
  }

  private markDeleted(channel: string, match: (message: ChatMessage) => boolean): void {
    this.flush();
    set((state) => {
      const view = state.channels[channel];
      if (!view) return {};
      const hit = (m: ChatMessage) => m.channel === channel && !m.deleted && match(m);
      if (!view.messages.some(hit)) return {};
      const mark = (m: ChatMessage) => (hit(m) ? { ...m, deleted: true } : m);
      return {
        channels: { ...state.channels, [channel]: { ...view, messages: view.messages.map(mark) } },
        merged: state.merged.map(mark),
      };
    });
  }

  private patchChannel(channel: string, update: (view: ChannelView) => ChannelView): void {
    set((state) => {
      const view = state.channels[channel];
      return view ? { channels: { ...state.channels, [channel]: update(view) } } : {};
    });
  }

  // ---------------------------------------------------------------- channels & view

  addChannel(input: string): ActionResult & { channel?: string } {
    const name = normalizeChannelName(input);
    if (!name) return { ok: false, error: "That doesn't look like a Twitch channel. Use letters, numbers and underscores." };
    if (get().channels[name]) {
      this.focus(name);
      return { ok: true, channel: name };
    }
    set((s) => ({ channels: { ...s.channels, [name]: newChannelView(name) } }));
    this.updateSettings((s) => ({
      channels: [...s.channels, name],
      focused: s.mode === "focused" || !s.focused ? name : s.focused,
      sendTarget: s.mode === "focused" || !s.sendTarget ? name : s.sendTarget,
    }));
    this.read.join(name);
    if (this.session) void this.loadProfiles([name]);
    return { ok: true, channel: name };
  }

  removeChannel(name: string): void {
    this.read.part(name);
    emoteRegistry.removeChannel(name);
    this.emoteLoadedAt.delete(name);
    this.channelBadges.delete(name);
    this.pendingSends = this.pendingSends.filter((p) => {
      if (p.channel === name) clearTimeout(p.timer);
      return p.channel !== name;
    });
    this.flush();
    set((s) => {
      const channels = { ...s.channels };
      delete channels[name];
      return { channels, merged: s.merged.filter((m) => m.channel !== name) };
    });
    this.updateSettings((s) => {
      const index = s.channels.indexOf(name);
      const channels = s.channels.filter((c) => c !== name);
      const fallback = channels[Math.min(Math.max(index, 0), channels.length - 1)] ?? null;
      return {
        channels,
        focused: s.focused === name ? fallback : s.focused,
        sendTarget: s.sendTarget === name ? fallback : s.sendTarget,
      };
    });
  }

  moveChannel(name: string, offset: number): void {
    this.updateSettings((s) => {
      const index = s.channels.indexOf(name);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= s.channels.length) return {};
      const channels = s.channels.slice();
      channels.splice(index, 1);
      channels.splice(target, 0, name);
      return { channels };
    });
  }

  /** Remembers where the user stopped reading the channel they're leaving. */
  private markRead(leaving: string | null, entering: string | null): void {
    const { mode } = get().settings;
    if (mode !== "focused" || !leaving || leaving === entering) return;
    this.flush();
    this.patchChannel(leaving, (c) => ({ ...c, readMarker: c.messages[c.messages.length - 1]?.id }));
  }

  focus(name: string): void {
    const fromMerged = get().settings.mode === "merged";
    this.markRead(get().settings.focused, name);
    this.updateSettings({ mode: "focused", focused: name, sendTarget: name });
    // Coming from the merged feed, everything in this channel was already on screen.
    this.patchChannel(name, (c) => ({ ...c, unread: 0, mentions: 0, readMarker: fromMerged ? undefined : c.readMarker }));
  }

  setMode(mode: ViewMode): void {
    if (mode === "focused") {
      const { focused, channels } = get().settings;
      const target = focused ?? channels[0];
      if (target) this.focus(target);
      else this.updateSettings({ mode });
      return;
    }
    this.markRead(get().settings.focused, null);
    this.updateSettings({ mode });
    set((s) => ({
      channels: Object.fromEntries(
        Object.entries(s.channels).map(([k, c]) => [k, c.unread || c.mentions ? { ...c, unread: 0, mentions: 0 } : c]),
      ),
    }));
  }

  setSendTarget(name: string): void {
    this.updateSettings({ sendTarget: name });
  }

  reloadEmotes(channel: string): void {
    const view = get().channels[channel];
    if (!view?.roomId) {
      toast("Emotes load once Twitch confirms the channel.");
      return;
    }
    this.emoteLoadedAt.set(channel, Date.now());
    void emoteRegistry.loadChannel(channel, view.roomId);
    void emoteRegistry.loadGlobal(true);
  }

  updateSettings(patch: Partial<Settings> | ((settings: Settings) => Partial<Settings>)): void {
    set((s) => ({ settings: { ...s.settings, ...(typeof patch === "function" ? patch(s.settings) : patch) } }));
    this.saveDirty = true;
    void this.persistSettings();
  }

  /** Saves right away (so closing the window can't lose a change), one write at a time, latest state wins. */
  private async persistSettings(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      while (this.saveDirty) {
        this.saveDirty = false;
        try {
          await platform.saveSettings(get().settings);
          this.saveErrorShown = false;
        } catch (err) {
          if (!this.saveErrorShown) {
            this.saveErrorShown = true;
            toast.error("Couldn't save settings", { description: errorText(err) });
          }
        }
      }
    } finally {
      this.saving = false;
    }
  }

  private tick(): void {
    if (this.read.status !== "connected") return;
    const now = Date.now();
    for (const view of Object.values(get().channels)) {
      if (view.status === "joining" && now - view.joinRequestedAt > JOIN_TIMEOUT_MS) {
        this.patchChannel(view.login, (c) => ({
          ...c,
          status: "error",
          error: `Twitch never confirmed #${c.login}. Check the spelling; the channel may not exist or may be banned.`,
        }));
      }
    }
  }

  // ---------------------------------------------------------------- badges & profiles

  badgeImage(channel: string, badge: Badge): BadgeImage | undefined {
    const key = `${badge.setId}/${badge.version}`;
    return this.channelBadges.get(channel)?.get(key) ?? this.globalBadges.get(key) ?? publicBadge(badge.setId);
  }

  private async loadGlobalBadges(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      this.globalBadges = await fetchGlobalBadges(session);
      set((s) => ({ badgeVersion: s.badgeVersion + 1 }));
    } catch (err) {
      if (err instanceof HelixUnauthorizedError) void this.recoverAuth();
    }
  }

  private async loadChannelBadges(channel: string, roomId: string): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      this.channelBadges.set(channel, await fetchChannelBadges(session, roomId));
      set((s) => ({ badgeVersion: s.badgeVersion + 1 }));
    } catch (err) {
      if (err instanceof HelixUnauthorizedError) void this.recoverAuth();
    }
  }

  private async loadProfiles(logins: string[]): Promise<void> {
    const session = this.session;
    if (!session || !logins.length) return;
    try {
      const users = await fetchUsers(session, logins);
      for (const user of users) {
        this.patchChannel(user.login, (c) => ({ ...c, displayName: user.displayName, avatarUrl: user.avatarUrl }));
      }
      const found = new Set(users.map((u) => u.login));
      for (const login of logins) {
        if (!found.has(login)) {
          this.patchChannel(login, (c) => ({ ...c, status: "error", error: `Twitch has no channel called #${login}.` }));
        }
      }
    } catch (err) {
      if (err instanceof HelixUnauthorizedError) void this.recoverAuth();
    }
  }
}

export const chat = new ChatController();

declare global {
  interface Window {
    /** Read-only counters for soak tests; never exposes tokens. */
    __chatdeckStats?: () => Record<string, unknown>;
  }
}

if (typeof window !== "undefined") {
  window.__chatdeckStats = () => {
    const s = get();
    return {
      read: s.read.status,
      readDetail: s.read.detail,
      auth: s.auth.status,
      channels: Object.values(s.channels).map((c) => ({
        login: c.login,
        status: c.status,
        messages: c.messages.length,
        unread: c.unread,
        emotes: emoteRegistry.channelEmotes(c.login).length,
      })),
      merged: s.merged.length,
      received: chat.received,
      rows: document.querySelectorAll(".chat-row").length,
      emoteImages: document.querySelectorAll("img.chat-emote").length,
    };
  };
}
