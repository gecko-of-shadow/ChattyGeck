import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/twitch/types";
import { ChatWords } from "./chatWords";

const HOUR = 60 * 60_000;
const NOW = 1_800_000_000_000;

let seq = 0;
function line(text: string, who: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  seq++;
  return {
    id: `m${seq}`,
    channel: "geckotown",
    kind: "chat",
    ts: NOW - HOUR,
    login: who,
    userId: `id-${who}`,
    badges: [],
    text,
    twitchEmotes: [],
    ...overrides,
  };
}

describe("ChatWords", () => {
  it("counts a word once three different chatters use it", () => {
    const words = new ChatWords();
    words.note([line("pog", "a"), line("so pog", "b")], NOW);
    expect(words.isCommunityWord("pog", NOW)).toBe(false);
    words.note([line("POG!!", "c")], NOW);
    expect(words.isCommunityWord("pog", NOW)).toBe(true);
    expect(words.isCommunityWord("Pog", NOW)).toBe(true);
  });

  it("needs different people, not one person saying it three times", () => {
    const words = new ChatWords();
    words.note([line("pog pog", "a"), line("pog", "a"), line("pog", "b")], NOW);
    expect(words.isCommunityWord("pog", NOW)).toBe(false);
  });

  it("forgets words nobody used in the last 48 hours", () => {
    const words = new ChatWords();
    words.note(["a", "b", "c"].map((who) => line("copium", who, { ts: NOW - 47 * HOUR })), NOW);
    expect(words.isCommunityWord("copium", NOW)).toBe(true);
    expect(words.isCommunityWord("copium", NOW + 2 * HOUR)).toBe(false);
  });

  it("ignores your own lines, deleted lines, unsent lines, events, commands, mentions and links", () => {
    const words = new ChatWords();
    words.note(
      [
        line("blorp", "a", { self: true }),
        line("blorp", "b", { deleted: true }),
        line("blorp", "c", { pending: "sending" }),
        line("blorp", "d", { kind: "event" }),
        ...["e", "f", "g"].map((who) => line("!blorp @blorp https://blorp.tv blorp.tv", who)),
      ],
      NOW,
    );
    expect(words.isCommunityWord("blorp", NOW)).toBe(false);
  });

  it("keeps missing-apostrophe contractions out so don't can still be offered", () => {
    const words = new ChatWords();
    words.note(["a", "b", "c", "d"].map((who) => line("dont im thats lol", who)), NOW);
    expect(words.isCommunityWord("dont", NOW)).toBe(false);
    expect(words.isCommunityWord("im", NOW)).toBe(false);
    expect(words.isCommunityWord("thats", NOW)).toBe(false);
    expect(words.isCommunityWord("lol", NOW)).toBe(true);
  });

  it("learns from history restored after live chat started", () => {
    const words = new ChatWords();
    words.note([line("sadge", "a", { ts: NOW - HOUR })], NOW);
    words.note([line("sadge", "b", { ts: NOW - 30 * HOUR }), line("sadge", "c", { ts: NOW - 40 * HOUR })], NOW);
    expect(words.isCommunityWord("sadge", NOW)).toBe(true);
  });

  it("remembers Twitch emote names from the emote tags, including in your own lines", () => {
    const words = new ChatWords();
    // Ranges count code points, so the lizard emoji does not shift "Kappa".
    words.note([line("🦎 Kappa", "a", { self: true, twitchEmotes: [{ id: "25", start: 2, end: 6 }] })], NOW);
    expect(words.isTwitchEmote("kappa", NOW)).toBe(true);
    expect(words.isTwitchEmote("Kappa", NOW + 47 * HOUR)).toBe(true);
    expect(words.isTwitchEmote("kappa", NOW + 49 * HOUR)).toBe(false);
  });

  it("noteGradually learns a big history in chunks", async () => {
    const words = new ChatWords();
    const rows = Array.from({ length: 4_500 }, (_, i) => line(i % 1_000 === 0 ? "bedge" : "filler", `chatter${i}`));
    await words.noteGradually(rows, 1_000);
    expect(words.isCommunityWord("bedge", NOW)).toBe(true);
  });

  it("prune drops words and emotes that have expired", () => {
    const words = new ChatWords();
    words.note(["a", "b", "c"].map((who) => line("Kappa bedge", who, { twitchEmotes: [{ id: "25", start: 0, end: 4 }] })), NOW);
    words.prune(NOW + 50 * HOUR);
    words.note([line("bedge", "d", { ts: NOW + 50 * HOUR })], NOW + 50 * HOUR);
    expect(words.isCommunityWord("bedge", NOW + 50 * HOUR)).toBe(false);
    expect(words.isTwitchEmote("kappa", NOW + 50 * HOUR)).toBe(false);
  });
});
