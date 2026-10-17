import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  clampMentionCooldown,
  clampTextSize,
  cleanChannelOverrides,
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
