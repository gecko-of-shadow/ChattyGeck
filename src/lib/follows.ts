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
