import type { ChatMessage } from "@/lib/twitch/types";

/** Never mount more than this many rows while following live chat. */
export const MAX_LIVE_WINDOW = 400;

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
