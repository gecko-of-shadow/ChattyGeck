import type { FollowView } from "@/lib/follows";
import { normalizeChannelName } from "@/lib/twitch/messages";

/** One channel row in a pane's channel picker. */
export interface PickerRow {
  kind: "channel";
  login: string;
  /** Twitch display name when known, else the login. */
  name: string;
  section: "following" | "added";
}

/** The "Add #name" row, offered when what's typed is a channel name that isn't listed yet. */
export interface PickerAddRow {
  kind: "add";
  login: string;
}

export type PickerItem = PickerRow | PickerAddRow;

export interface PickerModel {
  following: PickerRow[];
  added: PickerRow[];
  addable: string | null;
  /** Every row in screen order (Following, Added, then the add row): what the arrow keys walk through. */
  items: PickerItem[];
}

/** What a search matches against: a pasted twitch.tv link or "#name" searches for the name, case doesn't matter. */
function searchTerm(query: string): string {
  return normalizeChannelName(query) ?? query.trim().replace(/^[#@]/, "").toLowerCase();
}

/**
 * The picker's two lists. Following: channels the Twitch account follows, most recently followed first. Added: channels
 * added in the app that aren't followed, in their saved order (so no channel is in both). Typing filters both, by login
 * or display name, ignoring case.
 */
export function pickerModel(
  query: string,
  appChannels: readonly string[],
  follows: Readonly<Record<string, FollowView>>,
  displayNames: Readonly<Record<string, string | undefined>> = {},
  // The follow order doesn't depend on what's typed: pass sortFollows(follows) once instead of sorting per keystroke.
  followed: readonly string[] = sortFollows(follows),
): PickerModel {
  const term = searchTerm(query);
  const matches = (row: PickerRow) => !term || row.login.includes(term) || row.name.toLowerCase().includes(term);

  const following: PickerRow[] = followed
    .map((login) => ({ kind: "channel" as const, login, name: follows[login].displayName || login, section: "following" as const }))
    .filter(matches);
  const added: PickerRow[] = appChannels
    .filter((login, i) => !(login in follows) && appChannels.indexOf(login) === i)
    .map((login) => ({ kind: "channel" as const, login, name: displayNames[login] || login, section: "added" as const }))
    .filter(matches);

  const candidate = normalizeChannelName(query);
  const listed = candidate !== null && (candidate in follows || appChannels.includes(candidate));
  const addable = candidate && !listed ? candidate : null;
  const items: PickerItem[] = [...following, ...added, ...(addable ? [{ kind: "add" as const, login: addable }] : [])];
  return { following, added, addable, items };
}

/** Followed channels, most recently followed first (ties by name). */
export function sortFollows(follows: Readonly<Record<string, FollowView>>): string[] {
  const time = new Map(Object.entries(follows).map(([login, f]) => [login, Date.parse(f.followedAt)]));
  return [...time.keys()].sort((a, b) => time.get(b)! - time.get(a)! || a.localeCompare(b));
}

/** Arrow keys: one row up or down, stopping at the ends (Home / End jump there). */
export function moveHighlight(index: number, key: string, count: number): number {
  if (count <= 0) return 0;
  const current = Math.min(Math.max(index, 0), count - 1);
  switch (key) {
    case "ArrowDown":
      return Math.min(count - 1, current + 1);
    case "ArrowUp":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return current;
  }
}

/**
 * Offset for `moveChannel(login, offset)` that moves an Added channel past its neighbour in the Added list (followed
 * channels sit in between in the saved list but aren't moved). Null at either end.
 */
export function addedMoveOffset(
  added: readonly string[],
  appChannels: readonly string[],
  login: string,
  direction: -1 | 1,
): number | null {
  const neighbour = added[added.indexOf(login) + direction];
  if (!added.includes(login) || neighbour === undefined) return null;
  const from = appChannels.indexOf(login);
  const to = appChannels.indexOf(neighbour);
  return from < 0 || to < 0 ? null : to - from;
}
