import { useEffect, useRef, useState } from "react";
import { CircleAlert, Clock, Lock, SendHorizontal, Smile, Users } from "lucide-react";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chat } from "@/lib/chat/controller";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

function RoomChips({ channel }: { channel: string }) {
  const room = useChat((s) => s.channels[channel]?.roomState);
  if (!room) return null;
  const chips: { icon: typeof Clock; label: string }[] = [];
  if (room.emoteOnly) chips.push({ icon: Smile, label: "Emote-only" });
  if (room.subsOnly) chips.push({ icon: Lock, label: "Subscribers only" });
  if (room.followersOnly !== undefined && room.followersOnly >= 0) {
    chips.push({ icon: Users, label: room.followersOnly === 0 ? "Followers only" : `Followers (${room.followersOnly}m+)` });
  }
  if (room.slow) chips.push({ icon: Clock, label: `Slow mode ${room.slow}s` });
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {chips.map(({ icon: Icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Icon className="size-3" />
          {label}
        </span>
      ))}
    </div>
  );
}

/** Shown instead of message boxes while reading anonymously. */
export function LoginPrompt() {
  const booting = useChat((s) => s.auth.status === "booting");
  return (
    <div className="border-t border-border/80 bg-card/70 px-3 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
        <Mascot className="size-7 shrink-0" />
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          You're reading anonymously. Log in with Twitch to chat back.
        </p>
        <Button size="sm" onClick={() => useUi.setState({ loginOpen: true })} disabled={booting}>
          Log in with Twitch
        </Button>
      </div>
    </div>
  );
}

/** Message input for one channel. `compact` is the slim version used inside grid boxes. */
export function Composer({ channel, compact = false }: { channel: string | null; compact?: boolean }) {
  const auth = useChat((s) => s.auth);
  const writeStatus = useChat((s) => s.write?.status);
  const theme = useChat((s) => THEMES[s.settings.skin]);
  const insert = useUi((s) => s.insert);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!insert || insert.channel !== channel) return;
    setText((current) => {
      const spacer = current && !current.endsWith(" ") ? " " : "";
      return `${current}${spacer}${insert.text}`;
    });
    inputRef.current?.focus();
  }, [insert, channel]);

  useEffect(() => {
    setError(null);
  }, [channel]);

  if (!channel) return null;
  if (auth.status !== "logged_in") return compact ? null : <LoginPrompt />;

  const connected = writeStatus === "connected";
  const length = Array.from(text).length;

  const submit = () => {
    if (!text.trim()) return;
    const result = chat.send(channel, text);
    if (result.ok) {
      history.current = [text, ...history.current.filter((h) => h !== text)].slice(0, 50);
      historyIndex.current = -1;
      setText("");
      setError(null);
    } else if (result.error) {
      setError(result.error);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === "ArrowUp" && (text === "" || historyIndex.current >= 0)) {
      const next = Math.min(historyIndex.current + 1, history.current.length - 1);
      if (next >= 0 && history.current[next] !== undefined) {
        event.preventDefault();
        historyIndex.current = next;
        setText(history.current[next]);
      }
    } else if (event.key === "ArrowDown" && historyIndex.current >= 0) {
      event.preventDefault();
      historyIndex.current -= 1;
      setText(historyIndex.current >= 0 ? history.current[historyIndex.current] : "");
    } else if (event.key === "Escape") {
      setError(null);
    }
  };

  return (
    <div className={cn("border-t border-border/80 bg-card/70 backdrop-blur", compact ? "px-2 py-1.5" : "px-3 pt-2.5 pb-3")}>
      {error ? (
        <div role="alert" className={cn("flex items-start gap-1.5 text-destructive", compact ? "mb-1 text-[11px]" : "mb-2 text-xs")}>
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}
      <form
        className="flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            ref={inputRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              historyIndex.current = -1;
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={`${theme.sendVerb} to #${channel} as ${auth.login}…`}
            aria-label={`Message #${channel}`}
            className={cn("pr-12", compact ? "h-8 text-[13px]" : "h-9 text-sm")}
            autoComplete="off"
            spellCheck
          />
          {length > 400 ? (
            <span
              className={`absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-[11px] ${length > 500 ? "text-destructive" : "text-muted-foreground"}`}
            >
              {500 - length}
            </span>
          ) : null}
        </div>
        <Button
          type="submit"
          size={compact ? "icon-sm" : "default"}
          className={cn(!compact && "h-9 gap-1.5 px-3.5")}
          disabled={!text.trim() || !connected}
          aria-label={theme.sendVerb}
          title={theme.sendVerb}
        >
          {compact ? null : <span className="hidden sm:inline">{theme.sendVerb}</span>}
          <SendHorizontal className="size-4" />
        </Button>
      </form>
      {compact ? null : <RoomChips channel={channel} />}
      {!compact && !connected ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Connecting your account to Twitch chat…</p>
      ) : null}
    </div>
  );
}
