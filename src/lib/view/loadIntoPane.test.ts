import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "@/lib/chat/controller";
import { newChannelView, useChat } from "@/store/chat";
import { DEFAULT_SETTINGS } from "@/store/settings";
import { loadIntoPane } from "./loadIntoPane";

const internal = chat as unknown as { settingsUiOnly: boolean };

function seed(mode: "grid" | "focused", gridChannels: string[], channels: string[], focused: string | null = channels[0] ?? null): void {
  useChat.setState({
    settings: { ...DEFAULT_SETTINGS, channels, gridChannels, mode, focused },
    channels: Object.fromEntries(channels.map((name) => [name, { ...newChannelView(name), status: "joined" as const }])),
  });
}

describe("picking a channel loads it into that pane", () => {
  beforeEach(() => {
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    });
    vi.stubGlobal("document", { hasFocus: () => true, hidden: false });
    // Settings-only: adding a channel doesn't open a chat connection in a unit test.
    internal.settingsUiOnly = true;
  });

  afterEach(() => {
    internal.settingsUiOnly = false;
    vi.unstubAllGlobals();
  });

  it("a channel already in the app goes into the chosen grid pane, which becomes the focused pane", () => {
    seed("grid", ["a", "", "c"], ["a", "b", "c"]);
    expect(loadIntoPane(1, "b")).toEqual({ ok: true });
    expect(useChat.getState().settings).toMatchObject({ gridChannels: ["a", "b", "c"], focused: "b" });
  });

  it("a followed or typed channel is added first, then shown in that pane only", () => {
    seed("grid", ["a", "", ""], ["a"]);
    expect(loadIntoPane(2, "newone")).toEqual({ ok: true });
    const settings = useChat.getState().settings;
    expect(settings.channels).toEqual(["a", "newone"]);
    expect(settings.gridChannels).toEqual(["a", "", "newone"]);
  });

  it("view 1 shows the picked channel", () => {
    seed("focused", ["a"], ["a", "b"], null);
    loadIntoPane("single", "b");
    expect(useChat.getState().settings).toMatchObject({ mode: "focused", focused: "b" });
  });

  it("a name that isn't a channel is refused", () => {
    seed("grid", ["a"], ["a"]);
    expect(loadIntoPane(1, "not a channel!").ok).toBe(false);
    expect(useChat.getState().settings.channels).toEqual(["a"]);
  });
});
