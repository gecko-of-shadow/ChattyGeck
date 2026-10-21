import { describe, expect, it } from "vitest";
import {
  findMisspellings,
  indexAtWidth,
  isUrlOrDomain,
  rankSuggestions,
  preferContraction,
  replaceSpellWord,
  spellCandidates,
  spellSuggestions,
  spellTarget,
  spellVariants,
  undoSpellFix,
  wordOf,
  type SpellContext,
} from "./misspellings";

const KNOWN = new Set(["i", "the", "message", "receive", "uptime", "hello", "now", "someone"]);

function ctx(overrides: Partial<SpellContext> = {}): SpellContext {
  return {
    isEmote: (word) => ["kappa", "pogchamp", "kekw"].includes(word.toLowerCase()),
    chatters: new Set(["someuser"]),
    dictionary: new Set(),
    ignored: new Set(),
    correct: (word) => KNOWN.has(word.toLowerCase()),
    ...overrides,
  };
}

describe("findMisspellings", () => {
  it("flags recieve and teh and leaves real words alone", () => {
    const spans = findMisspellings("I recieve teh message", ctx());
    expect(spans.map((span) => span.word)).toEqual(["recieve", "teh"]);
    expect(spans[1]).toMatchObject({ word: "teh" });
    const teh = spans[1];
    expect("I recieve teh message".slice(teh.start, teh.end)).toBe("teh");
  });

  it("does not flag emotes, mentions, a leading command, urls, short caps, or digits", () => {
    const text = "Kappa PogChamp @someuser !uptime https://twitch.tv KEKW";
    expect(findMisspellings(text, ctx())).toEqual([]);
    expect(findMisspellings("!uptime now", ctx())).toEqual([]);
    expect(findMisspellings("/ban someone", ctx())).toEqual([]);
    expect(findMisspellings("hello w0rld", ctx()).map((span) => span.word)).toEqual([]);
    expect(findMisspellings("OK LOL", ctx())).toEqual([]);
    expect(findMisspellings("a", ctx())).toEqual([]);
  });

  it("skips known chatters and the user dictionary", () => {
    expect(findMisspellings("someuser recieve", ctx()).map((span) => span.word)).toEqual(["recieve"]);
    expect(
      findMisspellings("recieve", ctx({ dictionary: new Set(["recieve"]) })),
    ).toEqual([]);
    expect(findMisspellings("teh", ctx({ ignored: new Set(["teh"]) }))).toEqual([]);
  });

  it("skips slash and bang commands even when they are not the first token", () => {
    expect(findMisspellings("hello !notaword /ban", ctx())).toEqual([]);
  });
});

describe("chat words", () => {
  it("accepts stretched spellings of known words, not stretched nonsense", () => {
    const known = ctx({ correct: (word) => ["no", "so", "good"].includes(word) });
    expect(findMisspellings("noooo sooo goooood", known)).toEqual([]);
    expect(findMisspellings("asdffff", known).map((span) => span.word)).toEqual(["asdffff"]);
  });

  it("accepts lowercase names and acronyms", () => {
    const names = ctx({ correct: (word) => ["Chinese", "NASA", "OK"].includes(word) });
    expect(findMisspellings("chinese nasa ok", names)).toEqual([]);
  });

  it("skips joined channel names and community words, still underlines typos", () => {
    const vocab = ctx({ channelNames: new Set(["geckotown"]), communityWord: (word) => word.toLowerCase() === "copium" });
    expect(findMisspellings("GeckoTown copium recieve", vocab).map((span) => span.word)).toEqual(["recieve"]);
  });

  it("a stretched emote or community word still counts", () => {
    const vocab = ctx({ communityWord: (word) => word === "lmao" });
    expect(findMisspellings("lmaooooo KEKWWW", vocab)).toEqual([]);
  });

  it("spellVariants squeezes stretched letters and adds capitals for lowercase words", () => {
    expect(spellVariants("noooo")).toEqual(["noooo", "noo", "no", "Noooo", "NOOOO", "Noo", "NOO", "No", "NO"]);
    expect(spellVariants("Hello")).toEqual(["Hello"]);
    expect(spellVariants("nasa", false)).toEqual(["nasa", "Nasa"]);
  });

  it("never tries ALL-CAPS forms with a dictionary that accepts every ALL-CAPS word", () => {
    const windowsLike = ctx({ allCapsForms: false, correct: (word) => word === word.toUpperCase() || word === "Chinese" });
    expect(findMisspellings("teh chinese", windowsLike).map((span) => span.word)).toEqual(["teh"]);
  });

  it("spellCandidates lists every spelling to look up and skips chat vocabulary", () => {
    const vocab = ctx({ communityWord: (word) => word === "copium" });
    expect(spellCandidates("copium recieve @someone Kappa https://x.tv !cmd", vocab)).toEqual(["recieve", "Recieve", "RECIEVE"]);
    expect(spellCandidates("yesss", vocab)).toContain("yes");
  });

  it("wordOf strips punctuation and rejects commands, mentions, links and digits", () => {
    expect(wordOf("(hello!!")).toBe("hello");
    expect(wordOf("don't,")).toBe("don't");
    for (const token of ["!uptime", "/ban", "@someone", "https://twitch.tv", "twitch.tv", "w0rld", "foo_bar"]) {
      expect(wordOf(token)).toBe("");
    }
  });
});

