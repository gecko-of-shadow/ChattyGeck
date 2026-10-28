import type { ChatMessage } from "@/lib/twitch/types";

/** Never mount more than this many rows while following live chat. */
export const MAX_LIVE_WINDOW = 400;

/** Extra history rows to mount each time a paused log is scrolled to its top. */
export const HISTORY_PAGE = 200;

/** DOM cap while paused. Older rows stay in memory and load as you scroll up. */
export const MAX_PAUSED_ROWS = 800;

/** A log within this many px of the bottom counts as following live chat. */
export const LIVE_SLACK_PX = 40;

/** A scroll this soon after wheel, touch, pointer or key input inside the log is the person's own. */
export const GESTURE_MS = 600;

/**
 * Whether a scroll event means the person scrolled up to read, so the feed should pause.
 * `liveTop` is scrollTop the last time the log was at the bottom, so a slow drag that moves
 * less than a pixel per event still adds up. Layout shifts never pause it: a box that got
 * shorter keeps its scrollTop, and a top the browser clamps lands back at the bottom.
 */
export function isUserScrollUp(liveTop: number, top: number, distanceFromBottom: number, sinceGestureMs: number): boolean {
  return distanceFromBottom >= LIVE_SLACK_PX && top < liveTop - 1 && sinceGestureMs < GESTURE_MS;
}

/**
 * Rows to paint while stuck to the bottom.
 * A nearby "new since you left" marker stays in the window. An old one does not
 * pull the whole 48h buffer into the DOM; scrolling up still reveals it.
 */
export function liveSlice(messages: ChatMessage[], liveRows: number, readMarker?: string): ChatMessage[] {
  let keep = liveRows;
  if (readMarker) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].id === readMarker) {
        keep = Math.min(MAX_LIVE_WINDOW, Math.max(keep, messages.length - i + 3));
        break;
      }
    }
  }
  return messages.length > keep ? messages.slice(-keep) : messages;
}

/**
 * How many live rows arrived after the user paused.
 * If the paused tail was replaced (a pending send swapped for Twitch's echo),
 * count rows whose ids were not in the snapshot instead of the whole buffer.
 */
export function countNewer(snapshot: ChatMessage[], live: ChatMessage[]): number {
  const lastId = snapshot[snapshot.length - 1]?.id;
  if (!lastId) return live.length;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].id === lastId) return live.length - 1 - i;
  const seen = new Set(snapshot.map((message) => message.id));
  let newer = 0;
  for (const message of live) if (!seen.has(message.id)) newer++;
  return newer;
}

/** Rows of a paused snapshot in `[start, end)`. Same array when that is the whole snapshot. */
export function pausedSlice(messages: ChatMessage[], start: number, end: number): ChatMessage[] {
  const stop = Math.max(0, Math.min(messages.length, end));
  const from = Math.max(0, Math.min(stop, start));
  return from === 0 && stop === messages.length ? messages : messages.slice(from, stop);
}
