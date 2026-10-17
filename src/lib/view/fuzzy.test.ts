import { describe, expect, it } from "vitest";
import { fuzzyChannels } from "./fuzzy";

describe("fuzzyChannels", () => {
  const channels = ["geckotown", "lizardlounge", "penguinpond"];

  it("ranks a prefix ahead of a contains match and lists everyone for an empty query", () => {
    expect(fuzzyChannels(channels, "")).toEqual(channels);
    expect(fuzzyChannels(channels, "liz")).toEqual(["lizardlounge"]);
    expect(fuzzyChannels(channels, "own")).toEqual(["geckotown"]);
    expect(fuzzyChannels(channels, "gto")).toEqual(["geckotown"]);
    expect(fuzzyChannels(channels, "zzz")).toEqual([]);
  });
});