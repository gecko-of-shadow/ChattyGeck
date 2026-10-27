import { describe, expect, it } from "vitest";
import { readableNameColor, readableTagColor, rowBackgrounds, tagDisc } from "./colors";
import { CONTRAST_CHECKS, contrastRatio, THEME_TOKENS, TOKEN_NAMES } from "./themeTokens";
import { CONCRETE_SKINS } from "./themes";

// Vitest hands CSS imports back as empty text, so read index.css from disk. The module name is a variable because
// the app's tsconfig has no Node types.
const fsModule = "node:fs";
const { readFileSync } = await import(/* @vite-ignore */ fsModule);
const css: string = readFileSync(new URL("../index.css", import.meta.url), "utf8");

/** The `--zc-*` values one theme block in index.css sets. */
function cssTokens(skin: string): Record<string, string> {
  const start = css.indexOf(`[data-skin="${skin}"] {`);
  expect(start, `index.css has a block for ${skin}`).toBeGreaterThanOrEqual(0);
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--zc-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) out[m[1]] = m[2].toLowerCase();
  return out;
}

describe("theme tokens", () => {
  it("has all 19 tokens for each of the 12 concrete themes", () => {
    expect(CONCRETE_SKINS).toHaveLength(12);
    for (const skin of CONCRETE_SKINS) {
      expect(Object.keys(THEME_TOKENS[skin]).sort()).toEqual([...TOKEN_NAMES].sort());
    }
  });

  it("index.css sets exactly the same colours as themeTokens.ts", () => {
    for (const skin of CONCRETE_SKINS) {
      expect(cssTokens(skin), skin).toEqual(THEME_TOKENS[skin]);
    }
  });

  it("passes the 17 WCAG checks in every theme (text 4.5:1, UI parts 3:1)", () => {
    const failures: string[] = [];
    for (const skin of CONCRETE_SKINS) {
      const t = THEME_TOKENS[skin];
      for (const [label, fg, bg, min] of CONTRAST_CHECKS) {
        const ratio = contrastRatio(t[fg], t[bg]);
        if (ratio < min) failures.push(`${skin}: ${label} ${fg} on ${bg} = ${ratio.toFixed(2)} (needs ${min})`);
      }
    }
    expect(CONTRAST_CHECKS).toHaveLength(17);
    expect(failures).toEqual([]);
  });

  it("computes WCAG ratios like the reference checker", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#d8ddd6", "#141614")).toBeCloseTo(13.19, 2);
  });
});

/** `color-mix(in srgb, a p%, b)` as index.css writes it: plain per-channel sRGB mixing. */
function mixHex(a: string, b: string, p: number): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) * p + ch(b, i) * (1 - p)).toString(16).padStart(2, "0")).join("")}`;
}

describe("derived colours in index.css", () => {
  // Same percentages as the :root block in index.css.
  const derived = (t: (typeof THEME_TOKENS)["crested"]) => ({
    mention: mixHex(t.accent, t.text, 0.92),
    warn: mixHex(t["accent-2"], t.text, 0.92),
    dangerText: mixHex(t.danger, t.text, 0.55),
    mutedOnMention: mixHex(t.muted, t.text, 0.8),
    accentHover: mixHex(t.accent, t.text, 0.88),
  });

  it("reads at 4.5:1 wherever these colours are used as text", () => {
    const failures: string[] = [];
    const check = (skin: string, label: string, fg: string, bg: string, min = 4.5) => {
      const r = contrastRatio(fg, bg);
      if (r < min) failures.push(`${skin}: ${label} = ${r.toFixed(2)} (needs ${min})`);
    };
    for (const skin of CONCRETE_SKINS) {
      const t = THEME_TOKENS[skin];
      const d = derived(t);
      for (const surface of ["bg", "surface", "surface-2", "mention"] as const) {
        check(skin, `mention cue on ${surface}`, d.mention, t[surface]);
        check(skin, `warn on ${surface}`, d.warn, t[surface]);
      }
      for (const surface of ["bg", "surface", "surface-2"] as const) check(skin, `danger text on ${surface}`, d.dangerText, t[surface]);
      for (const surface of ["bg", "surface-2"] as const) {
        // Danger buttons / menu items rest at 10% and hover at 15% danger tint, on the page or in a dialog/menu.
        check(skin, `danger text on danger hover (${surface})`, d.dangerText, mixHex(t.danger, t[surface], 0.15));
      }
      // Input placeholders (muted) on the page-coloured input inside a dialog.
      check(skin, "placeholder in inputs", t.muted, t.bg);
      check(skin, "muted on mention highlight", d.mutedOnMention, t.mention);
      check(skin, "button text on hovered accent", t["on-accent"], d.accentHover);
      check(skin, "warn dot on panels", d.warn, t.surface, 3);
      // Hovered / highlighted menu items (--accent) and their secondary text (boosted in index.css).
      const hover = mixHex(t["surface-2"], t.text, 0.88);
      check(skin, "text on hovered item", t.text, hover);
      check(skin, "secondary text on highlighted menu item", mixHex(t.muted, t.text, 0.5), hover);
      check(skin, "focus bar on highlighted menu item", t.focus, hover, 3);
      check(skin, "highlight bar (accent-2) on mention background", t["accent-2"], t.mention, 3);
      check(skin, "focus ring on raised panels", t.focus, t["surface-2"], 3);
      check(skin, "checked switch on raised panels", t.accent, t["surface-2"], 3);
      check(skin, "secondary text on raised panels", t.muted, t["surface-2"]);
      // Switch: unchecked track is muted, its thumb the page colour.
      for (const surface of ["bg", "surface", "surface-2"] as const) check(skin, `switch track on ${surface}`, t.muted, t[surface], 3);
    }
    expect(failures).toEqual([]);
  });
});

describe("avatar letters and strip badges", () => {
  // Enough names to hit every one of the 10 tag colours.
  const names = Array.from({ length: 60 }, (_, i) => `channel${i}`);

  it("letter avatars read at 4.5:1 on their own disc in every theme", () => {
    const failures: string[] = [];
    for (const skin of CONCRETE_SKINS) {
      const surface = THEME_TOKENS[skin].surface;
      for (const name of names) {
        const letter = readableTagColor(name, skin);
        const r = contrastRatio(letter, tagDisc(letter, surface));
        if (r < 4.5) failures.push(`${skin} ${name}: ${r.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("unread numbers (small text on the badge) read at 4.5:1", () => {
    for (const skin of CONCRETE_SKINS) {
      const t = THEME_TOKENS[skin];
      expect(contrastRatio(t["badge-ink"], t.badge), skin).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t["on-danger"], t.danger), skin).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("chatter name colours", () => {
  const samples = ["#0000FF", "#FF0000", "#008000", "#8A2BE2", "#FFFF00", "#00FF7F", "#FFFFFF", "#000000", undefined];

  it("reach 4.5:1 on every row background in every theme", () => {
    for (const skin of CONCRETE_SKINS) {
      for (const color of samples) {
        const out = readableNameColor(color, "somebody", skin);
        for (const bg of rowBackgrounds(skin)) {
          expect(contrastRatio(out, bg), `${skin} ${color} -> ${out} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps a colour that already reads well", () => {
    expect(readableNameColor("#9ACD32", "x", "crested")).toBe("#9acd32");
  });
});
