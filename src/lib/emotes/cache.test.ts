import { describe, expect, it } from "vitest";
import { EmoteCache, FRESH_FOR } from "./cache";
import type { Emote } from "./types";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    keys: () => [...map.keys()],
  };
}

const emote = (name: string): Emote => ({ id: name, name, provider: "bttv", scope: "global", url1x: "x", zeroWidth: false });

describe("EmoteCache", () => {
  it("remembers a list and says when it is stale", () => {
    let now = 1_000_000;
    const cache = new EmoteCache(memoryStorage(), () => now);
    cache.put("bttv:global", "global", [emote("a")]);
    expect(cache.get("bttv:global")).toEqual({ emotes: [emote("a")], stale: false });
    now += FRESH_FOR.global + 1;
    expect(cache.get("bttv:global")?.stale).toBe(true);
    expect(cache.get("missing")).toBeNull();
  });

  it("drops the least recently used lists past the limit", () => {
    let now = 0;
    const store = memoryStorage();
    const cache = new EmoteCache(store, () => ++now);
    for (let i = 0; i < 65; i++) cache.put(`7tv:channel:${i}`, "channel", []);
    expect(cache.size).toBe(60);
    expect(cache.get("7tv:channel:0")).toBeNull();
    expect(cache.get("7tv:channel:64")).not.toBeNull();
  });

  it("clears everything it wrote", () => {
    const store = memoryStorage();
    const cache = new EmoteCache(store, () => 1);
    cache.put("ffz:global", "global", []);
    cache.clear();
    expect(store.keys()).toEqual([]);
  });

  it("does nothing without storage", () => {
    const cache = new EmoteCache(null);
    cache.put("x", "global", []);
    expect(cache.get("x")).toBeNull();
    expect(cache.available).toBe(false);
  });
});
