import { useEffect, useState } from "react";
import { RotateCw, WifiOff } from "lucide-react";
import { GeckoTailIcon } from "@/components/mascots/icons";
import { Button } from "@/components/ui/button";
import { chat } from "@/lib/chat/controller";
import { useTheme } from "@/lib/useTheme";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";

function useCountdown(targetMs: number | null): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (targetMs === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [targetMs]);
  return targetMs === null ? 0 : Math.max(0, Math.ceil((targetMs - now) / 1000));
}

/**
 * Connection status as a small dot next to the Settings gear, bottom right (not a button). The shape changes too, so it doesn't rely on
 * colour alone: a solid dot when live, an open ring while connecting, a closed ring when offline or the login is
 * rejected. The words are in the tooltip and for screen readers; the banner above the bottom bar has Retry now.
 */
export function ConnectionDot() {
  const read = useChat((s) => s.read);
  const auth = useChat((s) => s.auth);
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);

  let label: string;
  let tone: "ok" | "wait" | "bad";
  switch (read.status) {
    case "connected":
      // "Connected", not "Live": the green dots on avatars already mean "streaming now".
      label = auth.status === "logged_in" ? `Connected · ${auth.login}` : "Connected · anonymous";
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
    <span
      role="status"
      title={read.detail.reason ? `${label} · ${read.detail.reason}` : label}
      data-testid="connection-status"
      data-tone={tone}
      // The same 32 px square as the gear beside it (easy to hover); no border or background, so it isn't a button.
      className="grid size-8 shrink-0 cursor-default place-items-center"
    >
      <span
        aria-hidden
        className={cn(
          "size-2.5 rounded-full",
          tone === "ok" && "zc-live-dot bg-live",
          // An open ring (it spins unless reduced motion is on): a different shape from both other states.
          tone === "wait" && "zc-status-ring border-2 border-warn border-r-transparent motion-safe:animate-spin",
          tone === "bad" && "zc-status-ring border-2 border-danger-text",
        )}
      />
      {/* No seconds here: a ticking countdown would be read out again every second. */}
      <span className="sr-only">{tone === "wait" && read.status === "reconnecting" ? "Reconnecting" : label}</span>
    </span>
  );
}

export function ConnectionBanner() {
  const read = useChat((s) => s.read);
  const theme = useTheme();
  const retryAt = read.status === "reconnecting" && read.detail.retryInMs ? read.since + read.detail.retryInMs : null;
  const seconds = useCountdown(retryAt);
  if (read.status !== "reconnecting" && read.status !== "auth_failed") return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn bg-warn/10 px-3 py-2 text-xs"
    >
      {theme.kind === "animal" && theme.animal === "gecko" ? (
        <GeckoTailIcon className="size-4 shrink-0 text-warn" />
      ) : (
        <WifiOff className="size-4 shrink-0 text-warn" />
      )}
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-foreground">
          {read.status === "auth_failed" ? "Twitch rejected the login." : theme.dropped}
        </span>{" "}
        <span className="text-muted-foreground">
          {read.status === "auth_failed"
            ? "Trying to refresh it…"
            : `${read.detail.reason ?? "Network error"}. Reconnecting${seconds > 0 ? ` in ${seconds}s` : " now"} (attempt ${read.detail.attempt ?? 1}).`}
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
