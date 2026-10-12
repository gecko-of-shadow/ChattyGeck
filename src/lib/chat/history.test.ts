import { describe, expect, it } from "vitest";
import {
  HISTORY_TTL_MS,
  historyBoundary,
  isHistoryBoundary,
  messagesForDisk,
  sanitizeHistory,
} from "./history";
import type { ChatMessage } from "@/lib/twitch/types";

const base = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: "m1",
  channel: "geckotown",
  kind: "chat",
  ts: Date.now(),
  badges: [],
  text: "hi",
  twitchEmotes: [],
  ...over,
});

describe("chat history (48h)", () => {
  it("keeps real chat rows and drops pending / boundary rows", () => {
    const now = 1_700_000_000_000;
    const disk = messagesForDisk(
      [
        base({ id: "a", text: "one", ts: now - 1_000 }),
        historyBoundary("geckotown"),
        base({ id: "b", text: "two", ts: now - 500, pending: "sending" }),
        base({ id: "c", text: "three", ts: now }),
      ],
      now,
    );
    expect(disk.map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("drops messages older than 48 hours", () => {
    const now = 1_700_000_000_000;
    const disk = messagesForDisk(
      [
        base({ id: "old", ts: now - HISTORY_TTL_MS - 1 }),
        base({ id: "fresh", ts: now - 60_000 }),
      ],
      now,
    );
    expect(disk.map((m) => m.id)).toEqual(["fresh"]);
  });

  it("sanitizes junk from disk", () => {
    const now = 1_700_000_000_000;
    const cleaned = sanitizeHistory(
      [
        { id: "ok", channel: "x", kind: "chat", ts: now, text: "yep", badges: [], twitchEmotes: [] },
        { id: "nope" },
        historyBoundary("x"),
        null,
      ],
      now,
    );
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].text).toBe("yep");
    expect(cleaned.every((m) => !isHistoryBoundary(m))).toBe(true);
  });
});
