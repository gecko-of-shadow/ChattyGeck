import { describe, expect, it } from "vitest";
import nspell from "nspell";
import aff from "../../../public/spell/en-US.aff?raw";
import dic from "../../../public/spell/en-US.dic?raw";
import { findMisspellings, rankSuggestions } from "./misspellings";

describe("english dictionary", () => {
  const spell = nspell(aff, dic);

  it("suggests the for teh and rejects recieve", () => {
    expect(spell.correct("recieve")).toBe(false);
    expect(spell.correct("receive")).toBe(true);
    expect(rankSuggestions("teh", spell.suggest("teh"))[0]).toBe("the");
    expect(rankSuggestions("recieve", spell.suggest("recieve"))[0]).toBe("receive");
    const spans = findMisspellings("I recieve teh message", {
      isEmote: () => false,
      chatters: new Set(),
      dictionary: new Set(),
      ignored: new Set(),
      correct: (word) => spell.correct(word),
    });
    expect(spans.map((span) => span.word)).toEqual(["recieve", "teh"]);
  });
});
