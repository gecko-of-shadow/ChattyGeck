/** Twitch permission for reading the channels you follow (one extra login for people who logged in before). */
export const FOLLOWS_SCOPE = "user:read:follows";

/** How often live dots and viewer counts refresh while the window is showing. */
export const LIVE_POLL_MS = 90_000;
/** How often the follow list itself is fetched again (it rarely changes). */
export const FOLLOWS_REFRESH_MS = 15 * 60_000;

export interface FollowView {
  displayName: string;
  avatarUrl?: string;
  /** ISO date from Twitch's followed_at. */
  followedAt: string;
}

export function hasFollowsScope(scopes: readonly string[] | undefined): boolean {
  return !!scopes?.includes(FOLLOWS_SCOPE);
}

/**
 * The top strip's order: channels added in the app that you don't follow first (in their saved order), then every
 * followed channel, most recently followed first. Followed channels that are also in the app list sit with the follows.
 */
export function mergeStrip(appChannels: readonly string[], follows: Readonly<Record<string, FollowView>>): string[] {
  const followed = Object.keys(follows).sort((a, b) => {
    const diff = Date.parse(follows[b].followedAt) - Date.parse(follows[a].followedAt);
    return diff || a.localeCompare(b);
  });
  const appOnly = appChannels.filter((login) => !(login in follows));
  return [...appOnly, ...followed];
}

/**
 * Offset for `moveItem(appChannels, login, offset)` that moves `login` past its neighbour in the strip, among the
 * channels whose place you choose (app-only ones; follows are ordered by date). Null at either end.
 */
export function stripMoveOffset(
  order: readonly string[],
  appChannels: readonly string[],
  movable: (login: string) => boolean,
  login: string,
  direction: -1 | 1,
): number | null {
  const group = order.filter(movable);
  const neighbour = group[group.indexOf(login) + direction];
  if (!movable(login) || neighbour === undefined) return null;
  const from = appChannels.indexOf(login);
  const to = appChannels.indexOf(neighbour);
  return from < 0 || to < 0 ? null : to - from;
}

/** stripMoveOffset for every channel at once (one pass; the strip can hold hundreds of follows). */
export function stripMoveOffsets(
  order: readonly string[],
  appChannels: readonly string[],
  movable: (login: string) => boolean,
): Map<string, { left: number | null; right: number | null }> {
  const appIndex = new Map(appChannels.map((login, i) => [login, i]));
  const group = order.filter(movable);
  const offsets = new Map<string, { left: number | null; right: number | null }>();
  group.forEach((login, i) => {
    const from = appIndex.get(login);
    const to = (neighbour: string | undefined) => {
      const target = neighbour === undefined ? undefined : appIndex.get(neighbour);
      return from === undefined || target === undefined ? null : target - from;
    };
    offsets.set(login, { left: to(group[i - 1]), right: to(group[i + 1]) });
  });
  return offsets;
}

const viewerFormat = new Intl.NumberFormat("en-US");

/** "1,234 watching" while live, "offline" otherwise. */
export function liveLabel(viewers: number | undefined): string {
  return viewers === undefined ? "offline" : `${viewerFormat.format(viewers)} watching`;
}

/** Only sets a new live map when something changed, so 100 avatars don't re-render every poll. */
export function sameLive(a: Readonly<Record<string, number>> | null, b: Readonly<Record<string, number>>): boolean {
  if (!a) return false;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => a[key] === b[key]);
}
