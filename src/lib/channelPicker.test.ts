import { describe, expect, it } from "vitest";
import { addedMoveOffset, moveHighlight, pickerModel } from "./channelPicker";
import type { FollowView } from "./follows";

const follow = (followedAt: string, displayName: string): FollowView => ({ displayName, followedAt });

const follows: Record<string, FollowView> = {
  oldfriend: follow("2024-01-01T00:00:00Z", "OldFriend"),
  geckotown: follow("2026-05-01T00:00:00Z", "GeckoTown"),
  lizardlounge: follow("2025-03-01T00:00:00Z", "LizardLounge"),
};
// geckotown is both added by hand and followed: it belongs to Following only.
const app = ["zeta", "geckotown", "alpha"];

const logins = (rows: { login: string }[]) => rows.map((r) => r.login);

describe("channel picker lists", () => {
  it("splits Following (newest follow first) and Added (hand-added, not followed, saved order) with no duplicates", () => {
    const model = pickerModel("", app, follows);
    expect(logins(model.following)).toEqual(["geckotown", "lizardlounge", "oldfriend"]);
    expect(logins(model.added)).toEqual(["zeta", "alpha"]);
    expect(model.addable).toBeNull();
    expect(logins(model.items)).toEqual(["geckotown", "lizardlounge", "oldfriend", "zeta", "alpha"]);
  });

  it("uses display names for followed rows and the given names for added ones", () => {
    const model = pickerModel("", app, follows, { zeta: "ZetaTV" });
    expect(model.following[0].name).toBe("GeckoTown");
    expect(model.added.map((r) => r.name)).toEqual(["ZetaTV", "alpha"]);
  });

  it("filters both sections live, ignoring case, by login or display name", () => {
    const liz = pickerModel("LIZ", app, follows);
    expect(logins(liz.following)).toEqual(["lizardlounge"]);
    expect(liz.added).toEqual([]);
    expect(logins(pickerModel("a", app, follows).following)).toEqual(["lizardlounge"]);
    expect(logins(pickerModel("a", app, follows).added)).toEqual(["zeta", "alpha"]);
    expect(logins(pickerModel("ZetaT", app, follows, { zeta: "ZetaTV" }).added)).toEqual(["zeta"]);
    expect(logins(pickerModel("  #Gecko ", app, follows).following)).toEqual(["geckotown"]);
  });

  it("offers Add #name only for a valid channel name that isn't listed", () => {
    const none = pickerModel("NewChannel", app, follows);
    expect(none.following).toEqual([]);
    expect(none.added).toEqual([]);
    expect(none.addable).toBe("newchannel");
    expect(none.items).toEqual([{ kind: "add", login: "newchannel" }]);
    expect(pickerModel("https://www.twitch.tv/SomeOne", app, follows).addable).toBe("someone");
    // Already listed (in either section), or not a channel name: nothing to add.
    expect(pickerModel("GeckoTown", app, follows).addable).toBeNull();
    expect(pickerModel("alpha", app, follows).addable).toBeNull();
    expect(pickerModel("not a name!", app, follows).addable).toBeNull();
    // A partial match still offers adding the exact name, after the matches.
    const partial = pickerModel("gecko", app, follows);
    expect(partial.items.map((i) => `${i.kind}:${i.login}`)).toEqual(["channel:geckotown", "add:gecko"]);
  });

  it("works with no follows at all (logged out or the list failed)", () => {
    const model = pickerModel("", app, {});
    expect(model.following).toEqual([]);
    expect(logins(model.added)).toEqual(app);
  });
});

describe("channel picker keys", () => {
  it("moves the highlight with the arrow keys and stops at the ends", () => {
    expect(moveHighlight(0, "ArrowDown", 3)).toBe(1);
    expect(moveHighlight(2, "ArrowDown", 3)).toBe(2);
    expect(moveHighlight(0, "ArrowUp", 3)).toBe(0);
    expect(moveHighlight(1, "End", 3)).toBe(2);
    expect(moveHighlight(2, "Home", 3)).toBe(0);
    // The list got shorter while typing: the highlight comes back inside it.
    expect(moveHighlight(7, "x", 3)).toBe(2);
    expect(moveHighlight(4, "ArrowDown", 0)).toBe(0);
  });
});

describe("moving an Added channel", () => {
  it("moves past its Added neighbour, skipping followed channels in the saved list", () => {
    const saved = ["zeta", "geckotown", "alpha", "beta"];
    const added = ["zeta", "alpha", "beta"];
    expect(addedMoveOffset(added, saved, "alpha", -1)).toBe(-2);
    expect(addedMoveOffset(added, saved, "alpha", 1)).toBe(1);
    expect(addedMoveOffset(added, saved, "zeta", -1)).toBeNull();
    expect(addedMoveOffset(added, saved, "beta", 1)).toBeNull();
    expect(addedMoveOffset(added, saved, "geckotown", 1)).toBeNull();
  });
});
