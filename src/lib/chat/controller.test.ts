import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "@/lib/chat/controller";
import { newChannelView, useChat } from "@/store/chat";
import { DEFAULT_SETTINGS } from "@/store/settings";
import type { ChatMessage } from "@/lib/twitch/types";
import type { IrcMessage } from "@/lib/irc/parser";

const memory = new Map<string, string>();

function installStorage(): void {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => void memory.set(key, value),
    removeItem: (key: string) => void memory.delete(key),
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  });
}

function line(channel: string, text: string, id = `${channel}-${text}`): ChatMessage {
  return {
    id,
    channel,
    kind: "chat",
    ts: Date.now(),
    login: "someone",
    displayName: "Someone",
    badges: [],
    text,
    twitchEmotes: [],
  };
}

function seed(options: {
  mode: "grid" | "focused";
  focused: string | null;
  gridChannels: string[];
  channels: string[];
  remember?: boolean;
}): void {
  useChat.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      channels: options.channels,
      gridChannels: options.gridChannels,
      mode: options.mode,
      focused: options.focused,
      rememberChatHistory: options.remember ?? false,
    },
    channels: Object.fromEntries(options.channels.map((name) => [name, { ...newChannelView(name), status: "joined" as const }])),
  });
}

function putMessage(channel: string, message: ChatMessage): void {
  useChat.setState((state) => {
    const view = state.channels[channel];
    return { channels: { ...state.channels, [channel]: { ...view, messages: [...view.messages, message] } } };
  });
}

describe("chat controller view and history", () => {
  beforeEach(() => {
    memory.clear();
    installStorage();
    vi.stubGlobal("document", { hasFocus: () => true });
    vi.useFakeTimers();
    const internal = chat as unknown as { session: unknown; pendingSends: unknown[]; historyDirty: Set<string> };
    internal.session = null;
    internal.pendingSends = [];
    internal.historyDirty.clear();
  });

  afterEach(() => {
    const internal = chat as unknown as { historyTimers: Map<string, ReturnType<typeof setTimeout>>; historyDirty: Set<string> };
    for (const timer of internal.historyTimers.values()) clearTimeout(timer);
    internal.historyTimers.clear();
    internal.historyDirty.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("counts unread for a focused channel that is not on the grid", async () => {
    seed({ mode: "grid", focused: "offgrid", gridChannels: ["geckotown"], channels: ["geckotown", "offgrid"] });
    const enqueue = (chat as unknown as { enqueue: (message: ChatMessage) => void }).enqueue.bind(chat);
    enqueue(line("offgrid", "hidden"));
    enqueue(line("geckotown", "visible"));
    await vi.advanceTimersByTimeAsync(100);
    const state = useChat.getState();
    expect(state.channels.offgrid.unread).toBe(1);
    expect(state.channels.offgrid.mentions).toBe(0);
    expect(state.channels.geckotown.unread).toBe(0);
  });

  it("still counts the other channel while one chat is focused", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown", "offgrid"], channels: ["geckotown", "offgrid"] });
    const enqueue = (chat as unknown as { enqueue: (message: ChatMessage) => void }).enqueue.bind(chat);
    enqueue({ ...line("offgrid", "hey @me", "mention-1"), mention: true });
    enqueue(line("geckotown", "looking"));
    await vi.advanceTimersByTimeAsync(100);
    const state = useChat.getState();
    expect(state.channels.offgrid.unread).toBe(1);
    expect(state.channels.offgrid.mentions).toBe(1);
    expect(state.channels.geckotown.unread).toBe(0);
  });

  it("remembers where you left an off-grid channel, and does not mark a channel you can still see", () => {
    seed({ mode: "focused", focused: "offgrid", gridChannels: ["geckotown"], channels: ["geckotown", "offgrid"] });
    putMessage("offgrid", line("offgrid", "before", "last-off"));
    putMessage("geckotown", line("geckotown", "live", "last-grid"));
    chat.setMode("grid");
    expect(useChat.getState().channels.offgrid.readMarker).toBe("last-off");
    expect(useChat.getState().channels.geckotown.readMarker).toBeUndefined();

    chat.focus("offgrid");
    expect(useChat.getState().settings.mode).toBe("focused");
    expect(useChat.getState().channels.offgrid.readMarker).toBe("last-off");
    expect(useChat.getState().channels.offgrid.unread).toBe(0);

    chat.focus("geckotown");
    chat.setMode("grid");
    expect(useChat.getState().channels.geckotown.readMarker).toBeUndefined();
  });

  it("stamps a read marker when a grid box is hidden", () => {
    seed({ mode: "grid", focused: "geckotown", gridChannels: ["geckotown", "lizardlounge"], channels: ["geckotown", "lizardlounge"] });
    putMessage("lizardlounge", line("lizardlounge", "seen", "liz-1"));
    chat.hideFromGrid("lizardlounge");
    const state = useChat.getState();
    expect(state.settings.gridChannels).toEqual(["geckotown"]);
    expect(state.channels.lizardlounge.readMarker).toBe("liz-1");
  });

  it("writes a replaced pending line after the history timer already stripped it", async () => {
    seed({
      mode: "focused",
      focused: "geckotown",
      gridChannels: ["geckotown"],
      channels: ["geckotown"],
      remember: true,
    });
    putMessage("geckotown", { ...line("geckotown", "hello", "send-abc"), self: true, pending: "sending", login: "me" });
    const replace = (
      chat as unknown as {
        replaceMessage: (channel: string, id: string, update: (message: ChatMessage) => ChatMessage) => void;
      }
    ).replaceMessage.bind(chat);
    replace("geckotown", "send-abc", (message) => ({ ...message, id: "twitch-99", pending: undefined }));
    expect(memory.has("zoochattr.chat.geckotown")).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    const saved = JSON.parse(memory.get("zoochattr.chat.geckotown") ?? "[]") as ChatMessage[];
    expect(saved.map((message) => message.id)).toEqual(["twitch-99"]);
    expect(saved[0]?.pending).toBeUndefined();
  });

  it("replaces a local send when the echo arrives after the tracker expired", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"] });
    putMessage("geckotown", {
      ...line("geckotown", "hello", "send-late"),
      self: true,
      pending: "failed",
      login: "me",
      ts: Date.now(),
    });
    const internal = chat as unknown as { session: unknown; onReadMessage: (message: IrcMessage) => void };
    internal.session = {
      login: "me",
      userId: "1",
      clientId: "cid",
      accessToken: "token",
      expiresAt: Date.now() + 60_000,
      scopes: [],
    };
    internal.onReadMessage({
      raw: "",
      tags: { id: "twitch-late", login: "me", "display-name": "Me", "tmi-sent-ts": String(Date.now()) },
      prefix: "me!me@me.tmi.twitch.tv",
      nick: "me",
      command: "PRIVMSG",
      params: ["#geckotown", "hello"],
    });
    await vi.advanceTimersByTimeAsync(100);
    const messages = useChat.getState().channels.geckotown.messages;
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("twitch-late");
    expect(messages[0]?.pending).toBeUndefined();
    internal.session = null;
  });
});
