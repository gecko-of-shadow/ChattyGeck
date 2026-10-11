import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircleAlert, Clock, Lock, SendHorizontal, Smile, Users } from "lucide-react";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chat } from "@/lib/chat/controller";
import { findEmotes, wordAt } from "@/lib/emotes/search";
import { emoteKey, emoteUrls, type Emote } from "@/lib/emotes/types";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";
import { EmotePicker } from "./EmotePicker";
import { useEmoteIndex } from "./useEmoteIndex";

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

/** A Tab-completion in progress: which word is being finished and which match is in the box right now. */
interface Completion {
  matches: Emote[];
  index: number;
  /** Where the typed word started. */
  start: number;
  /** Where the inserted name (plus its trailing space) ends. */
  end: number;
}

const MIN_TYPED = 2;

function CompletionBar({ completion, onChoose, compact }: { completion: Completion; onChoose: (index: number) => void; compact: boolean }) {
  const still = useChat((s) => s.settings.emoteAnimation === "never");
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [completion.index]);
  return (
    <div
      data-testid="tab-complete"
      role="listbox"
      aria-label="Emote suggestions"
      className="zoo-scroll absolute right-0 bottom-full left-0 z-20 mb-1.5 flex gap-0.5 overflow-x-auto rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur"
    >
      {completion.matches.map((emote, i) => {
        const active = i === completion.index;
        const urls = emoteUrls(emote, still);
        return (
          <button
            key={emoteKey(emote)}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(i)}
            className={cn(
              "flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 whitespace-nowrap",
              compact ? "text-[11px]" : "text-xs",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <img src={urls.url1x} alt="" className="max-h-6 max-w-7 object-contain" draggable={false} />
            {emote.name}
          </button>
        );
      })}
    </div>
  );
}

/** Message input for one channel. `compact` is the slim version used inside grid boxes. */
export function Composer({ channel, compact = false }: { channel: string | null; compact?: boolean }) {
  const auth = useChat((s) => s.auth);
  const writeStatus = useChat((s) => s.write?.status);
  const theme = useChat((s) => THEMES[s.settings.skin]);
  const tabComplete = useChat((s) => s.settings.tabComplete);
  const emotePicker = useChat((s) => s.settings.emotePicker);
  const insert = useUi((s) => s.insert);
  const { emotes, index } = useEmoteIndex(channel);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);

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
    setCompletion(null);
  }, [channel]);

  // Programmatic edits (Tab, picker) put the caret right after what they inserted.
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    const el = inputRef.current;
    if (caret === null || !el) return;
    pendingCaret.current = null;
    el.setSelectionRange(caret, caret);
  }, [text]);

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
      setCompletion(null);
    } else if (result.error) {
      setError(result.error);
    }
  };

  /** Replaces text[start..end] with the match's name and a space; returns the updated completion. */
  const applyMatch = (base: Completion, nextIndex: number) => {
    const name = base.matches[nextIndex].name;
    const after = text.slice(base.end);
    const spacer = after.startsWith(" ") ? "" : " ";
    const inserted = `${name}${spacer}`;
    setText(`${text.slice(0, base.start)}${inserted}${after}`);
    const end = base.start + inserted.length;
    pendingCaret.current = end;
    setCompletion({ ...base, index: nextIndex, end });
  };

  const startCompletion = (backwards: boolean): boolean => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const word = wordAt(text, caret);
    if (!word || word.word.length < MIN_TYPED) return false;
    const matches = findEmotes(index, word.word);
    if (!matches.length) return false;
    applyMatch({ matches, index: 0, start: word.start, end: word.end }, backwards ? matches.length - 1 : 0);
    return true;
  };

  const insertEmote = (emote: Emote) => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, caret);
    const after = text.slice(caret);
    const lead = before && !/\s$/.test(before) ? " " : "";
    const trail = after.startsWith(" ") ? "" : " ";
    const head = `${before}${lead}${emote.name}${trail}`;
    setText(`${head}${after}`);
    setCompletion(null);
    // The menu hands focus back to its button when it closes; take it back after that.
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(head.length, head.length);
    }, 0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab" && tabComplete && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (completion) {
        event.preventDefault();
        const count = completion.matches.length;
        applyMatch(completion, (completion.index + (event.shiftKey ? count - 1 : 1)) % count);
      } else if (startCompletion(event.shiftKey)) {
        event.preventDefault();
      }
      return;
    }
    if (completion && event.key !== "Shift") setCompletion(null);
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
          {completion && completion.matches.length > 1 ? (
            <CompletionBar
              completion={completion}
              compact={compact}
              onChoose={(i) => {
                applyMatch(completion, i);
                inputRef.current?.focus();
              }}
            />
          ) : null}
          <Input
            ref={inputRef}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              historyIndex.current = -1;
              setCompletion(null);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setCompletion(null)}
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
        {emotePicker ? <EmotePicker channel={channel} emotes={emotes} index={index} onPick={insertEmote} compact={compact} /> : null}
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
