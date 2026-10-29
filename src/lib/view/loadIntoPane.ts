import { chat } from "@/lib/chat/controller";
import { useChat } from "@/store/chat";
import type { PaneTarget } from "@/store/ui";

/**
 * The channel picker's choice: puts `login` into that pane. A channel that isn't in the app yet (a Twitch follow, or a
 * typed name) is added first with the same `addChannel` the old add box used; it doesn't also take a free pane.
 */
export function loadIntoPane(pane: PaneTarget, login: string): { ok: boolean; error?: string } {
  if (!useChat.getState().settings.channels.includes(login)) {
    const added = chat.addChannel(login, { toGrid: false });
    if (!added.ok) return { ok: false, error: added.error ?? `Couldn't open #${login}` };
  }
  if (pane === "single") chat.focus(login);
  else chat.setPaneChannel(pane, login);
  return { ok: true };
}
