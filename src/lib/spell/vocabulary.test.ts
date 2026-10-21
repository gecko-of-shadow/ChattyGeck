import { describe, expect, it } from "vitest";
import { channelNames, chatterNames } from "./vocabulary";

describe("spell vocabulary", () => {
  it("collects chatter logins and display names from every channel", () => {
    const names = chatterNames([
      [{ login: "tokaytom", displayName: "TokayTom" }],
      [{ login: "crestedcarl", displayName: "Crested Carl" }],
    ]);
    expect([...names].sort()).toEqual(["crested carl", "crestedcarl", "tokaytom"]);
  });

  it("collects joined channel logins and display names", () => {
    const names = channelNames([{ login: "geckotown", displayName: "GeckoTown" }, { login: "lizardlounge" }]);
    expect([...names].sort()).toEqual(["geckotown", "lizardlounge"]);
  });
});
