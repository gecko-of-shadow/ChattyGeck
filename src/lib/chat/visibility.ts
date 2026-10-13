import type { ViewMode } from "@/store/settings";

/**
 * A channel is on screen only in the view the user is actually looking at.
 * Grid mode shows `gridChannels` only. The last focused name must not count
 * once the grid is up, or a channel tucked off the grid never gains unread.
 */
export function channelOnScreen(
  mode: ViewMode,
  focused: string | null,
  gridChannels: readonly string[],
  channel: string,
): boolean {
  if (mode === "grid") return gridChannels.includes(channel);
  return focused === channel;
}

/**
 * Opening a channel from the grid drops the "new since you left" divider only
 * when that channel was already on the grid. An off-grid channel keeps the
 * marker from when you left it.
 */
export function readMarkerAfterFocus(
  fromGrid: boolean,
  wasOnGrid: boolean,
  marker: string | undefined,
): string | undefined {
  return fromGrid && wasOnGrid ? undefined : marker;
}
