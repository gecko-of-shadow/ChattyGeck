import { describe, expect, it } from "vitest";
import { historyBoundary, isHistoryBoundary } from "@/lib/chat/history";
import {
  MAX_PAGES,
  PAGE_LIMIT,
  activeHistoryServer,
  checkHistoryServer,
  fetchServerLines,
  fillNote,
  mergeServerMessages,
  newestTwitchTime,
  parseHistoryServer,
  serverMessages,
  HistoryServerError,
} from "@/lib/chat/remoteHistory";
import type { ChatMessage } from "@/lib/twitch/types";

const SERVER = "https://zoochattr-logger.gecko.workers.dev";
const T0 = 1_760_000_000_000;

/** A chat line like the logger returns: Twitch's IRC line as sent (these tests need only a few of its tags). */
function line(id: string, ts: number, text: string, login = "ada", channel = "geckotown"): string {
  return `@id=${id};badges=;color=;display-name=${login};emotes=;room-id=1;tmi-sent-ts=${ts};user-id=7 :${login}!${login}@${login}.tmi.twitch.tv PRIVMSG #${channel} :${text}`;
}

function row(id: string, ts: number, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id, channel: "geckotown", kind: "chat", ts, login: "ada", displayName: "ada", badges: [], text: id, twitchEmotes: [], ...extra };
}

interface Call {
  url: URL;
  auth: string | null;
}

