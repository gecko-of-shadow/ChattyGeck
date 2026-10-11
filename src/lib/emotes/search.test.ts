import { describe, expect, it } from "vitest";
import { buildNameIndex, findEmotes, wordAt } from "./search";
import type { Emote } from "./types";

const emote = (name: string): Emote => ({
  id: name,
  name,
  provider: "7tv",
  scope: "global",
  url1x: `https://x/${name}`,
  zeroWidth: false,
});

const index = buildNameIndex(["KEKW", "Kappa", "KappaPride", "catJAM", "kek", "PogChamp", "peepoKek"].map(emote));

describe("findEmotes", () => {
  it("puts names that start with the letters first, exact case before other case, shortest first", () => {
    expect(findEmotes(index, "ka").map((e) => e.name)).toEqual(["Kappa", "KappaPride"]);
    expect(findEmotes(index, "KE").map((e) => e.name)).toEqual(["KEKW", "kek", "peepoKek"]);
    expect(findEmotes(index, "ke").map((e) => e.name)).toEqual(["kek", "KEKW", "peepoKek"]);
  });

  it("falls back to names that contain the letters", () => {
    expect(findEmotes(index, "jam").map((e) => e.name)).toEqual(["catJAM"]);
  });

  it("returns nothing for nothing", () => {
    expect(findEmotes(index, "")).toEqual([]);
    expect(findEmotes(index, "zzz")).toEqual([]);
  });
});

describe("wordAt", () => {
  it("finds the word around the caret", () => {
    expect(wordAt("hello Kap", 9)).toEqual({ start: 6, end: 9, word: "Kap" });
    expect(wordAt("hello Kap there", 8)).toEqual({ start: 6, end: 9, word: "Kap" });
    expect(wordAt("hello ", 6)).toBeNull();
  });
});
