import { describe, expect, it } from "vitest";
import type { Emote } from "@/lib/emotes/types";
import { findUsers, rememberUsers, tabMatches, type ActiveUser } from "./activeUsers";

function line(login: string, displayName = login, kind = "chat", extra: { self?: boolean; pending?: string } = {}) {
  return { kind, login, displayName, ...extra };
}

describe("rememberUsers", () => {
  it("keeps the newest speakers first and skips you, system lines, and junk logins", () => {
    const next = rememberUsers(
      [],
      [
        line("ada", "Ada"),
        line("me", "Me", "chat", { self: true }),
        { kind: "system", login: "mod", displayName: "Mod" },
        line("not a login", "Nope"),
        line("ada", "Ada"),
        line("bea", "Bea"),
      ],
      "me",
    );
    expect(next).toEqual([
      { login: "bea", displayName: "Bea" },
      { login: "ada", displayName: "Ada" },
    ]);
  });

  it("returns the same array when nothing about the list changed", () => {
    const existing: ActiveUser[] = [{ login: "ada", displayName: "Ada" }];
    expect(rememberUsers(existing, [{ kind: "notice", login: "bea" }])).toBe(existing);
    expect(rememberUsers(existing, [line("ada", "Ada")])).toBe(existing);
    expect(rememberUsers(existing, [line("me", "Me")], "me")).toBe(existing);
  });

  it("moves a repeat speaker to the front and refreshes a display name", () => {
    const existing: ActiveUser[] = [
      { login: "bea", displayName: "Bea" },
      { login: "ada", displayName: "Ada" },
    ];
    expect(rememberUsers(existing, [line("ada", "Ada")])).toEqual([
      { login: "ada", displayName: "Ada" },
      { login: "bea", displayName: "Bea" },
    ]);
    expect(rememberUsers(existing, [line("bea", "Beatrice")])).toEqual([
      { login: "bea", displayName: "Beatrice" },
      { login: "ada", displayName: "Ada" },
    ]);
  });

  it("drops the oldest names past the cap", () => {
    const existing: ActiveUser[] = [
      { login: "bea", displayName: "Bea" },
      { login: "ada", displayName: "Ada" },
    ];
    expect(rememberUsers(existing, [line("cy", "Cy")], undefined, 2)).toEqual([
      { login: "cy", displayName: "Cy" },
      { login: "bea", displayName: "Bea" },
    ]);
  });
});

describe("findUsers", () => {
  const users: ActiveUser[] = [
    { login: "sayhello", displayName: "SayHello" },
    { login: "hello", displayName: "Hello" },
    { login: "ada", displayName: "Ada" },
    { login: "helloworld", displayName: "HW" },
  ];

  it("lists prefix matches in recency order, then contains matches", () => {
    expect(findUsers(users, "hello").map((user) => user.login)).toEqual(["hello", "helloworld", "sayhello"]);
    expect(findUsers(users, "AD").map((user) => user.login)).toEqual(["ada"]);
  });

  it("lists the newest people when the typed text is empty", () => {
    expect(findUsers(users, "", 2).map((user) => user.login)).toEqual(["sayhello", "hello"]);
  });
});

describe("tabMatches", () => {
  const emote = { name: "Kappa" } as Emote;
  const users: ActiveUser[] = [
    { login: "kappa", displayName: "Kappa" },
    { login: "ada", displayName: "Ada" },
  ];

  it("offers emotes first, then people, and people only after @", () => {
    expect(tabMatches("Ka", [emote], users).map((match) => (match.kind === "emote" ? match.emote.name : match.login))).toEqual([
      "Kappa",
      "kappa",
    ]);
    expect(tabMatches("@ad", [], users).map((match) => (match.kind === "user" ? match.login : ""))).toEqual(["ada"]);
    expect(tabMatches("@", [], users)).toHaveLength(2);
    expect(tabMatches("K", [emote], users)).toEqual([]);
  });

  it("caps a bare @ at the recent handful", () => {
    const crowd = Array.from({ length: 10 }, (_, index) => ({ login: `user${index}`, displayName: `User${index}` }));
    expect(tabMatches("@", [], crowd)).toHaveLength(8);
  });
});
