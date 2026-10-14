import type { Emote } from "@/lib/emotes/types";

/** Someone who has spoken in this channel. `login` is lowercase. Newest entries stay at the front. */
export interface ActiveUser {
  login: string;
  displayName: string;
}

export const MAX_ACTIVE_USERS = 400;
export const MAX_USER_MATCHES = 20;
/** `@` with nothing after it lists this many recent chatters. */
export const MAX_BARE_MENTION_MATCHES = 8;

const LOGIN = /^[a-z0-9_]{1,25}$/;

export interface ChatterLine {
  kind: string;
  login?: string;
  displayName?: string;
  self?: boolean;
  pending?: unknown;
}

/**
 * Fold new speakers into `existing`, newest first.
 * Returns the same array when the batch adds nobody and changes nobody's place or display name.
 */
export function rememberUsers(
  existing: readonly ActiveUser[],
  messages: readonly ChatterLine[],
  selfLogin?: string,
  cap = MAX_ACTIVE_USERS,
): ActiveUser[] {
  const self = selfLogin?.toLowerCase();
  const incoming: ActiveUser[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0 && incoming.length < cap; i--) {
    const message = messages[i];
    if (message.self || message.pending) continue;
    if (message.kind !== "chat" && message.kind !== "action") continue;
    const login = message.login?.trim().toLowerCase() ?? "";
    if (!LOGIN.test(login) || login === self || seen.has(login)) continue;
    seen.add(login);
    incoming.push({ login, displayName: message.displayName?.trim() || login });
  }
  if (!incoming.length) return existing as ActiveUser[];

  const next: ActiveUser[] = incoming.slice(0, cap);
  if (next.length < cap) {
    for (const user of existing) {
      if (seen.has(user.login)) continue;
      next.push(user);
      seen.add(user.login);
      if (next.length >= cap) break;
    }
  }
  if (
    next.length === existing.length &&
    next.every((user, index) => user.login === existing[index].login && user.displayName === existing[index].displayName)
  ) {
    return existing as ActiveUser[];
  }
  return next;
}

/**
 * Recent chatters whose login or display name starts with `typed`, then those that only contain it.
 * An empty `typed` is the bare `@` list: the newest people, already in recency order.
 */
export function findUsers(users: readonly ActiveUser[], typed: string, limit = MAX_USER_MATCHES): ActiveUser[] {
  if (limit <= 0) return [];
  const needle = typed.toLowerCase();
  const prefix: ActiveUser[] = [];
  const contains: ActiveUser[] = [];
  for (const user of users) {
    if (!needle) {
      prefix.push(user);
      if (prefix.length >= limit) break;
      continue;
    }
    const login = user.login.toLowerCase();
    const display = user.displayName.toLowerCase();
    if (login.startsWith(needle) || display.startsWith(needle)) {
      if (prefix.length < limit) prefix.push(user);
    } else if (login.includes(needle) || display.includes(needle)) {
      contains.push(user);
    }
    if (prefix.length >= limit) break;
  }
  if (!needle || prefix.length >= limit) return prefix;
  return prefix.concat(contains.slice(0, limit - prefix.length));
}

export type TabMatch = { kind: "emote"; emote: Emote } | { kind: "user"; login: string; displayName: string };

/** What Tab should cycle. A word that starts with `@` is people only. Other words are emotes, then people. */
export function tabMatches(word: string, emotes: readonly Emote[], users: readonly ActiveUser[]): TabMatch[] {
  if (word.startsWith("@")) {
    const typed = word.slice(1);
    const limit = typed.length === 0 ? MAX_BARE_MENTION_MATCHES : MAX_USER_MATCHES;
    return findUsers(users, typed, limit).map((user) => ({
      kind: "user",
      login: user.login,
      displayName: user.displayName,
    }));
  }
  if (word.length < 2) return [];
  return [
    ...emotes.map((emote) => ({ kind: "emote" as const, emote })),
    ...findUsers(users, word, MAX_USER_MATCHES).map((user) => ({
      kind: "user" as const,
      login: user.login,
      displayName: user.displayName,
    })),
  ];
}

/** Text that replaces the word being completed, without the trailing space. */
export function completionInsert(match: TabMatch): string {
  return match.kind === "emote" ? match.emote.name : `@${match.login}`;
}
