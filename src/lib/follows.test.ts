import { describe, expect, it } from "vitest";
import { moveItem } from "./view/reorder";
import { hasFollowsScope, liveLabel, mergeStrip, sameLive, stripMoveOffset, stripMoveOffsets, type FollowView } from "./follows";

const follow = (followedAt: string): FollowView => ({ displayName: "x", followedAt });

describe("mergeStrip", () => {
  it("puts app-only channels first in saved order, then follows newest first", () => {
    const follows = {
      old: follow("2024-01-01T00:00:00Z"),
      newest: follow("2026-10-01T00:00:00Z"),
      middle: follow("2025-06-01T00:00:00Z"),
    };
    expect(mergeStrip(["zeta", "middle", "alpha"], follows)).toEqual(["zeta", "alpha", "newest", "middle", "old"]);
  });

  it("is the app list unchanged when there are no follows (logged out)", () => {
    expect(mergeStrip(["b", "a", "c"], {})).toEqual(["b", "a", "c"]);
  });

  it("lists a channel only once", () => {
    const order = mergeStrip(["a", "b"], { a: follow("2026-01-01T00:00:00Z") });
    expect(order).toEqual(["b", "a"]);
  });
});

describe("stripMoveOffset", () => {
  const app = ["a", "f1", "b", "c"];
  const order = mergeStrip(app, { f1: follow("2026-01-01T00:00:00Z") }); // a, b, c, f1
  const movable = (login: string) => login !== "f1";

  it("moves an app-only channel past its app-only neighbour, skipping follows", () => {
    const offset = stripMoveOffset(order, app, movable, "b", -1);
    expect(moveItem(app, "b", offset!)).toEqual(["b", "a", "f1", "c"]);
    const right = stripMoveOffset(order, app, movable, "a", 1);
    expect(moveItem(app, "a", right!)).toEqual(["f1", "b", "a", "c"]);
  });

  it("gives the same answers for every channel in one pass", () => {
    const all = stripMoveOffsets(order, app, movable);
    for (const login of order) {
      expect(all.get(login)?.left ?? null).toBe(stripMoveOffset(order, app, movable, login, -1));
      expect(all.get(login)?.right ?? null).toBe(stripMoveOffset(order, app, movable, login, 1));
    }
  });

  it("is null at the ends and for followed channels", () => {
    expect(stripMoveOffset(order, app, movable, "a", -1)).toBeNull();
    expect(stripMoveOffset(order, app, movable, "c", 1)).toBeNull();
    expect(stripMoveOffset(order, app, movable, "f1", -1)).toBeNull();
  });
});

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