/** A fake server holding `lines` (oldest first) that answers like the Worker. */
function fakeServer(lines: string[], options: { token?: string; recorded?: boolean; failOnCall?: number } = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const auth = new Headers(init?.headers).get("Authorization");
    calls.push({ url, auth });
    if (options.failOnCall === calls.length) throw new TypeError("Failed to fetch");
    if (auth !== `Bearer ${options.token ?? "secret"}`) {
      return new Response(JSON.stringify({ messages: [], error: "Unauthorized", error_code: "unauthorized" }), { status: 401 });
    }
    if (options.recorded === false) {
      return new Response(JSON.stringify({ messages: [], error: "not recorded", error_code: "channel_not_joined" }), { status: 404 });
    }
    const after = url.searchParams.has("after") ? Number(url.searchParams.get("after")) : -Infinity;
    const before = url.searchParams.has("before") ? Number(url.searchParams.get("before")) : Infinity;
    const limit = Number(url.searchParams.get("limit"));
    const picked = lines.filter((text) => {
      const ts = Number(/tmi-sent-ts=(\d+)/.exec(text)?.[1]);
      return ts > after && ts < before;
    });
    return new Response(JSON.stringify({ messages: picked.slice(-limit), error: null, error_code: null }), { status: 200 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("activeHistoryServer", () => {
  it("uses the typed address, else the built-in one, and nothing when switched off", () => {
    const mine = "https://mine.example";
    expect(activeHistoryServer({ historyServer: "", historyServerOff: false }, SERVER)).toBe(SERVER);
    expect(activeHistoryServer({ historyServer: mine, historyServerOff: false }, SERVER)).toBe(mine);
    expect(activeHistoryServer({ historyServer: "", historyServerOff: true }, SERVER)).toBe("");
    expect(activeHistoryServer({ historyServer: mine, historyServerOff: true }, SERVER)).toBe("");
    expect(activeHistoryServer({ historyServer: "", historyServerOff: false }, "")).toBe("");
    // A built-in address the token could leak to is never used (plain http only on this computer, for the mock).
    expect(activeHistoryServer({ historyServer: "", historyServerOff: false }, "http://logger.example")).toBe("");
    expect(activeHistoryServer({ historyServer: "", historyServerOff: false }, "http://127.0.0.1:17423")).toBe("http://127.0.0.1:17423");
  });
});

describe("parseHistoryServer", () => {
  it("keeps only the origin of an https address", () => {
    expect(parseHistoryServer(`  ${SERVER}/api/v2/recent-messages/x?after=1  `)).toBe(SERVER);
    expect(parseHistoryServer("zoochattr-logger.gecko.workers.dev")).toBe(SERVER);
  });

  it("is empty when blank and null when the token could leak", () => {
    expect(parseHistoryServer("   ")).toBe("");
    expect(parseHistoryServer("http://zoochattr-logger.gecko.workers.dev")).toBeNull();
    expect(parseHistoryServer("https://user:pass@example.com")).toBeNull();
    expect(parseHistoryServer("ftp://example.com")).toBeNull();
    expect(parseHistoryServer("https://exa mple.com")).toBeNull();
  });

  it("allows plain http on this computer, for the mock server", () => {
    expect(parseHistoryServer("http://127.0.0.1:17423/")).toBe("http://127.0.0.1:17423");
    expect(parseHistoryServer("http://localhost:8787")).toBe("http://localhost:8787");
  });
});

describe("fetchServerLines", () => {
  it("asks for the gap with the token and returns the lines oldest first", async () => {
    const lines = [line("a", T0 + 1_000, "one"), line("b", T0 + 2_000, "two")];
    const server = fakeServer(lines);
    const result = await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", after: T0, fetchImpl: server.fetchImpl });
    expect(result).toEqual({ lines, truncated: false });
    expect(server.calls).toHaveLength(1);
    const call = server.calls[0];
    expect(call.auth).toBe("Bearer secret");
    expect(`${call.url.origin}${call.url.pathname}`).toBe(`${SERVER}/api/v2/recent-messages/geckotown`);
    expect(call.url.searchParams.get("after")).toBe(String(T0));
    expect(call.url.searchParams.get("limit")).toBe(String(PAGE_LIMIT));
    expect(call.url.searchParams.has("before")).toBe(false);
  });

  it("pages back with before until a short page, keeping time order", async () => {
    const lines = Array.from({ length: PAGE_LIMIT * 2 + 5 }, (_, i) => line(`m${i}`, T0 + i * 10, `line ${i}`));
    const server = fakeServer(lines);
    const result = await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl: server.fetchImpl });
    expect(server.calls).toHaveLength(3);
    expect(server.calls[1].url.searchParams.get("before")).toBe(String(T0 + (PAGE_LIMIT + 5) * 10 + 1));
    expect(result?.truncated).toBe(false);
    const messages = serverMessages(result?.lines ?? []);
    expect(messages.map((message) => message.id)).toEqual(lines.map((_, i) => `m${i}`));
  });

  it("stops after the page cap and says the gap's oldest part is missing", async () => {
    const lines = Array.from({ length: PAGE_LIMIT * (MAX_PAGES + 1) }, (_, i) => line(`m${i}`, T0 + i, `line ${i}`));
    const server = fakeServer(lines);
    const result = await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl: server.fetchImpl });
    expect(server.calls).toHaveLength(MAX_PAGES);
    expect(result?.truncated).toBe(true);
    expect(serverMessages(result?.lines ?? []).at(-1)?.id).toBe(`m${lines.length - 1}`);
  });

  it("keeps the pages it got when a later page fails", async () => {
    const lines = Array.from({ length: PAGE_LIMIT + 3 }, (_, i) => line(`m${i}`, T0 + i, `line ${i}`));
    const server = fakeServer(lines, { failOnCall: 2 });
    const result = await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl: server.fetchImpl });
    expect(result?.truncated).toBe(true);
    expect(result?.lines).toHaveLength(PAGE_LIMIT);
  });

  it("calls fetch bare, as the browser's fetch requires", async () => {
    const { fetchImpl } = fakeServer([line("a", T0, "one")]);
    const browserLike = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
      return fetchImpl(input, init);
    } as typeof fetch;
    const result = await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl: browserLike });
    expect(result?.lines).toHaveLength(1);
    expect(await checkHistoryServer(SERVER, "secret", "geckotown", browserLike)).toEqual({ ok: true, recorded: true });
  });

  it("is null for a channel the logger doesn't record", async () => {
    const server = fakeServer([], { recorded: false });
    expect(await fetchServerLines({ server: SERVER, token: "secret", channel: "other", fetchImpl: server.fetchImpl })).toBeNull();
  });

  it("names the problem when the token, network or answer is wrong", async () => {
    const problem = async (fetchImpl: typeof fetch) => {
      try {
        await fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl });
        return "no error";
      } catch (err) {
        return err instanceof HistoryServerError ? err.problem : "other";
      }
    };
    await expect(
      fetchServerLines({ server: SERVER, token: "secret", channel: "geckotown", fetchImpl: fakeServer([], { failOnCall: 1 }).fetchImpl }),
    ).rejects.toThrow("Couldn't reach zoochattr-logger.gecko.workers.dev (Failed to fetch).");
    expect(await problem(fakeServer([], { token: "different" }).fetchImpl)).toBe("unauthorized");
    expect(await problem(fakeServer([], { failOnCall: 1 }).fetchImpl)).toBe("unreachable");
    expect(await problem((async () => new Response("<html>oops</html>", { status: 502 })) as typeof fetch)).toBe("bad-response");
    expect(await problem((async () => new Response("not json", { status: 200 })) as typeof fetch)).toBe("bad-response");
  });
});

