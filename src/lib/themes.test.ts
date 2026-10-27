import { describe, expect, it } from "vitest";
import { CONCRETE_SKINS, DEFAULT_SKIN, resolveSkin, SKIN_ORDER, THEMES, type Skin } from "./themes";

describe("themes", () => {
  it("lists every skin once and keeps the crested gecko as default", () => {
    expect(DEFAULT_SKIN).toBe("crested");
    expect(new Set(SKIN_ORDER).size).toBe(SKIN_ORDER.length);
    expect(SKIN_ORDER).toHaveLength(13);
    for (const id of Object.keys(THEMES) as Skin[]) {
      expect(SKIN_ORDER).toContain(id);
      expect(THEMES[id].id).toBe(id);
      expect(THEMES[id].name.length).toBeGreaterThan(0);
      expect(THEMES[id].tag.length).toBeGreaterThan(0);
      expect(THEMES[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it("still knows every theme id older builds saved", () => {
    for (const id of ["crested", "penguin", "turtle", "elephant", "dark", "light", "deuteranopia", "protanopia", "tritanopia", "eyecomfort"]) {
      expect(SKIN_ORDER).toContain(id);
    }
  });

  it("groups the cards like the Settings mockup", () => {
    const group = (g: string) => SKIN_ORDER.filter((id) => THEMES[id].group === g);
    expect(group("theme")).toEqual(["auto", "crested", "dark", "light", "eyecomfort", "eyecomfort-light"]);
    expect(group("animal")).toEqual(["penguin", "turtle", "elephant"]);
    expect(group("access")).toEqual(["deuteranopia", "protanopia", "tritanopia", "highcontrast"]);
    expect(CONCRETE_SKINS).not.toContain("auto");
  });

  it("keeps the fun words on the animal themes only; the default says Send", () => {
    expect(THEMES.crested.sendVerb).toBe("Send");
    expect(THEMES.penguin.sendVerb).toBe("Squawk");
    expect(THEMES.turtle.sendVerb).toBe("Bloop");
    expect(THEMES.elephant.sendVerb).toBe("Trumpet");
  });

  it("resolves Auto to the light or dark choice", () => {
    expect(resolveSkin("auto", "light", "crested", true)).toBe("crested");
    expect(resolveSkin("auto", "eyecomfort-light", "penguin", false)).toBe("eyecomfort-light");
    expect(resolveSkin("dark", "light", "crested", false)).toBe("dark");
  });
});
