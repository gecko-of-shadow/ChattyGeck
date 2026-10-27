import { describe, expect, it } from "vitest";
import bootScript from "../../public/theme-boot.js?raw";
import { BOOT_THEME_KEY, CONCRETE_SKINS, THEMES } from "./themes";

/** Runs public/theme-boot.js against a tiny fake page and returns what it put on <html>. */
function boot(saved: unknown, windowsDark: boolean | null) {
  const attrs: Record<string, string> = {};
  const classes = new Set(["dark"]);
  let metaContent = "dark";
  const root = {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
    style: { colorScheme: "" },
  };
  const document = {
    documentElement: root,
    querySelector: () => ({ setAttribute: (_k: string, v: string) => (metaContent = v) }),
  };
  const store: Record<string, string> = saved === undefined ? {} : { [BOOT_THEME_KEY]: typeof saved === "string" ? saved : JSON.stringify(saved) };
  const localStorage = { getItem: (k: string) => store[k] ?? null };
  const window = {
    matchMedia: (q: string) => ({
      matches: windowsDark === null ? false : q.includes("dark") ? windowsDark : !windowsDark,
    }),
  };
  new Function("document", "localStorage", "window", bootScript)(document, localStorage, window);
  return { skin: attrs["data-skin"], dark: classes.has("dark"), scheme: root.style.colorScheme, meta: metaContent };
}

describe("theme-boot.js (theme before first paint)", () => {
  it("knows exactly the concrete themes", () => {
    const list = /var KNOWN = \[([\s\S]*?)\];/.exec(bootScript)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    expect([...list].sort()).toEqual([...CONCRETE_SKINS].sort());
  });

  it("knows exactly the light themes", () => {
    const light = /var LIGHT = \[([\s\S]*?)\];/.exec(bootScript)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
    expect([...light].sort()).toEqual(CONCRETE_SKINS.filter((id) => THEMES[id].surface === "light").sort());
  });

  it("puts the saved theme on the page, light themes in light mode", () => {
    expect(boot({ skin: "light" }, true)).toEqual({ skin: "light", dark: false, scheme: "light", meta: "light" });
    expect(boot({ skin: "eyecomfort-light" }, true).dark).toBe(false);
    expect(boot({ skin: "penguin" }, false)).toEqual({ skin: "penguin", dark: true, scheme: "dark", meta: "dark" });
  });

  it("follows Windows for Auto, with both choices", () => {
    expect(boot({ skin: "auto", light: "eyecomfort-light", dark: "turtle" }, true).skin).toBe("turtle");
    expect(boot({ skin: "auto", light: "eyecomfort-light", dark: "turtle" }, false).skin).toBe("eyecomfort-light");
    expect(boot({ skin: "auto" }, false).skin).toBe("light");
    expect(boot({ skin: "auto" }, true).skin).toBe("crested");
    // No preference reported: dark, like prefersDarkNow().
    expect(boot({ skin: "auto" }, null).skin).toBe("crested");
  });

  it("falls back to Crested gecko for nothing saved, junk or unknown ids", () => {
    expect(boot(undefined, false).skin).toBe("crested");
    expect(boot("{not json", false).skin).toBe("crested");
    expect(boot({ skin: "shadow" }, false).skin).toBe("crested");
    expect(boot({ skin: "auto", light: "auto", dark: "nope" }, false).skin).toBe("light");
  });
});
