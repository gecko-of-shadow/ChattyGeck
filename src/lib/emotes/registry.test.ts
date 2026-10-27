import { describe, expect, it } from "vitest";
import { EmoteRegistry } from "./registry";
import type { Emote, ThirdPartyProvider } from "./types";

describe("channelNeedsRetry", () => {
  it("is not a failed download when the channel has not been loaded yet", () => {
    expect(new EmoteRegistry().channelNeedsRetry("geckotown")).toBe(false);
  });
});

const emote = (name: string, provider: ThirdPartyProvider, scope: "channel" | "global"): Emote =>
  ({ id: `${provider}-${name}`, name, provider, scope }) as Emote;

describe("providerEmotes (emote panel BTTV / 7TV tabs)", () => {
  it("lists every emote of one provider, even names another provider wins in chat", () => {
    const registry = new EmoteRegistry();
    // Fill the private lists the way a finished download would.
    const internals = registry as unknown as { global: Record<ThirdPartyProvider, Emote[]> };
    internals.global.bttv = [emote("catJAM", "bttv", "global"), emote("monkaS", "bttv", "global")];
    internals.global["7tv"] = [emote("catJAM", "7tv", "global")];

    expect(registry.lookup("geckotown").get("catJAM")?.provider).toBe("7tv");
    expect(registry.providerEmotes("geckotown", "bttv").map((e) => e.name)).toEqual(["catJAM", "monkaS"]);
    expect(registry.providerEmotes("geckotown", "7tv").map((e) => e.name)).toEqual(["catJAM"]);
  });
});
