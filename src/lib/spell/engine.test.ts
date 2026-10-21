import { describe, expect, it } from "vitest";
import nspell from "nspell";
import aff from "../../../public/spell/en-US.aff?raw";
import dic from "../../../public/spell/en-US.dic?raw";
import { suggestFixes, windowsEngine, type SpellBackend, type SpellEngine } from "./engine";
import { findMisspellings, rankSuggestions } from "./misspellings";

function fakeWindows(words: Record<string, boolean>, suggestions: Record<string, string[]> = {}) {
  const calls = { check: [] as string[][], suggest: [] as string[] };
  const backend: SpellBackend = {
    check: async (_language, list) => {
      calls.check.push(list);
      return list.map((word) => words[word] ?? false);
    },
    suggest: async (_language, word) => {
      calls.suggest.push(word);
      return suggestions[word] ?? [];
    },
  };
  return { backend, calls };
}

describe("Windows engine", () => {
  it("asks Windows once per word and remembers the answers", async () => {
    const { backend, calls } = fakeWindows({ hello: true });
    const engine = windowsEngine("en-US", backend);
    expect(await engine.check(["hello", "recieve", "hello"])).toEqual([true, false, true]);
    expect(await engine.check(["recieve", "hello"])).toEqual([false, true]);
    expect(calls.check).toEqual([["hello", "recieve"]]);
  });

  it("never tries ALL-CAPS forms, but passes a lowercase acronym Windows spells in capitals", async () => {
    const { backend } = fakeWindows({}, { nasa: ["NASA", "Nasa"], teh: ["the", "ten"] });
    const engine = windowsEngine("en-US", backend);
    expect(engine.judgesAllCaps).toBe(false);
    expect(await engine.check(["nasa", "teh"])).toEqual([true, false]);
  });

  it("keeps Windows' suggestion order and re-ranks the bundled dictionary's", async () => {
    const windows: SpellEngine = {
      kind: "windows",
      judgesAllCaps: false,
      check: async (words) => words.map(() => true),
      suggest: async () => ["ten", "the", "tea"],
    };
    const bundled: SpellEngine = { ...windows, kind: "nspell", judgesAllCaps: true };
    expect(await suggestFixes(windows, "teh")).toEqual(["ten", "the", "tea"]);
    expect((await suggestFixes(bundled, "teh"))[0]).toBe("the");
  });

  it("leads with the contraction Windows offers", async () => {
    const { backend } = fakeWindows({}, { im: ["mi", "imp", "I'm", "am", "in"], dont: ["dent", "cont", "don't"] });
    const engine = windowsEngine("en-US", backend);
    expect(await suggestFixes(engine, "im", 3)).toEqual(["I'm", "mi", "imp"]);
    expect((await suggestFixes(engine, "dont"))[0]).toBe("don't");
  });
});

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
