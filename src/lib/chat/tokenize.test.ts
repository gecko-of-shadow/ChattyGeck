import { describe, expect, it } from "vitest";
import type { Emote } from "@/lib/emotes/types";
import { tokenize, type Fragment } from "./tokenize";

const emote = (name: string, zeroWidth = false): Emote => ({
  id: name,
  name,
  provider: "7tv",
  scope: "channel",
  url1x: `https://cdn.7tv.app/emote/${name}/1x.webp`,
  zeroWidth,
});

const map = new Map([
  ["KEKW", emote("KEKW")],
  ["catJAM", emote("catJAM")],
  ["SoSnowy", emote("SoSnowy", true)],
]);
const lookup = (word: string) => map.get(word);

const summarize = (fragments: Fragment[]) =>
  fragments.map((f) =>
    f.type === "emote"
      ? `[${f.emote.name}${f.overlays.length ? `+${f.overlays.map((o) => o.name).join("+")}` : ""}]`
      : f.type === "link"
        ? `<${f.href}>`
        : f.type === "mention"
          ? `{${f.login}}`
          : f.text,
  );

describe("tokenize", () => {
  it("swaps third-party emote words for images", () => {
    expect(summarize(tokenize("that was KEKW so good catJAM", [], lookup))).toEqual([
      "that was ",
      "[KEKW]",
      " so good ",
      "[catJAM]",
    ]);
  });

  it("does not match emotes inside other words", () => {
    expect(summarize(tokenize("KEKWait", [], lookup))).toEqual(["KEKWait"]);
  });

  it("stacks zero-width emotes on the previous emote", () => {
    expect(summarize(tokenize("catJAM SoSnowy nice", [], lookup))).toEqual(["[catJAM+SoSnowy]", " nice"]);
  });

  it("keeps a lone zero-width emote as a normal emote", () => {
    expect(summarize(tokenize("SoSnowy", [], lookup))).toEqual(["[SoSnowy]"]);
  });

  it("uses Twitch emote ranges by code point, even after emoji", () => {
    // "🦎 Kappa" : the gecko emoji is one code point but two UTF-16 units.
    const fragments = tokenize("🦎 Kappa hi", [{ id: "25", start: 2, end: 6 }], lookup);
    expect(summarize(fragments)).toEqual(["🦎 ", "[Kappa]", " hi"]);
    const first = fragments[1];
    expect(first.type === "emote" && first.emote.url1x).toContain("/emoticons/v2/25/");
  });

  it("ignores out-of-range Twitch emote positions", () => {
    expect(summarize(tokenize("short", [{ id: "25", start: 3, end: 40 }], lookup))).toEqual(["short"]);
  });

  it("finds links and strips trailing punctuation", () => {
    expect(summarize(tokenize("see https://example.com/x, and www.twitch.tv.", [], lookup))).toEqual([
      "see ",
      "<https://example.com/x>",
      ", and ",
      "<https://www.twitch.tv>",
      ".",
    ]);
  });

  it("does not linkify ordinary dotted words", () => {
    expect(summarize(tokenize("e.g. this", [], lookup))).toEqual(["e.g. this"]);
  });

  it("highlights mentions", () => {
    expect(summarize(tokenize("hey @Gecko_Fan!", [], lookup))).toEqual(["hey ", "{gecko_fan}", "!"]);
  });
});
