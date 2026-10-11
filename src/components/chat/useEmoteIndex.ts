import { useMemo } from "react";
import { emoteRegistry } from "@/lib/emotes/registry";
import { buildNameIndex, type NameIndex } from "@/lib/emotes/search";
import type { Emote } from "@/lib/emotes/types";
import { useChat } from "@/store/chat";

/** Every emote usable in `channel` plus a name index, rebuilt only when the emote lists or switches change. */
export function useEmoteIndex(channel: string | null): { emotes: Emote[]; index: NameIndex } {
  const channelVersion = useChat((s) => (channel ? (s.emoteVersions[channel] ?? 0) : 0));
  const globalVersion = useChat((s) => s.globalEmoteVersion);
  return useMemo(() => {
    const emotes = channel ? emoteRegistry.allEmotes(channel) : [];
    return { emotes, index: buildNameIndex(emotes) };
    // The version counters are what invalidates the registry's lists.
  }, [channel, channelVersion, globalVersion]);
}
