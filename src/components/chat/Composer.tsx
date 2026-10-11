import { useEffect, useRef, useState } from "react";
import { CircleAlert, Clock, Lock, SendHorizontal, Smile, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GeckoMascot } from "@/components/gecko/GeckoMascot";
import { chat } from "@/lib/chat/controller";
import { channelColor } from "@/lib/colors";
import { composerTarget, useChat } from "@/store/chat";
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

export function Composer() {
  const target = useChat(composerTarget);
  const mode = useChat((s) => s.settings.mode);
  const channels = useChat((s) => s.settings.channels);
  const auth = useChat((s) => s.auth);
  const writeStatus = useChat((s) => s.write?.status);
  const insert = useUi((s) => s.insert);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!insert) return;
    setText((current) => {
      const spacer = current && !current.endsWith(" ") ? " " : "";
      return `${current}${spacer}${insert.text}`;
    });
    inputRef.current?.focus();
  }, [insert]);

  useEffect(() => {
    setError(null);
  }, [target]);

  if (!channels.length) return null;

  const loggedIn = auth.status === "logged_in";
  const connected = writeStatus === "connected";
  const length = Array.from(text).length;

  const submit = () => {
    if (!target || !text.trim()) return;
    const result = chat.send(target, text);
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
    <div className="border-t border-border/80 bg-card/70 px-3 pt-2.5 pb-3 backdrop-blur">
      {error ? (
        <div role="alert" className="mb-2 flex items-start gap-1.5 text-xs text-destructive">
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}

      {!loggedIn ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
          <GeckoMascot className="size-7 shrink-0" />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            You're reading anonymously. Log in with Twitch to chirp back.
          </p>
          <Button size="sm" onClick={() => useUi.setState({ loginOpen: true })} disabled={auth.status === "booting"}>
            Log in with Twitch
          </Button>
        </div>
      ) : (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {mode === "merged" ? (
            <Select
              value={target}
              onValueChange={(value) => value && chat.setSendTarget(value as string)}
              items={channels.map((c) => ({ value: c, label: `#${c}` }))}
            >
              <SelectTrigger className="h-9 max-w-40 shrink-0 font-mono text-xs" aria-label="Send to channel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {channels.map((c) => (
                  <SelectItem key={c} value={c} className="font-mono text-xs">
                    <span className="size-2 rounded-full" style={{ backgroundColor: channelColor(c) }} />#{c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
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
              placeholder={target ? `Chirp to #${target} as ${auth.login}…` : "Pick a channel to chirp to"}
              aria-label={target ? `Message #${target}` : "Message"}
              className="h-9 pr-12 text-sm"
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
          <Button type="submit" className="h-9 gap-1.5 px-3.5" disabled={!text.trim() || !connected || !target}>
            <span className="hidden sm:inline">Chirp</span>
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      )}

      {target && loggedIn ? <RoomChips channel={target} /> : null}
      {loggedIn && !connected ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Connecting your account to Twitch chat…</p>
      ) : null}
    </div>
  );
}
