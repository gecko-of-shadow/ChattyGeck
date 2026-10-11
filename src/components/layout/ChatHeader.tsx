import { useEffect, useState } from "react";
import { LayoutGrid, Menu, PanelTop, RotateCw, Settings, WifiOff } from "lucide-react";
import { GeckoTailIcon } from "@/components/mascots/icons";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/chat/controller";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import type { ViewMode } from "@/store/settings";
import { useUi } from "@/store/ui";
import { ChannelAvatar } from "./Sidebar";
import { EmoteStatusChip } from "./Views";

function useCountdown(targetMs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (targetMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [targetMs]);
  return targetMs === null ? 0 : Math.max(0, Math.ceil((targetMs - now) / 1000));
}

function ConnectionPill() {
  const read = useChat((s) => s.read);
  const auth = useChat((s) => s.auth);
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);

  let label: string;
  let tone: "ok" | "wait" | "bad";
  switch (read.status) {
    case "connected":
      label = auth.status === "logged_in" ? `Live · ${auth.login}` : "Live · anonymous";
      tone = "ok";
      break;
    case "reconnecting":
      label = seconds > 0 ? `Reconnecting in ${seconds}s` : "Reconnecting…";
      tone = "wait";
      break;
    case "auth_failed":
      label = "Login rejected";
      tone = "bad";
      break;
    case "closed":
      label = "Offline";
      tone = "bad";
      break;
    default:
      label = "Connecting…";
      tone = "wait";
  }

  return (
    <div
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium whitespace-nowrap",
        tone === "ok" && "border-primary/25 bg-primary/10 text-primary",
        tone === "wait" && "border-[rgb(var(--mention-rgb)/0.3)] bg-[rgb(var(--mention-rgb)/0.1)] text-mention",
        tone === "bad" && "border-destructive/30 bg-destructive/10 text-destructive",
      )}
      role="status"
      title={read.detail.reason}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current",
          tone === "ok" && "shadow-[0_0_6px_currentColor]",
          tone === "wait" && "animate-pulse",
        )}
      />
      {label}
    </div>
  );
}

function ModeToggle() {
  const mode = useChat((s) => s.settings.mode);
  const options: { value: ViewMode; label: string; icon: typeof LayoutGrid; hint: string }[] = [
    { value: "grid", label: "Grid", icon: LayoutGrid, hint: "Every chat in its own box" },
    { value: "focused", label: "Focused", icon: PanelTop, hint: "One chat at a time" },
  ];
  return (
    <div role="radiogroup" aria-label="Reading mode" className="flex rounded-lg border bg-muted/60 p-0.5">
      {options.map(({ value, label, icon: Icon, hint }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          title={hint}
          onClick={() => chat.setMode(value)}
          className={cn(
            "flex h-6.5 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
            mode === value ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

export function ChatHeader() {
  const mode = useChat((s) => s.settings.mode);
  const focused = useChat((s) => s.settings.focused);
  const count = useChat((s) => s.settings.channels.length);
  const view = useChat((s) => (focused ? s.channels[focused] : undefined));
  const unreadElsewhere = useChat((s) =>
    Object.values(s.channels).reduce((sum, c) => sum + (c.login === s.settings.focused ? 0 : c.mentions), 0),
  );

  return (
    <header className="zoo-texture-soft flex h-12 shrink-0 items-center gap-2 border-b border-border/80 bg-card/40 px-2.5 sm:px-3">
      <Button
        variant="ghost"
        size="icon-sm"
        className="relative md:hidden"
        onClick={() => useUi.setState({ navOpen: true })}
        aria-label="Open channel list"
      >
        <Menu className="size-4.5" />
        {unreadElsewhere > 0 ? <span className="absolute top-0.5 right-0.5 size-2 rounded-full bg-mention" /> : null}
      </Button>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {mode === "grid" || !view ? (
          <>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
              <LayoutGrid className="size-3.5" />
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">All chats</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {count === 0 ? "No channels yet" : `${count} chat${count === 1 ? "" : "s"}, each in its own box`}
              </div>
            </div>
          </>
        ) : (
          <>
            <ChannelAvatar login={view.login} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">#{view.displayName ?? view.login}</div>
              <div className="truncate text-[11px] text-muted-foreground">
                {view.status === "joined" ? "Connected" : view.status === "joining" ? "Joining…" : "Couldn't join"}
              </div>
            </div>
            <EmoteStatusChip channel={view.login} />
          </>
        )}
      </div>

      <div className="hidden sm:block">
        <ConnectionPill />
      </div>
      <ModeToggle />
      <Button
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        onClick={() => useUi.setState({ settingsOpen: true })}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="size-4" />
      </Button>
    </header>
  );
}

export function ConnectionBanner() {
  const read = useChat((s) => s.read);
  const theme = useChat((s) => THEMES[s.settings.skin]);
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);
  if (read.status !== "reconnecting" && read.status !== "auth_failed") return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgb(var(--mention-rgb)/0.25)] bg-[rgb(var(--mention-rgb)/0.08)] px-3 py-2 text-xs"
    >
      {theme.animal === "gecko" ? (
        <GeckoTailIcon className="size-4 shrink-0 text-mention" />
      ) : (
        <WifiOff className="size-4 shrink-0 text-mention" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-mention">
          {read.status === "auth_failed" ? "Twitch rejected the login." : theme.dropped}
        </span>{" "}
        <span className="text-muted-foreground">
          {read.status === "auth_failed"
            ? "Trying to refresh it…"
            : `${read.detail.reason ?? "Network error"}. Regrowing it${seconds > 0 ? ` in ${seconds}s` : " now"} (attempt ${read.detail.attempt ?? 1}).`}
        </span>
      </div>
      {read.status === "reconnecting" ? (
        <Button size="xs" variant="outline" onClick={() => chat.retryNow()} className="gap-1">
          <RotateCw className="size-3" /> Retry now
        </Button>
      ) : null}
    </div>
  );
}
