import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, HISTORY_FLUSH_MS, ALL_CHANNELS } from "@/lib/chat/controller";
import { config } from "@/lib/config";
import { newChannelView, useChat } from "@/store/chat";
import { DEFAULT_SETTINGS } from "@/store/settings";
import { useUi } from "@/store/ui";
import type { ChatMessage } from "@/lib/twitch/types";
import type { IrcMessage } from "@/lib/irc/parser";

const memory = new Map<string, string>();
const tabMemory = new Map<string, string>();

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
  // Browser stand-in for the credential store (the history server's read token lives here in dev mode).
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => tabMemory.get(key) ?? null,
    setItem: (key: string, value: string) => void tabMemory.set(key, value),
    removeItem: (key: string) => void tabMemory.delete(key),
    clear: () => tabMemory.clear(),
  });
}

/** A line as the history server stores it. */
function serverLine(id: string, ts: number, text: string): string {
  return `@id=${id};display-name=Ada;tmi-sent-ts=${ts};user-id=7 :ada!ada@ada.tmi.twitch.tv PRIVMSG #geckotown :${text}`;
}

function serverAnswer(lines: string[], status = 200): Response {
  const error = status === 401 ? "unauthorized" : null;
  return new Response(JSON.stringify({ messages: lines, error, error_code: error }), { status });
}

/** History on, a history server set, and its read token saved. */
function useHistoryServer(): void {
  useChat.setState((s) => ({ settings: { ...s.settings, historyServer: "https://logger.test" } }));
  tabMemory.set("zoochattr.historyToken", "secret");
}

