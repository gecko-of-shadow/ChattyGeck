import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampMentionCooldown,
  clampTextSize,
  cleanChannelOverrides,
  fitGridToView,
  focusOnGrid,
  isFeatureOn,
  makeBackup,
  parseWordList,
  readBackup,
  sanitizeSettings,
} from "./settings";

describe("sanitizeSettings", () => {
  it("starts from defaults when nothing is saved", () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("turns the old merged feed into the grid", () => {
    expect(sanitizeSettings({ mode: "merged" }).mode).toBe("grid");
    expect(sanitizeSettings({ mode: "focused" }).mode).toBe("focused");
  });

  it("moves removed gecko skins to the crested gecko", () => {
    for (const skin of ["shadow", "leopard", "tokay", "day", "nonsense"]) {
      expect(sanitizeSettings({ skin }).skin).toBe("crested");
    }
    expect(sanitizeSettings({ skin: "penguin" }).skin).toBe("penguin");
    expect(sanitizeSettings({ skin: "light" }).skin).toBe("light");
    expect(sanitizeSettings({ skin: "deuteranopia" }).skin).toBe("deuteranopia");
    expect(sanitizeSettings({ skin: "eyecomfort" }).skin).toBe("eyecomfort");
  });

  it("accepts the new themes and Auto's two choices", () => {
    for (const skin of ["auto", "eyecomfort-light", "highcontrast"]) {
      expect(sanitizeSettings({ skin }).skin).toBe(skin);
    }
    const auto = sanitizeSettings({ skin: "auto", autoLightSkin: "eyecomfort-light", autoDarkSkin: "penguin" });
    expect(auto.autoLightSkin).toBe("eyecomfort-light");
    expect(auto.autoDarkSkin).toBe("penguin");
  });

  it("gives Auto its defaults when the file has none, or junk, or Auto itself", () => {
    expect(sanitizeSettings({}).autoLightSkin).toBe("light");
    expect(sanitizeSettings({}).autoDarkSkin).toBe("crested");
    expect(sanitizeSettings({ autoLightSkin: "auto", autoDarkSkin: "nonsense" })).toMatchObject({
      autoLightSkin: "light",
      autoDarkSkin: "crested",
    });
  });

  it("defaults spell check on and keeps a saved dictionary through backup", () => {
    expect(sanitizeSettings({}).spellCheck).toBe(true);
    expect(sanitizeSettings({}).spellDictionary).toEqual([]);
    expect(sanitizeSettings({}).spellLanguage).toBe("en-US");
    const saved = sanitizeSettings({
      spellCheck: false,
      spellDictionary: [" recieve ", "recieve", "Kappa"],
      spellLanguage: "fr",
    });
    expect(saved.spellCheck).toBe(false);
    expect(saved.spellDictionary).toEqual(["recieve", "Kappa"]);
    expect(saved.spellLanguage).toBe("en-US");
    expect(readBackup(JSON.stringify(makeBackup(saved)))?.spellDictionary).toEqual(["recieve", "Kappa"]);
  });

  it("keeps a history server address as its https origin and drops anything else", () => {
    expect(sanitizeSettings({}).historyServer).toBe("");
    expect(sanitizeSettings({ historyServer: "https://zoochattr-logger.gecko.workers.dev/" }).historyServer).toBe(
      "https://zoochattr-logger.gecko.workers.dev",
    );
    expect(sanitizeSettings({ historyServer: "http://zoochattr-logger.gecko.workers.dev" }).historyServer).toBe("");
    expect(sanitizeSettings({ historyServer: 42 }).historyServer).toBe("");
    const saved = sanitizeSettings({ historyServer: "https://zoochattr-logger.gecko.workers.dev" });
    expect(readBackup(JSON.stringify(makeBackup(saved)))?.historyServer).toBe("https://zoochattr-logger.gecko.workers.dev");
  });

  it("defaults readOnly off and accepts an explicit on", () => {
    expect(sanitizeSettings({}).readOnly).toBe(false);
    expect(sanitizeSettings({ readOnly: true }).readOnly).toBe(true);
  });

  it("cleans the channel list and keeps the focused channel valid", () => {
    const settings = sanitizeSettings({ channels: ["#XQC", "xqc", "bad name", "twitch.tv/summit1g"], focused: "gone" });
    expect(settings.channels).toEqual(["xqc", "summit1g"]);
    expect(settings.focused).toBe("xqc");
  });

  it("keeps a missing slot count at 4 and allows up to 9", () => {
    const many = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
    expect(sanitizeSettings({ channels: many }).gridSlots).toBe(4);
    expect(sanitizeSettings({ channels: many }).gridChannels).toHaveLength(4);
    expect(sanitizeSettings({ channels: many, gridSlots: 9 }).gridChannels).toHaveLength(9);
    expect(sanitizeSettings({ gridSlots: 40 }).gridSlots).toBe(9);
    expect(sanitizeSettings({ gridSlots: 0 }).gridSlots).toBe(1);
  });

  it("loads an old 5, 7 or 8 without rewriting it, and shows the next bigger view's panes", () => {
    const many = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india"];
    const five = sanitizeSettings({ channels: many, gridChannels: many.slice(0, 6), gridSlots: 5 });
    expect(five.gridSlots).toBe(5);
    expect(five.gridChannels).toHaveLength(6);
    expect(sanitizeSettings({ channels: many, gridChannels: many, gridSlots: 7 }).gridChannels).toHaveLength(9);
  });

  it("sets extra pins aside instead of dropping them, and keeps set-aside pins tidy", () => {
    const many = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    const loaded = sanitizeSettings({ channels: many, gridChannels: many, gridSlots: 4, gridParked: ["nope", "alpha"] });
    expect(loaded.gridChannels).toEqual(["alpha", "bravo", "charlie", "delta"]);
    expect(loaded.gridParked).toEqual(["echo", "foxtrot"]);
    // Older files have no set-aside list.
    expect(sanitizeSettings({ channels: many }).gridParked).toEqual([]);
  });

  it("limits the grid to four channels and migrates older all-on-grid lists", () => {
    const many = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    expect(sanitizeSettings({ channels: many }).gridChannels).toEqual(["alpha", "bravo", "charlie", "delta"]);
    expect(
      sanitizeSettings({ channels: many, gridChannels: ["echo", "alpha", "nope", "echo", "foxtrot"] }).gridChannels,
    ).toEqual(["echo", "alpha", "foxtrot"]);
  });

  it("closes to the tray unless told otherwise", () => {
    expect(sanitizeSettings({}).closeToTray).toBe(true);
    expect(sanitizeSettings({ closeToTray: false }).closeToTray).toBe(false);
  });

  it("confirms channel switches before typing by default", () => {
    expect(sanitizeSettings({}).confirmChannelSwitch).toBe(true);
    expect(sanitizeSettings({ confirmChannelSwitch: false }).confirmChannelSwitch).toBe(false);
  });

  it("keeps mention sound off until asked, and clamps the cooldown", () => {
    expect(sanitizeSettings({}).mentionSound).toBe(false);
    expect(sanitizeSettings({}).mentionSoundCooldown).toBe(10);
    const on = sanitizeSettings({ mentionSound: true, mentionSoundCooldown: 2.2 });
    expect(on.mentionSound).toBe(true);
    expect(on.mentionSoundCooldown).toBe(2);
    expect(clampMentionCooldown(0)).toBe(1);
    expect(clampMentionCooldown(500)).toBe(120);
    expect(clampMentionCooldown("nope")).toBe(10);
  });

  it("turns the old small/medium/large text sizes into pixels and clamps new ones", () => {
    expect(sanitizeSettings({ fontSize: "sm" }).textSize).toBe(12.5);
    expect(sanitizeSettings({ fontSize: "lg" }).textSize).toBe(15.5);
    expect(sanitizeSettings({ textSize: 32 }).textSize).toBe(32);
    expect(sanitizeSettings({ textSize: 400 }).textSize).toBe(40);
    expect(sanitizeSettings({ textSize: "nope" }).textSize).toBe(13.5);
    expect(clampTextSize(11.26)).toBe(11.5);
  });

  it("keeps every emote switch, with unknown values falling back", () => {
    const s = sanitizeSettings({
      emoteProviders: { bttv: false },
      emoteSize: 1.5,
      emoteAnimation: "hover",
      overlayEmotes: false,
      blockedEmotes: [" KEKW ", "KEKW", "", 5, "Clap"],
      pickerTab: "nope",
      favoriteEmotes: ["7tv:abc"],
    });
    expect(s.emoteProviders).toEqual({ "7tv": true, bttv: false, ffz: true });
    expect(s.emoteSize).toBe(1.5);
    expect(s.emoteAnimation).toBe("hover");
    expect(s.overlayEmotes).toBe(false);
    expect(s.blockedEmotes).toEqual(["KEKW", "Clap"]);
    expect(s.pickerTab).toBe("all");
    expect(s.favoriteEmotes).toEqual(["7tv:abc"]);
    expect(sanitizeSettings({ emoteSize: 3 }).emoteSize).toBe(1);
  });
});

describe("word lists", () => {
  it("splits on lines, commas and spaces", () => {
    expect(parseWordList("gecko\nlizard, newt  frog\n\n")).toEqual(["gecko", "lizard", "newt", "frog"]);
  });
});

describe("focusOnGrid (the focused pane)", () => {
  it("in the grid, keeps the focus on a pane that is on screen", () => {
    expect(focusOnGrid("grid", "c", ["a", "b"])).toBe("a");
    expect(focusOnGrid("grid", "b", ["a", "b"])).toBe("b");
    expect(focusOnGrid("grid", null, ["a"])).toBe("a");
    expect(focusOnGrid("grid", "c", [])).toBe("c");
  });

  it("leaves Single alone", () => {
    expect(focusOnGrid("focused", "c", ["a", "b"])).toBe("c");
  });

  it("fixes a saved focus that is off the grid at load", () => {
    const s = sanitizeSettings({ channels: ["alpha", "bravo", "charlie"], gridChannels: ["alpha", "bravo"], focused: "charlie", mode: "grid" });
    expect(s.focused).toBe("alpha");
    expect(sanitizeSettings({ channels: ["alpha", "bravo", "charlie"], gridChannels: ["alpha", "bravo"], focused: "charlie", mode: "focused" }).focused).toBe("charlie");
  });
});

describe("fitGridToView (the view switch)", () => {
  it("going down sets the extra pins aside; going back up brings them back in order", () => {
    const down = fitGridToView(["a", "b", "c", "d"], [], 2);
    expect(down).toEqual({ gridChannels: ["a", "b"], gridParked: ["c", "d"] });
    expect(fitGridToView(down.gridChannels, down.gridParked, 4)).toEqual({ gridChannels: ["a", "b", "c", "d"], gridParked: [] });
    expect(fitGridToView(down.gridChannels, down.gridParked, 3)).toEqual({ gridChannels: ["a", "b", "c"], gridParked: ["d"] });
  });

  it("without refill (loading a file) leaves an emptied pane empty", () => {
    expect(fitGridToView(["a"], ["b"], 4, false)).toEqual({ gridChannels: ["a"], gridParked: ["b"] });
  });

  it("treats 5, 7 and 8 as the next offered view and never lists a channel twice", () => {
    expect(fitGridToView(["a", "b", "c", "d", "e", "f", "g"], [], 5).gridChannels).toHaveLength(6);
    expect(fitGridToView(["a", "b"], ["b", "c"], 2)).toEqual({ gridChannels: ["a", "b"], gridParked: ["c"] });
  });
});

describe("backups", () => {
  it("round-trips through a backup file", () => {
    const settings = sanitizeSettings({ channels: ["xqc"], textSize: 20, highlightWords: ["gecko"] });
    const text = JSON.stringify(makeBackup(settings));
    expect(readBackup(text)).toEqual(settings);
  });

  it("accepts a bare settings.json (new or old) and rejects other files", () => {
    expect(readBackup(JSON.stringify({ channels: ["xqc"], skin: "penguin", textSize: 15 }))?.channels).toEqual(["xqc"]);
    expect(readBackup(JSON.stringify({ skin: "penguin", fontSize: "lg" }))?.textSize).toBe(15.5);
    expect(readBackup("not json")).toBeNull();
    expect(readBackup(JSON.stringify({ hello: "world" }))).toBeNull();
    expect(readBackup("[]")).toBeNull();
    // Looks like settings only by accident (package.json, tsconfig…): must not reset everything.
    expect(readBackup(JSON.stringify({ name: "zoochattr", version: "0.3.0" }))).toBeNull();
    expect(readBackup(JSON.stringify({ mode: "production", channels: 4 }))).toBeNull();
  });

  it("restores a 0.5.0 backup that has no Auto theme keys", () => {
    const old = JSON.stringify({ zoochattr: 1, savedAt: "2026-10-26T00:00:00Z", settings: { channels: ["xqc"], skin: "tritanopia" } });
    expect(readBackup(old)).toMatchObject({ skin: "tritanopia", autoLightSkin: "light", autoDarkSkin: "crested" });
  });
});

describe("channelOverrides", () => {
  it("keeps known feature ids and drops junk", () => {
    expect(cleanChannelOverrides({ "#XQC": ["7tv", "nope", "tabComplete", "7tv"], "not a channel!": ["7tv"] })).toEqual({
      xqc: ["7tv", "tabComplete"],
    });
    expect(sanitizeSettings({ channelOverrides: { geckotown: ["emotePreview"] } }).channelOverrides).toEqual({
      geckotown: ["emotePreview"],
    });
  });

  it("honours global switches and per-channel offs", () => {
    const settings = sanitizeSettings({
      emoteProviders: { bttv: false },
      tabComplete: true,
      channelOverrides: { geckotown: ["7tv", "tabComplete"] },
    });
    expect(isFeatureOn(settings, "geckotown", "7tv")).toBe(false);
    expect(isFeatureOn(settings, "lizardlounge", "7tv")).toBe(true);
    expect(isFeatureOn(settings, "geckotown", "bttv")).toBe(false);
    expect(isFeatureOn(settings, "lizardlounge", "bttv")).toBe(false);
    expect(isFeatureOn(settings, "geckotown", "tabComplete")).toBe(false);
    expect(isFeatureOn(settings, "lizardlounge", "tabComplete")).toBe(true);
    expect(isFeatureOn(settings, null, "tabComplete")).toBe(true);
  });
});
