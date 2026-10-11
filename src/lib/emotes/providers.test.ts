import { describe, expect, it } from "vitest";
import { parseBttvEmotes, parseFfzEmotes, parseSevenTvEmotes, twitchEmote } from "./providers";

describe("7TV", () => {
  it("builds CDN urls and detects zero-width flags", () => {
    const emotes = parseSevenTvEmotes(
      [
        {
          id: "a",
          name: "catJAM",
          flags: 0,
          data: {
            flags: 0,
            host: {
              url: "//cdn.7tv.app/emote/a",
              files: [
                { name: "1x.webp", width: 32, height: 32, format: "WEBP" },
                { name: "2x.webp", width: 64, height: 64, format: "WEBP" },
              ],
            },
          },
        },
        { id: "b", name: "RainTime", flags: 1, data: { host: { url: "//cdn.7tv.app/emote/b" } } },
        { id: "c", name: "Overlay", flags: 0, data: { flags: 256, host: { url: "//cdn.7tv.app/emote/c" } } },
        { id: "d", name: "Broken", data: {} },
      ],
      "channel",
    );
    expect(emotes).toHaveLength(3);
    expect(emotes[0]).toMatchObject({
      name: "catJAM",
      url1x: "https://cdn.7tv.app/emote/a/1x.webp",
      url2x: "https://cdn.7tv.app/emote/a/2x.webp",
      url4x: undefined,
      width: 32,
      zeroWidth: false,
    });
    expect(emotes[1].zeroWidth).toBe(true);
    expect(emotes[2].zeroWidth).toBe(true);
  });

  it("copes with a channel that has no emote set", () => {
    expect(parseSevenTvEmotes(null, "channel")).toEqual([]);
  });
});

describe("BetterTTV", () => {
  it("skips text modifiers and marks known overlays", () => {
    const emotes = parseBttvEmotes(
      [
        { id: "1", code: "monkaS" },
        { id: "2", code: "w!", modifier: true },
        { id: "3", code: "SoSnowy" },
      ],
      "global",
    );
    expect(emotes.map((e) => e.name)).toEqual(["monkaS", "SoSnowy"]);
    expect(emotes[0].url1x).toBe("https://cdn.betterttv.net/emote/1/1x");
    expect(emotes[1].zeroWidth).toBe(true);
  });
});

describe("FrankerFaceZ", () => {
  it("prefers animated urls and treats modifiers as overlays", () => {
    const emotes = parseFfzEmotes(
      [
        { id: 9, name: "ZrehplaR", urls: { "1": "https://cdn.frankerfacez.com/emote/9/1", "4": "https://cdn.frankerfacez.com/emote/9/4" } },
        {
          id: 10,
          name: "Wiggle",
          urls: { "1": "https://cdn.frankerfacez.com/emote/10/1" },
          animated: { "1": "https://cdn.frankerfacez.com/emote/10/animated/1" },
        },
        { id: 11, name: "ffzHat", modifier: true, urls: { "1": "//cdn.frankerfacez.com/emote/11/1" } },
      ],
      "channel",
    );
    expect(emotes[0]).toMatchObject({ url1x: "https://cdn.frankerfacez.com/emote/9/1", url4x: "https://cdn.frankerfacez.com/emote/9/4" });
    expect(emotes[1].url1x).toContain("/animated/1");
    expect(emotes[2]).toMatchObject({ zeroWidth: true, url1x: "https://cdn.frankerfacez.com/emote/11/1" });
  });
});

describe("Twitch", () => {
  it("uses the v2 CDN with dark theme", () => {
    expect(twitchEmote("25", "Kappa").url1x).toBe("https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/1.0");
  });
});
