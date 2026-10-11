import { useEffect, useState } from "react";
import { AlertTriangle, Link2, RotateCw, Smile, UserRoundX } from "lucide-react";
import { ChatLog } from "@/components/chat/ChatLog";
import { GeckoMascot } from "@/components/gecko/GeckoMascot";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { emoteRegistry } from "@/lib/emotes/registry";
import { PROVIDER_LABELS, THIRD_PARTY_PROVIDERS, type ProviderStatus } from "@/lib/emotes/types";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { insertIntoComposer } from "@/store/ui";
import { AddChannelForm } from "./Sidebar";

const mention = (login: string) => insertIntoComposer(`@${login} `);

export function EmptyState() {
  return (
    <div className="gecko-scales-soft flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <GeckoMascot anim="idle" className="mx-auto size-28 drop-shadow-[0_0_28px_rgb(var(--glow-rgb)/0.4)]" />
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight">Nothing on the wall yet</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Add a Twitch channel and this gecko will stick to its chat. Add a few more to read them together in one
            merged feed, or one at a time with unread counts on the rest.
          </p>
        </div>
        <div className="mx-auto max-w-sm text-left">
          <AddChannelForm autoFocus />
        </div>
        <ul className="mx-auto grid max-w-sm gap-2 text-left text-xs text-muted-foreground">
          <li className="flex items-center gap-2">
            <Link2 className="size-3.5 text-primary" /> Paste a twitch.tv link, #channel, or just the name.
          </li>
          <li className="flex items-center gap-2">
            <Smile className="size-3.5 text-primary" /> Twitch, 7TV, BetterTTV and FrankerFaceZ emotes load automatically.
          </li>
          <li className="flex items-center gap-2">
            <UserRoundX className="size-3.5 text-primary" /> No login needed to read. Log in only to chat.
          </li>
        </ul>
      </div>
    </div>
  );
}

function statusText(status: ProviderStatus): string {
  switch (status.state) {
    case "ok":
      return `${status.count} emote${status.count === 1 ? "" : "s"}`;
    case "none":
      return "none for this channel";
    case "loading":
      return "loading…";
    case "error":
      return `unavailable (${status.error})`;
    default:
      return "waiting";
  }
}

export function EmoteStatusChip({ channel }: { channel: string }) {
  const version = useChat((s) => `${s.emoteVersions[channel] ?? 0}.${s.globalEmoteVersion}`);
  const [, force] = useState(0);
  useEffect(() => force((n) => n + 1), [version]);
  const channelStatus = emoteRegistry.getChannelStatus(channel);
  const globalStatus = emoteRegistry.getGlobalStatus();
  const failing = THIRD_PARTY_PROVIDERS.some(
    (p) => channelStatus?.[p].state === "error" || globalStatus[p].state === "error",
  );
  const total = THIRD_PARTY_PROVIDERS.reduce((sum, p) => {
    const c = channelStatus?.[p];
    return sum + (c?.state === "ok" ? c.count : 0);
  }, 0);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className={cn("gap-1 font-normal text-muted-foreground", failing && "text-mention")}
            aria-label="Emote providers"
          />
        }
      >
        {failing ? <AlertTriangle className="size-3" /> : <Smile className="size-3" />}
        <span className="hidden lg:inline">{total} channel emotes</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 text-xs">
        <div className="mb-2 font-semibold">Emotes in #{channel}</div>
        <table className="w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="pb-1 font-medium">Provider</th>
              <th className="pb-1 font-medium">Channel</th>
              <th className="pb-1 font-medium">Global</th>
            </tr>
          </thead>
          <tbody>
            {THIRD_PARTY_PROVIDERS.map((p) => (
              <tr key={p}>
                <td className="py-0.5 pr-2 font-medium">{PROVIDER_LABELS[p]}</td>
                <td className={cn("py-0.5 pr-2", channelStatus?.[p].state === "error" && "text-mention")}>
                  {channelStatus ? statusText(channelStatus[p]) : "waiting"}
                </td>
                <td className={cn("py-0.5", globalStatus[p].state === "error" && "text-mention")}>
                  {statusText(globalStatus[p])}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-muted-foreground">Twitch emotes always come straight from chat messages.</p>
        <Button size="xs" variant="outline" className="mt-2 gap-1" onClick={() => chat.reloadEmotes(channel)}>
          <RotateCw className="size-3" /> Reload emotes
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function FocusedView({ login }: { login: string }) {
  const view = useChat((s) => s.channels[login]);
  if (!view) return null;

  let empty: React.ReactNode;
  if (view.status === "error") {
    empty = (
      <div className="max-w-sm space-y-3 text-center">
        <GeckoMascot className="mx-auto size-16 opacity-60 grayscale" />
        <p className="font-semibold">Couldn't stick to #{login}</p>
        <p className="text-sm text-muted-foreground">{view.error}</p>
        <Button variant="outline" size="sm" onClick={() => chat.removeChannel(login)}>
          Remove #{login}
        </Button>
      </div>
    );
  } else if (view.status === "joining") {
    empty = (
      <div className="space-y-3 text-center">
        <GeckoMascot anim="scurry" className="mx-auto size-16" />
        <p className="text-sm text-muted-foreground">Climbing into #{login}…</p>
      </div>
    );
  } else {
    empty = (
      <div className="space-y-3 text-center">
        <GeckoMascot anim="idle" className="mx-auto size-16" />
        <p className="text-sm text-muted-foreground">
          Connected to #{login}. It's quiet in here; new messages show up the moment someone chirps.
        </p>
      </div>
    );
  }

  return (
    <ChatLog
      messages={view.messages}
      viewKey={`focused:${login}`}
      showChannel={false}
      empty={empty}
      readMarker={view.readMarker}
      onNameClick={mention}
    />
  );
}

export function MergedView() {
  const merged = useChat((s) => s.merged);
  return (
    <ChatLog
      messages={merged}
      viewKey="merged"
      showChannel
      onChannelClick={(channel) => chat.setSendTarget(channel)}
      onNameClick={mention}
      empty={
        <div className="space-y-3 text-center">
          <GeckoMascot anim="scurry" className="mx-auto size-16" />
          <p className="text-sm text-muted-foreground">Listening to all your channels. Messages land here as they arrive.</p>
        </div>
      }
    />
  );
}
