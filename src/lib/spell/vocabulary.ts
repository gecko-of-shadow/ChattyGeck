import type { ActiveUser } from "@/lib/chat/activeUsers";
import { emoteRegistry } from "@/lib/emotes/registry";

let emoteKey = "";
let emoteNames: ReadonlySet<string> = new Set();

/** Lowercase names of every emote loaded for any joined channel, global sets included. Rebuilt only when emotes change. */
export function loadedEmoteNames(channels: readonly string[]): ReadonlySet<string> {
  const key = `${emoteRegistry.version}|${channels.join(",")}`;
  if (key === emoteKey) return emoteNames;
  const names = new Set<string>();
  for (const channel of channels) for (const name of emoteRegistry.lookup(channel).keys()) names.add(name.toLowerCase());
  emoteKey = key;
  emoteNames = names;
  return names;
}

/** Lowercase logins and display names of the recent chatters in every joined channel. */
export function chatterNames(lists: Iterable<readonly ActiveUser[]>): Set<string> {
  const names = new Set<string>();
  for (const list of lists) {
    for (const user of list) {
      names.add(user.login.toLowerCase());
      names.add(user.displayName.toLowerCase());
    }
  }
  return names;
}

/** Lowercase logins and display names of the joined channels themselves. */
export function channelNames(views: Iterable<{ login: string; displayName?: string }>): Set<string> {
  const names = new Set<string>();
  for (const view of views) {
    names.add(view.login.toLowerCase());
    if (view.displayName) names.add(view.displayName.toLowerCase());
  }
  return names;
}
