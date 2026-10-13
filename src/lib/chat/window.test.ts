import { describe, expect, it } from "vitest";
import { liveSlice, MAX_LIVE_WINDOW, pausedSlice } from "./window";
import type { ChatMessage } from "@/lib/twitch/types";

const row = (id: string): ChatMessage => ({
  id,
  channel: "geckotown",
  kind: "chat",
  ts: 1,
  badges: [],
  text: id,
  twitchEmotes: [],
});

describe("live chat window", () => {
  it("keeps only the recent rows while following", () => {
    const messages = Array.from({ length: 50 }, (_, i) => row(String(i)));
    expect(liveSlice(messages, 10).map((m) => m.id)).toEqual(messages.slice(-10).map((m) => m.id));
  });

  it("includes a nearby read marker without mounting the whole buffer", () => {
    const messages = Array.from({ length: 1_000 }, (_, i) => row(String(i)));
    const visible = liveSlice(messages, 150, "800");
    expect(visible[0].id).toBe("797");
    expect(visible).toHaveLength(203);
    expect(visible.some((m) => m.id === "800")).toBe(true);
  });

  it("caps a far read marker so a raid cannot mount the history", () => {
    const messages = Array.from({ length: 5_000 }, (_, i) => row(String(i)));
    const visible = liveSlice(messages, 150, "0");
    expect(visible).toHaveLength(MAX_LIVE_WINDOW);
    expect(visible[0].id).toBe(String(5_000 - MAX_LIVE_WINDOW));
  });

  it("paints a paused window without copying the whole snapshot", () => {
    const messages = Array.from({ length: 1_000 }, (_, i) => row(String(i)));
    const visible = pausedSlice(messages, 700, 900);
    expect(visible.map((m) => m.id)).toEqual(messages.slice(700, 900).map((m) => m.id));
    expect(visible).toHaveLength(200);
    expect(pausedSlice(messages, 0, messages.length)).toBe(messages);
  });
});
