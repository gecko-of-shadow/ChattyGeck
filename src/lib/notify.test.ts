import { describe, expect, it } from "vitest";
import { mentionChimesPlayed, mentionDue, playMentionChime } from "./notify";

describe("mentionDue", () => {
  it("plays the first one, then waits out the cooldown", () => {
    expect(mentionDue(1_000, 0, 10_000)).toBe(true);
    expect(mentionDue(5_000, 1_000, 10_000)).toBe(false);
    expect(mentionDue(11_000, 1_000, 10_000)).toBe(true);
  });
});

describe("playMentionChime", () => {
  it("counts a chime even where there is no audio device", () => {
    const before = mentionChimesPlayed();
    playMentionChime("gecko");
    expect(mentionChimesPlayed()).toBe(before + 1);
  });
});
