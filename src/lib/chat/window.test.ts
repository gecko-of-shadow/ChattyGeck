import { describe, expect, it } from "vitest";
import { countNewer, isUserScrollUp, liveSlice, MAX_LIVE_WINDOW, pausedSlice } from "./window";
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

  it("counts lines after the paused tail, and does not treat an echo swap as the whole log", () => {
    const snapshot = [row("a"), row("send-1")];
    expect(countNewer(snapshot, [row("a"), row("send-1"), row("b")])).toBe(1);
    const echoed = [row("a"), row("twitch-1"), row("b")];
    expect(countNewer(snapshot, echoed)).toBe(2);
    expect(countNewer([], echoed)).toBe(echoed.length);
  });
});

describe("isUserScrollUp", () => {
  /** A pinned log: 2000 px of rows in a 600 px box, scrolled to the bottom. */
  const pinned = { scrollHeight: 2000, clientHeight: 600, scrollTop: 1400 };
  const distance = (box: typeof pinned) => box.scrollHeight - box.scrollTop - box.clientHeight;

  it("pauses when the person scrolls up with the wheel", () => {
    const up = { ...pinned, scrollTop: 1200 };
    expect(isUserScrollUp(pinned.scrollTop, up.scrollTop, distance(up), 50)).toBe(true);
  });

  it("does not pause when the box gets shorter right after a click (reply bar, smaller window)", () => {
    // The box loses 200 px; the browser keeps scrollTop, so the newest rows sit below the edge.
    const shorter = { ...pinned, clientHeight: 400 };
    expect(distance(shorter)).toBe(200);
    expect(isUserScrollUp(pinned.scrollTop, shorter.scrollTop, distance(shorter), 50)).toBe(false);
  });

  it("pauses on a slow drag that moves under a pixel per event once it adds up", () => {
    // Middle-click autoscroll or a slow touchpad: the last step was 0.5 px, the total is 41 px.
    const up = { ...pinned, scrollTop: pinned.scrollTop - 41 };
    expect(isUserScrollUp(pinned.scrollTop, up.scrollTop, distance(up), 50)).toBe(true);
  });

  it("does not pause when the box gets taller (reply bar closes) and the browser lowers scrollTop", () => {
    const taller = { ...pinned, clientHeight: 632, scrollTop: 1368 };
    expect(distance(taller)).toBe(0);
    expect(isUserScrollUp(pinned.scrollTop, taller.scrollTop, distance(taller), 50)).toBe(false);
  });

  it("does not pause for an upward move long after any input", () => {
    const up = { ...pinned, scrollTop: 1200 };
    expect(isUserScrollUp(pinned.scrollTop, up.scrollTop, distance(up), 5_000)).toBe(false);
  });

  it("does not pause near the bottom or when scrolling down", () => {
    const nearBottom = { ...pinned, scrollTop: 1380 };
    expect(isUserScrollUp(pinned.scrollTop, nearBottom.scrollTop, distance(nearBottom), 50)).toBe(false);
    const from = { ...pinned, scrollTop: 900 };
    const down = { ...pinned, scrollTop: 1000 };
    expect(isUserScrollUp(from.scrollTop, down.scrollTop, distance(down), 50)).toBe(false);
  });
});