type ServerInternals = {
  read: { join: (channel: string) => void };
  historyWriting: Map<string, Promise<void>>;
  restoreHistory: (channels: string[]) => Promise<void>;
  fetchServerHistory: (channels: string[]) => Promise<unknown[]>;
  applyServerHistory: (fills: unknown[]) => void;
  openChannel: (name: string) => void;
};

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
    tabMemory.clear();
    installStorage();
    vi.stubGlobal("document", { hasFocus: () => true });
    vi.useFakeTimers();
    const internal = chat as unknown as {
      session: unknown;
      pendingSends: unknown[];
      write: unknown;
      sentLog: number[];
      chatterLists: Map<string, unknown>;
      seenIds: Map<string, Set<string>>;
    };
    internal.session = null;
    internal.pendingSends = [];
    internal.write = null;
    internal.sentLog = [];
    internal.chatterLists.clear();
    internal.seenIds.clear();
    // A developer's .env may build a history server in; these tests choose their own.
    (config as { builtInHistoryServer: string }).builtInHistoryServer = "";
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

  it("fills the gap from the history server above the divider and writes it once", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    useHistoryServer();
    const now = Date.now();
    const saved = { ...line("geckotown", "before quitting", "saved-1"), ts: now - 10 * 60_000 };
    memory.set("zoochattr.chat.geckotown", `${JSON.stringify(saved)}\n`);
    const asked: URL[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      asked.push(new URL(String(input)));
      if (new Headers(init?.headers).get("Authorization") !== "Bearer secret") return serverAnswer([], 401);
      return serverAnswer([
        serverLine("saved-1", saved.ts, "before quitting"),
        serverLine("gap-1", now - 5 * 60_000, "while you were away"),
        serverLine("gap-2", now - 4 * 60_000, "still away"),
      ]);
    });
    const internal = chat as unknown as ServerInternals;
    await internal.restoreHistory(["geckotown"]);
    internal.applyServerHistory(await internal.fetchServerHistory(["geckotown"]));

    expect(asked[0].searchParams.get("after")).toBe(String(saved.ts - 120_000));
    const shape = (messages: ChatMessage[]) =>
      messages.map((message) => (message.id.startsWith("hist-boundary:") ? "|" : message.kind === "system" ? "note" : message.id));
    const messages = useChat.getState().channels.geckotown.messages;
    expect(shape(messages)).toEqual(["saved-1", "note", "gap-1", "gap-2", "|"]);
    expect(messages[1].text).toBe("Filled in 2 messages from your history server.");

    await internal.historyWriting.get("geckotown");
    expect(shape(parseLog(memory.get("zoochattr.chat.geckotown")))).toEqual(["saved-1", "note", "gap-1", "gap-2"]);

    // Asking again finds nothing new.
    internal.applyServerHistory(await internal.fetchServerHistory(["geckotown"]));
    expect(shape(useChat.getState().channels.geckotown.messages)).toEqual(["saved-1", "note", "gap-1", "gap-2", "|"]);
  });

  it("joins a channel only after the history server answered, so no line arrives twice", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    useHistoryServer();
    let answer: ((response: Response) => void) | undefined;
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => (answer = resolve)));
    const internal = chat as unknown as ServerInternals;
    const joined: string[] = [];
    const realJoin = internal.read.join;
    internal.read.join = (channel: string) => void joined.push(channel);
    try {
      internal.openChannel("geckotown");
      await vi.waitFor(() => expect(answer).toBeDefined());
      expect(joined).toEqual([]);
      answer?.(serverAnswer([serverLine("gap-1", Date.now() - 1_000, "said while closed")]));
      await vi.waitFor(() => expect(joined).toEqual(["geckotown"]));
      expect(useChat.getState().channels.geckotown.messages.some((message) => message.id === "gap-1")).toBe(true);
    } finally {
      internal.read.join = realJoin;
    }
  });

  it("still joins, and changes nothing, when the history server refuses the token", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    useHistoryServer();
    vi.stubGlobal("fetch", async () => serverAnswer([], 401));
    const internal = chat as unknown as ServerInternals;
    const joined: string[] = [];
    const realJoin = internal.read.join;
    internal.read.join = (channel: string) => void joined.push(channel);
    try {
      internal.openChannel("geckotown");
      await vi.waitFor(() => expect(joined).toEqual(["geckotown"]));
      expect(useChat.getState().channels.geckotown.messages).toEqual([]);
    } finally {
      internal.read.join = realJoin;
    }
  });

  it("uses the built-in history server quietly: nothing asked without a token, filled in with one", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    const built = config as { builtInHistoryServer: string };
    const before = built.builtInHistoryServer;
    built.builtInHistoryServer = "https://logger.test";
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return serverAnswer([serverLine("gap-1", Date.now() - 1_000, "said while closed")]);
    });
    const internal = chat as unknown as ServerInternals;
    try {
      // No token saved: no request and no warning (no fill result to report).
      expect(await internal.fetchServerHistory(["geckotown"])).toEqual([]);
      expect(asked).toEqual([]);

      tabMemory.set("zoochattr.historyToken", "secret");
      internal.applyServerHistory(await internal.fetchServerHistory(["geckotown"]));
      expect(asked[0]?.startsWith("https://logger.test/")).toBe(true);
      expect(useChat.getState().channels.geckotown.messages.some((message) => message.id === "gap-1")).toBe(true);

      // The credential store can't be read: still no warning for the built-in address.
      tabMemory.delete("zoochattr.historyToken");
      vi.stubGlobal("sessionStorage", {
        getItem: () => {
          throw new Error("store locked");
        },
        setItem: () => undefined,
        removeItem: () => undefined,
        clear: () => undefined,
      });
      asked.length = 0;
      expect(await internal.fetchServerHistory(["geckotown"])).toEqual([]);
      expect(asked).toEqual([]);
      installStorage();

      // Switched off in Settings: the built-in address isn't used either.
      useChat.setState((s) => ({ settings: { ...s.settings, historyServerOff: true } }));
      asked.length = 0;
      expect(await internal.fetchServerHistory(["geckotown"])).toEqual([]);
      expect(asked).toEqual([]);
    } finally {
      built.builtInHistoryServer = before;
    }
  });

  it("still warns when a typed history server has no token", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    useChat.setState((s) => ({ settings: { ...s.settings, historyServer: "https://logger.test" } }));
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      asked.push(String(input));
      return serverAnswer([]);
    });
    const fills = (await (chat as unknown as ServerInternals).fetchServerHistory(["geckotown"])) as { error?: unknown }[];
    expect(asked).toEqual([]);
    expect(fills).toHaveLength(1);
    expect((fills[0].error as { problem?: string }).problem).toBe("unauthorized");
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

  it("shows a live PRIVMSG once when Twitch delivers it twice", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"] });
    const internal = chat as unknown as { onReadMessage: (message: IrcMessage) => void };
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const privmsg = (id: string | undefined, text: string): IrcMessage => ({
      raw: "",
      tags: { ...(id ? { id } : {}), login: "ada", "display-name": "Ada", "tmi-sent-ts": String(Date.now()) },
      prefix: "ada!ada@ada.tmi.twitch.tv",
      nick: "ada",
      command: "PRIVMSG",
      params: ["#geckotown", text],
    });
    try {
      internal.onReadMessage(privmsg("twice-1", "hello"));
      internal.onReadMessage(privmsg("twice-1", "hello"));
      // No id: never checked, so both show.
      internal.onReadMessage(privmsg(undefined, "no id"));
      internal.onReadMessage(privmsg(undefined, "no id"));
      await vi.advanceTimersByTimeAsync(100);
      const texts = useChat.getState().channels.geckotown.messages.map((message) => message.text);
      expect(texts).toEqual(["hello", "no id", "no id"]);
      expect(debug).toHaveBeenCalledWith("[zoochattr] dropped duplicate", "geckotown", "twice-1", "ada");
    } finally {
      debug.mockRestore();
    }
  });

  it("drops a live line the history server already filled in", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    useHistoryServer();
    vi.stubGlobal("fetch", async () => serverAnswer([serverLine("gap-1", Date.now() - 1_000, "said while closed")]));
    const internal = chat as unknown as ServerInternals & { onReadMessage: (message: IrcMessage) => void };
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    try {
      await internal.restoreHistory(["geckotown"]);
      internal.applyServerHistory(await internal.fetchServerHistory(["geckotown"]));
      internal.onReadMessage({
        raw: "",
        tags: { id: "gap-1", login: "ada", "display-name": "Ada", "tmi-sent-ts": String(Date.now()) },
        prefix: "ada!ada@ada.tmi.twitch.tv",
        nick: "ada",
        command: "PRIVMSG",
        params: ["#geckotown", "said while closed"],
      });
      await vi.advanceTimersByTimeAsync(100);
      const ids = useChat.getState().channels.geckotown.messages.map((message) => message.id);
      expect(ids.filter((id) => id === "gap-1")).toHaveLength(1);
    } finally {
      debug.mockRestore();
    }
  });

  it("remembers people who spoke, newest first, and forgets them when you leave", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"] });
    const enqueue = (chat as unknown as { enqueue: (message: ChatMessage) => void }).enqueue.bind(chat);
    enqueue({ ...line("geckotown", "hi", "a"), login: "ada", displayName: "Ada" });
    enqueue({ ...line("geckotown", "yo", "b"), login: "bea", displayName: "Bea" });
    enqueue({ ...line("geckotown", "me", "c"), login: "me", displayName: "Me", self: true });
    enqueue({ ...line(ALL_CHANNELS, "everywhere", "sys"), kind: "system", login: "mod", displayName: "Mod" });
    await vi.advanceTimersByTimeAsync(100);
    expect(chat.activeChatters("geckotown").map((user) => user.login)).toEqual(["bea", "ada"]);
    chat.removeChannel("geckotown");
    expect(chat.activeChatters("geckotown")).toEqual([]);
  });

  it("seeds chatter names from restored history, newest last in the file", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"], remember: true });
    const older = { ...line("geckotown", "old", "disk-ada"), login: "ada", displayName: "Ada" };
    const newer = { ...line("geckotown", "new", "disk-bea"), login: "bea", displayName: "Bea" };
    memory.set("zoochattr.chat.geckotown", `${JSON.stringify(older)}\n${JSON.stringify(newer)}\n`);
    putMessage("geckotown", { ...line("geckotown", "live", "live-cy"), login: "cy", displayName: "Cy" });
    const restore = (chat as unknown as { restoreHistory: (channels: string[]) => Promise<void> }).restoreHistory.bind(chat);
    await restore(["geckotown"]);
    expect(chat.activeChatters("geckotown").map((user) => user.login)).toEqual(["cy", "bea", "ada"]);
  });

  it("drops your own name from tab completion once you are logged in", () => {
    const internal = chat as unknown as {
      chatterLists: Map<string, { login: string; displayName: string }[]>;
      setSession: (session: unknown, remembered?: boolean) => void;
    };
    internal.chatterLists.set("geckotown", [
      { login: "me", displayName: "Me" },
      { login: "ada", displayName: "Ada" },
    ]);
    internal.setSession(
      { login: "me", userId: "1", clientId: "c", accessToken: "t", expiresAt: 1, scopes: [] },
      true,
    );
    expect(chat.activeChatters("geckotown").map((user) => user.login)).toEqual(["ada"]);
    internal.setSession(null);
  });

  it("sends a reply tag and shows who you are answering", async () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown"] });
    const sent: { channel: string; text: string; reply?: string }[] = [];
    const internal = chat as unknown as {
      session: unknown;
      write: { privmsg: (channel: string, text: string, reply?: string) => boolean };
    };
    internal.session = { login: "me", userId: "1", clientId: "c", accessToken: "t", expiresAt: 1, scopes: [] };
    internal.write = {
      privmsg(channel: string, text: string, reply?: string) {
        sent.push({ channel, text, reply });
        return true;
      },
    };
    const parent = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    expect(chat.send("geckotown", "hello", { id: "send-not-real", login: "ada", displayName: "Ada", text: "yo" }).ok).toBe(false);
    expect(sent).toEqual([]);
    expect(
      chat.send("geckotown", "hello", { id: parent, login: "ada", displayName: "Ada", text: "yo there" }).ok,
    ).toBe(true);
    expect(sent).toEqual([{ channel: "geckotown", text: "hello", reply: parent }]);
    await vi.advanceTimersByTimeAsync(100);
    const row = useChat.getState().channels.geckotown.messages[0];
    expect(row?.reply).toEqual({ login: "ada", displayName: "Ada", text: "yo there" });
    expect(row?.pending).toBe("sending");
    internal.session = null;
    internal.write = undefined as unknown as typeof internal.write;
  });

  it("clears a reply aimed at a channel you leave", () => {
    seed({ mode: "focused", focused: "geckotown", gridChannels: ["geckotown"], channels: ["geckotown", "other"] });
    useUi.setState({
      replyTo: {
        channel: "geckotown",
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        login: "ada",
        displayName: "Ada",
        text: "hi",
        nonce: 1,
      },
    });
    chat.removeChannel("geckotown");
    expect(useUi.getState().replyTo).toBeNull();
  });
});
