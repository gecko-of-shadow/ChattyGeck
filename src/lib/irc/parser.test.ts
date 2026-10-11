import { describe, expect, it } from "vitest";
import { channelFromParam, parseIrcLine, unescapeTagValue } from "./parser";

describe("parseIrcLine", () => {
  it("parses a tagged Twitch PRIVMSG", () => {
    const line =
      "@badge-info=subscriber/14;badges=moderator/1,subscriber/12;color=#1E90FF;display-name=Gecko_Fan;emotes=25:0-4;id=abc-123;room-id=71092938;tmi-sent-ts=1700000000000;user-id=42 :gecko_fan!gecko_fan@gecko_fan.tmi.twitch.tv PRIVMSG #xqc :Kappa hello there";
    const msg = parseIrcLine(line)!;
    expect(msg.command).toBe("PRIVMSG");
    expect(msg.nick).toBe("gecko_fan");
    expect(msg.params).toEqual(["#xqc", "Kappa hello there"]);
    expect(msg.tags["display-name"]).toBe("Gecko_Fan");
    expect(msg.tags.emotes).toBe("25:0-4");
  });

  it("handles server messages without tags", () => {
    const msg = parseIrcLine(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!")!;
    expect(msg.command).toBe("001");
    expect(msg.prefix).toBe("tmi.twitch.tv");
    expect(msg.params).toEqual(["justinfan123", "Welcome, GLHF!"]);
  });

  it("parses PING without prefix", () => {
    expect(parseIrcLine("PING :tmi.twitch.tv")).toMatchObject({ command: "PING", params: ["tmi.twitch.tv"] });
  });

  it("keeps empty tag values and tags without values", () => {
    const msg = parseIrcLine("@color=;flag :tmi.twitch.tv USERSTATE #chan")!;
    expect(msg.tags).toEqual({ color: "", flag: "" });
    expect(msg.params).toEqual(["#chan"]);
  });

  it("keeps colons inside the trailing parameter", () => {
    const msg = parseIrcLine(":a!a@a.tmi.twitch.tv PRIVMSG #c :look: https://twitch.tv :)")!;
    expect(msg.params[1]).toBe("look: https://twitch.tv :)");
  });

  it("returns null for junk", () => {
    expect(parseIrcLine("")).toBeNull();
    expect(parseIrcLine("@onlytags")).toBeNull();
  });
});

describe("unescapeTagValue", () => {
  it("decodes IRCv3 escapes", () => {
    expect(unescapeTagValue("Hello\\sworld\\:\\\\done")).toBe("Hello world;\\done");
    expect(unescapeTagValue("line\\rbreak\\n")).toBe("line\rbreak\n");
  });

  it("drops a dangling backslash", () => {
    expect(unescapeTagValue("oops\\")).toBe("oops");
  });
});

describe("channelFromParam", () => {
  it("strips # and lowercases", () => {
    expect(channelFromParam("#XQC")).toBe("xqc");
    expect(channelFromParam(undefined)).toBe("");
  });
});