describe("checkHistoryServer", () => {
  it("says whether the token works and the channel is recorded", async () => {
    expect(await checkHistoryServer(SERVER, "secret", "geckotown", fakeServer([]).fetchImpl)).toEqual({ ok: true, recorded: true });
    expect(await checkHistoryServer(SERVER, "secret", "x", fakeServer([], { recorded: false }).fetchImpl)).toEqual({ ok: true, recorded: false });
    expect(await checkHistoryServer(SERVER, "wrong", "geckotown", fakeServer([]).fetchImpl)).toMatchObject({ ok: false, problem: "unauthorized" });
  });
});

describe("serverMessages", () => {
  it("reads chat lines once each, oldest first, and skips anything else", () => {
    const lines = [
      line("b", T0 + 2_000, "second"),
      line("a", T0 + 1_000, "hey @me"),
      line("a", T0 + 1_000, "hey @me"),
      ":tmi.twitch.tv NOTICE #geckotown :not a chat line",
      `@badges= :x!x@x.tmi.twitch.tv PRIVMSG #geckotown :no id`,
      "",
    ];
    const messages = serverMessages(lines, "me");
    expect(messages.map((message) => [message.id, message.text, message.ts])).toEqual([
      ["a", "hey @me", T0 + 1_000],
      ["b", "second", T0 + 2_000],
    ]);
    expect(messages[0].mention).toBe(true);
    expect(messages[0].channel).toBe("geckotown");
  });
});

describe("newestTwitchTime", () => {
  it("ignores dividers, notices and sends Twitch never confirmed", () => {
    const messages = [
      row("a", T0),
      { ...row("sys", T0 + 9_000), kind: "system" as const },
      row("send-1", T0 + 8_000, { self: true }),
      row("p", T0 + 7_000, { pending: "sending" }),
      historyBoundary("geckotown"),
      row("b", T0 + 5_000),
    ];
    expect(newestTwitchTime(messages)).toBe(T0 + 5_000);
    expect(newestTwitchTime([])).toBeUndefined();
  });
});

describe("mergeServerMessages", () => {
  const ids = (messages: ChatMessage[]) => messages.map((message) => (isHistoryBoundary(message) ? "|" : message.id));

  it("keeps the copy already on screen, so a delete survives", () => {
    const saved = row("a", T0, { deleted: true });
    const messages = [saved, historyBoundary("geckotown")];
    const result = mergeServerMessages(messages, [row("a", T0), row("b", T0 + 1_000)], "geckotown");
    expect(ids(result.messages)).toEqual(["a", "b", "|"]);
    expect(result.messages[0]).toBe(saved);
    expect(result.added.map((message) => message.id)).toEqual(["b"]);
  });

  it("slots overlap lines between saved ones and leaves live chat below the divider", () => {
    const live = row("live", T0 + 9_000);
    const messages = [row("a", T0), row("c", T0 + 3_000), historyBoundary("geckotown"), live];
    const result = mergeServerMessages(messages, [row("d", T0 + 4_000), row("b", T0 + 1_000), row("live", T0 + 9_000)], "geckotown");
    expect(ids(result.messages)).toEqual(["a", "b", "c", "d", "|", "live"]);
    expect(result.messages.at(-1)).toBe(live);
  });

  it("adds a divider when nothing was saved, and the note above the new lines", () => {
    const result = mergeServerMessages([], [row("b", T0 + 1_000), row("a", T0)], "geckotown", (added) =>
      fillNote("geckotown", added, false),
    );
    expect(result.messages[0].kind).toBe("system");
    expect(result.messages[0].text).toBe("Filled in 2 messages from your history server.");
    expect(result.messages[0].ts).toBe(T0);
    expect(ids(result.messages).slice(1)).toEqual(["a", "b", "|"]);
  });

  it("returns the same list when every line is already there", () => {
    const messages = [row("a", T0), historyBoundary("geckotown")];
    const result = mergeServerMessages(messages, [row("a", T0), { ...row("x", T0), channel: "elsewhere" }], "geckotown");
    expect(result.messages).toBe(messages);
    expect(result.added).toEqual([]);
  });

  it("says when the oldest part of a long gap is still missing", () => {
    expect(fillNote("geckotown", [row("a", T0), row("b", T0 + 1)], true).text).toBe(
      "Filled in the newest 2 messages from your history server. Older ones from that gap are still missing.",
    );
    expect(fillNote("geckotown", [row("a", T0)], false).text).toBe("Filled in 1 message from your history server.");
  });
});
