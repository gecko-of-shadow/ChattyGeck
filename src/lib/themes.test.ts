import { describe, expect, it } from "vitest";
import { DEFAULT_SKIN, SKIN_ORDER, THEMES, type Skin } from "./themes";

describe("themes", () => {
  it("lists every skin once and keeps the crested gecko as default", () => {
    expect(DEFAULT_SKIN).toBe("crested");
    expect(new Set(SKIN_ORDER).size).toBe(SKIN_ORDER.length);
    for (const id of Object.keys(THEMES) as Skin[]) {
      expect(SKIN_ORDER).toContain(id);
      expect(THEMES[id].id).toBe(id);
      expect(THEMES[id].name.length).toBeGreaterThan(0);
      expect(THEMES[id].blurb.length).toBeGreaterThan(0);
    }
  });

  it("keeps the four animal skins and the appearance set", () => {
    const animals = SKIN_ORDER.filter((id) => THEMES[id].kind === "animal");
    const appearance = SKIN_ORDER.filter((id) => THEMES[id].kind === "appearance");
    expect(animals).toEqual(["crested", "penguin", "turtle", "elephant"]);
    expect(appearance).toEqual([
      "dark",
      "light",
      "deuteranopia",
      "protanopia",
      "tritanopia",
      "eyecomfort",
    ]);
  });
});