describe("preferContraction", () => {
  it("puts the apostrophe form of what you typed first", () => {
    expect(preferContraction("dont", ["dent", "cont", "don't", "done"])).toEqual(["don't", "dent", "cont", "done"]);
    expect(preferContraction("im", ["mi", "imp", "I'm", "am"])).toEqual(["I'm", "mi", "imp", "am"]);
    expect(preferContraction("youre", ["your", "you’re"])).toEqual(["you’re", "your"]);
  });

  it("leaves everything else in order", () => {
    expect(preferContraction("teh", ["the", "tea", "ten"])).toEqual(["the", "tea", "ten"]);
    expect(preferContraction("thats", ["that's", "that"])).toEqual(["that's", "that"]);
    expect(preferContraction("wont", ["won't", "want"])).toEqual(["won't", "want"]);
    expect(preferContraction("its", ["it's", "is"])).toEqual(["it's", "is"]);
  });
});

describe("spellSuggestions", () => {
  it("returns the for teh and caps the list at 5", () => {
    expect(spellSuggestions("teh", () => ["the", "ten", "the"])[0]).toBe("the");
    expect(spellSuggestions("x", () => ["a", "b", "c", "d", "e", "f"])).toEqual(["a", "b", "c", "d", "e"]);
    expect(rankSuggestions("teh", ["ten", "eh", "meh", "tea", "tech", "ted", "tee", "tel", "the"])[0]).toBe("the");
  });
});

describe("replaceSpellWord", () => {
  it("replaces only that word and parks the caret after it", () => {
    const text = "I recieve teh message";
    const spans = findMisspellings(text, ctx());
    const next = replaceSpellWord(text, spans[1], "the");
    expect(next).toEqual({ text: "I recieve the message", caret: "I recieve the".length });
  });

  it("keeps the caret past the word when it was already past it", () => {
    const text = "I recieve teh ";
    expect(replaceSpellWord(text, { start: 10, end: 13 }, "the", 14)).toEqual({ text: "I recieve the ", caret: 14 });
    expect(replaceSpellWord(text, { start: 2, end: 9 }, "receive", 14)).toEqual({ text: "I receive teh ", caret: 14 });
    expect(replaceSpellWord(text, { start: 10, end: 13 }, "thee", 11)).toEqual({ text: "I recieve thee ", caret: 14 });
  });
});

describe("spellTarget", () => {
  const spans = [
    { start: 2, end: 9, word: "recieve" },
    { start: 10, end: 13, word: "teh" },
  ];

  it("is the flagged word the caret is in, at the end of, or just past", () => {
    expect(spellTarget("I recieve teh message", spans, 13)?.word).toBe("teh");
    expect(spellTarget("I recieve teh message", spans, 11)?.word).toBe("teh");
    expect(spellTarget("I recieve teh ", spans, 14)?.word).toBe("teh");
    expect(spellTarget("I recieve teh, ", spans, 15)?.word).toBe("teh");
    expect(spellTarget("I recieve teh message", spans, 5)?.word).toBe("recieve");
  });

  it("is nothing once you moved on to another word, or when the underlines are out of date", () => {
    expect(spellTarget("I recieve teh message", spans, 21)).toBeNull();
    expect(spellTarget("I recieve teh  ", spans, 15)).toBeNull();
    expect(spellTarget("I recieve the message", spans, 13)).toBeNull();
    expect(spellTarget("I recieve teh message", spans, 0)).toBeNull();
  });
});

describe("undoSpellFix", () => {
  const fix = { before: "I recieve teh ", caretBefore: 14, after: "I recieve the ", caretAfter: 14 };

  it("puts the old word back with the very next Backspace", () => {
    expect(undoSpellFix(fix, "I recieve the ", 14, 14)).toEqual({ text: "I recieve teh ", caret: 14 });
  });

  it("does nothing after you typed, moved the caret, or selected text", () => {
    expect(undoSpellFix(fix, "I recieve the x", 15, 15)).toBeNull();
    expect(undoSpellFix(fix, "I recieve the ", 3, 3)).toBeNull();
    expect(undoSpellFix(fix, "I recieve the ", 10, 14)).toBeNull();
    expect(undoSpellFix(null, "I recieve the ", 14, 14)).toBeNull();
  });
});

describe("indexAtWidth", () => {
  it("picks the glyph closest to the click", () => {
    const widthAt = (end: number) => end * 10;
    expect(indexAtWidth("abcd", 0, widthAt)).toBe(0);
    expect(indexAtWidth("abcd", 25, widthAt)).toBe(2);
    expect(indexAtWidth("abcd", 26, widthAt)).toBe(3);
    expect(indexAtWidth("abcd", 100, widthAt)).toBe(4);
  });
});

describe("isUrlOrDomain", () => {
  it("recognises links and bare domains", () => {
    expect(isUrlOrDomain("https://twitch.tv")).toBe(true);
    expect(isUrlOrDomain("twitch.tv")).toBe(true);
    expect(isUrlOrDomain("hello")).toBe(false);
  });
});
