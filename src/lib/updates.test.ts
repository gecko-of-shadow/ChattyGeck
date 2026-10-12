import { describe, expect, it } from "vitest";
import { isNewerVersion } from "./updates";

describe("isNewerVersion", () => {
  it("treats a higher patch as newer", () => {
    expect(isNewerVersion("0.4.0", "0.3.3")).toBe(true);
    expect(isNewerVersion("v0.4.0", "0.3.3")).toBe(true);
  });

  it("is false when versions match", () => {
    expect(isNewerVersion("0.4.0", "0.4.0")).toBe(false);
    expect(isNewerVersion("v0.4.0", "0.4.0")).toBe(false);
  });

  it("is false when latest is older", () => {
    expect(isNewerVersion("0.3.0", "0.4.0")).toBe(false);
  });
});
