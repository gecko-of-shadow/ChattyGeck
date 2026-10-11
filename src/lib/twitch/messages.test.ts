import { describe, expect, it } from "vitest";
import { parseIrcLine } from "@/lib/irc/parser";
import {
  mentionsUser,
  normalizeChannelName,
  parseBadges,
  parseEmotesTag,
  parseRoomState,
  privmsgToChat,
  usernoticeToChat,
} from "./messages";

describe("parseEmotesTag", () => {
  it("expands multiple ranges and sorts them", () => {
    expect(parseEmotesTag("25:12-16,0-4/1902:6-10")).toEqual([
      { id: "25", start: 0, end: 4 },
      { id: "1902", start: 6, end: 10 },
      { id: "25", start: 12, end: 16 },
    ]);
  });

  it("ignores empty or broken tags", () => {
    expect(parseEmotesTag("")).toEqual([]);
    expect(parseEmotesTag(undefined)).toEqual([]);
    expect(parseEmotesTag("25:x-y")).toEqual([]);
  });
});

describe("parseBadges", () => {
  it("attaches badge-info (sub months)", () => {
    expect(parseBadges("subscriber/12,moderator/1", "subscriber/14")).toEqual([
      { setId: "subscriber", version: "12", info: "14" },
      { setId: "moderator", version: "1", info: undefined },
    ]);
  });
});

describe("privmsgToChat", () => {
  const line = (text: string, tags = "") =>
    parseIrcLine(
      `@badges=;color=;display-name=Lizard;id=m1;tmi-sent-ts=1700000000000;user-id=7${tags} :lizard!lizard@lizard.tmi.twitch.tv PRIVMSG #gecko :${text}`,
    )!;

  it("maps a normal message", () => {
    const msg = privmsgToChat(line("hi chat"), "me");
    expect(msg).toMatchObject({ id: "m1", channel: "gecko", kind: "chat", login: "lizard", text: "hi chat" });
    expect(msg.mention).toBe(false);
    expect(msg.ts).toBe(1700000000000);
  });

  it("detects /me actions", () => {
    const msg = privmsgToChat(line("\u0001ACTION waves\u0001"));
    expect(msg.kind).toBe("action");
    expect(msg.text).toBe("waves");
  });

  it("flags mentions of the logged-in user, but not our own messages", () => {
    expect(privmsgToChat(line("hey @Me how are you"), "me").mention).toBe(true);
    expect(privmsgToChat(line("hey me"), "me").mention).toBe(true);
    expect(privmsgToChat(line("meme time"), "me").mention).toBe(false);
    expect(privmsgToChat(line("talking to myself"), "lizard").self).toBe(true);
  });

  it("captures reply context and first messages", () => {
    const msg = privmsgToChat(
      line(
        "@bob agreed",
        ";first-msg=1;reply-parent-display-name=Bob;reply-parent-msg-body=geckos\\srule;reply-parent-user-login=bob",
      ),
    );
    expect(msg.firstMsg).toBe(true);
    expect(msg.reply).toEqual({ login: "bob", displayName: "Bob", text: "geckos rule" });
  });
});

describe("usernoticeToChat", () => {
  it("uses Twitch's system-msg", () => {
    const msg = usernoticeToChat(
      parseIrcLine(
        "@display-name=Raider;login=raider;msg-id=raid;system-msg=15\\sraiders\\sfrom\\sRaider\\shave\\sjoined!;id=u1 :tmi.twitch.tv USERNOTICE #gecko",
      )!,
    );
    expect(msg.kind).toBe("event");
    expect(msg.systemText).toBe("15 raiders from Raider have joined!");
    expect(msg.text).toBe("");
  });
});

describe("parseRoomState", () => {
  it("only reports keys that are present", () => {
    const state = parseRoomState(parseIrcLine("@room-id=1;slow=30 :tmi.twitch.tv ROOMSTATE #gecko")!);
    expect(state).toEqual({ roomId: "1", slow: 30 });
  });
});

describe("normalizeChannelName", () => {
  it.each([
    ["xqc", "xqc"],
    ["#XQC", "xqc"],
    ["@Some_Body", "some_body"],
    ["https://www.twitch.tv/summit1g", "summit1g"],
    ["twitch.tv/popout/kato_junichi0817/chat", "kato_junichi0817"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeChannelName(input)).toBe(expected);
  });

  it("rejects invalid names", () => {
    expect(normalizeChannelName("")).toBeNull();
    expect(normalizeChannelName("has space")).toBeNull();
    expect(normalizeChannelName("x".repeat(26))).toBeNull();
  });
});

describe("mentionsUser", () => {
  it("escapes regex characters in logins", () => {
    expect(mentionsUser("hello a_b", "a_b")).toBe(true);
    expect(mentionsUser("anything", undefined)).toBe(false);
  });
});
