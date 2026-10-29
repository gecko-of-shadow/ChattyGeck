import { describe, expect, it } from "vitest";
import { hasFollowsScope, liveLabel, sameLive } from "./follows";

// The strip's order and Move left/right tests became channelPicker.test.ts (Following/Added split, Move up/down).
describe("helpers", () => {
  it("checks the follows permission", () => {
    expect(hasFollowsScope(["chat:read", "chat:edit"])).toBe(false);
    expect(hasFollowsScope(["chat:read", "user:read:follows"])).toBe(true);
    expect(hasFollowsScope(undefined)).toBe(false);
  });

  it("words the viewer count", () => {
    expect(liveLabel(1234)).toBe("1,234 watching");
    expect(liveLabel(0)).toBe("0 watching");
    expect(liveLabel(undefined)).toBe("offline");
  });

  it("spots unchanged live maps", () => {
    expect(sameLive(null, {})).toBe(false);
    expect(sameLive({ a: 1 }, { a: 1 })).toBe(true);
    expect(sameLive({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameLive({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});
