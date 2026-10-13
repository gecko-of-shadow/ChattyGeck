import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, HISTORY_FLUSH_MS } from "@/lib/chat/controller";
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

function resetHistoryBookkeeping(): void {
  const internal = chat as unknown as {
    historyUnsaved: Set<string>;
    historyOnDisk: Map<string, Map<string, string>>;
    historyFlushTimer: ReturnType<typeof setInterval> | null;
  };
  internal.historyUnsaved.clear();
  internal.historyOnDisk.clear();
  if (internal.historyFlushTimer) clearInterval(internal.historyFlushTimer);
  internal.historyFlushTimer = null;
}

function parseLog(raw: string | undefined): ChatMessage[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as ChatMessage);
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
    const internal = chat as unknown as { session: unknown; pendingSends: unknown[] };
    internal.session = null;
    internal.pendingSends = [];
    resetHistoryBookkeeping();
  });

  afterEach(() => {
    resetHistoryBookkeeping();
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
    await vi.advanceTimersByTimeAsync(HISTORY_FLUSH_MS);
    const saved = parseLog(memory.get("zoochattr.chat.geckotown"));
    expect(saved.map((message) => message.id)).toEqual(["twitch-99"]);
    expect(saved[0]?.pending).toBeUndefined();
  });

  it("keeps a busy channel in memory and appends once per 30 seconds", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    const schedule = (chat as unknown as { scheduleHistorySave: (channel: string) => void }).scheduleHistorySave.bind(chat);
    let writes = 0;
    const store = localStorage;
    const orig = store.setItem.bind(store);
    store.setItem = (key: string, value: string) => {
      if (key === "zoochattr.chat.geckotown") writes += 1;
      orig(key, value);
    };
    putMessage("geckotown", line("geckotown", "one", "m-0"));
    schedule("geckotown");
    for (let second = 5; second < 30; second += 5) {
      await vi.advanceTimersByTimeAsync(5_000);
      putMessage("geckotown", line("geckotown", `line ${second}`, `m-${second}`));
      schedule("geckotown");
      expect(writes).toBe(0);
    }
    await vi.advanceTimersByTimeAsync(5_000);
    expect(writes).toBe(1);
    const first = memory.get("zoochattr.chat.geckotown") ?? "";
    expect(parseLog(first).map((message) => message.id)).toEqual(["m-0", "m-5", "m-10", "m-15", "m-20", "m-25"]);
    await vi.advanceTimersByTimeAsync(HISTORY_FLUSH_MS);
    expect(writes).toBe(1);
    putMessage("geckotown", line("geckotown", "later", "m-later"));
    schedule("geckotown");
    await vi.advanceTimersByTimeAsync(HISTORY_FLUSH_MS);
    expect(writes).toBe(2);
    const second = memory.get("zoochattr.chat.geckotown") ?? "";
    expect(second.startsWith(first)).toBe(true);
    expect(parseLog(second).map((message) => message.id)).toContain("m-later");
    expect(parseLog(second).filter((message) => message.id === "m-0")).toHaveLength(1);
  });

  it("does not write history when remember is off", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: false });
    const enqueue = (chat as unknown as { enqueue: (message: ChatMessage) => void }).enqueue.bind(chat);
    enqueue(line("geckotown", "quiet", "quiet-1"));
    await vi.advanceTimersByTimeAsync(HISTORY_FLUSH_MS + 1_000);
    await chat.flushSavedHistory();
    expect(memory.has("zoochattr.chat.geckotown")).toBe(false);
  });

  it("loads the file and keeps lines that arrived while it was loading", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    const saved = line("geckotown", "from disk", "disk-1");
    const arrived = line("geckotown", "while loading", "live-1");
    const original = `${JSON.stringify(saved)}\n`;
    memory.set("zoochattr.chat.geckotown", original);
    putMessage("geckotown", { ...saved, deleted: true });
    putMessage("geckotown", arrived);
    const restore = (chat as unknown as { restoreHistory: (channels: string[]) => Promise<void> }).restoreHistory.bind(chat);
    await restore(["geckotown"]);
    const messages = useChat.getState().channels.geckotown.messages;
    expect(messages.filter((message) => message.id === "disk-1")).toHaveLength(1);
    expect(messages.find((message) => message.id === "disk-1")?.deleted).toBe(true);
    expect(messages.some((message) => message.id === "live-1")).toBe(true);
    expect(messages.some((message) => message.id.startsWith("hist-boundary:"))).toBe(true);
    expect(memory.get("zoochattr.chat.geckotown")).toBe(original);
    await vi.advanceTimersByTimeAsync(HISTORY_FLUSH_MS);
    const next = memory.get("zoochattr.chat.geckotown") ?? "";
    expect(next.startsWith(original)).toBe(true);
    const ids = parseLog(next).map((message) => message.id);
    expect(ids.filter((id) => id === "disk-1")).toHaveLength(2);
    expect(ids).toContain("live-1");
    expect(parseLog(next).filter((message) => message.id === "disk-1").at(-1)?.deleted).toBe(true);
  });

  it("flushes a message still waiting in the paint queue", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    const enqueue = (chat as unknown as { enqueue: (message: ChatMessage) => void }).enqueue.bind(chat);
    enqueue(line("geckotown", "queued", "queued-1"));
    expect(useChat.getState().channels.geckotown.messages).toHaveLength(0);
    await chat.flushSavedHistory();
    expect(useChat.getState().channels.geckotown.messages.map((message) => message.id)).toEqual(["queued-1"]);
    expect(parseLog(memory.get("zoochattr.chat.geckotown")).map((message) => message.id)).toEqual(["queued-1"]);
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
