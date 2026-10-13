import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
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
import { isFeatureOn } from "@/store/settings";
import { ackSendChannel, useUi } from "@/store/ui";
import { EmotePicker } from "./EmotePicker";
import { useEmoteIndex } from "./useEmoteIndex";

function srcSet(urls: { url1x: string; url2x?: string; url4x?: string }): string | undefined {
  const parts = [`${urls.url1x} 1x`];
  if (urls.url2x) parts.push(`${urls.url2x} 2x`);
  if (urls.url4x) parts.push(`${urls.url4x} 4x`);
  return parts.length > 1 ? parts.join(", ") : undefined;
}

function CompletionEmoteThumb({ emote, still }: { emote: Emote; still: boolean }) {
  const [failed, setFailed] = useState(false);
  const urls = emoteUrls(emote, still);
  if (failed) {
    return <span className="text-[10px] font-medium text-muted-foreground">?</span>;
  }
  return (
    <img
      src={urls.url1x}
      srcSet={srcSet(urls)}
      alt=""
      loading="eager"
      decoding="async"
      draggable={false}
      className="max-h-7 max-w-9 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

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

function CompletionBar({
  id,
  completion,
  onChoose,
  compact,
  anchorRef,
}: {
  id: string;
  completion: Completion;
  onChoose: (index: number) => void;
  compact: boolean;
  /** Position the list above this input (portaled so grid overflow can't clip it). */
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const still = useChat((s) => s.settings.emoteAnimation === "never");
  const activeRef = useRef<HTMLButtonElement>(null);
  const [box, setBox] = useState<{ left: number; width: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const place = () => {
      const rect = el.getBoundingClientRect();
      setBox({
        left: rect.left,
        width: rect.width,
        bottom: Math.max(8, window.innerHeight - rect.top + 6),
      });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef, completion.matches.length, completion.index]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [completion.index]);

  if (!box || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      data-testid="tab-complete"
      role="listbox"
      aria-label="Emote suggestions"
      className="zoo-scroll fixed z-50 flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur"
      style={{ left: box.left, width: box.width, bottom: box.bottom }}
    >
      {completion.matches.map((emote, i) => {
        const active = i === completion.index;
        return (
          <button
            key={emoteKey(emote)}
            id={`${id}-${i}`}
            ref={active ? activeRef : undefined}
            type="button"
            role="option"
            aria-selected={active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChoose(i)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left",
              compact ? "text-[11px]" : "text-xs",
              active ? "bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center">
              <CompletionEmoteThumb emote={emote} still={still} />
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{emote.name}</span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Message input for one channel. `compact` is the slim version used inside grid boxes. */
export function Composer({ channel, compact = false }: { channel: string | null; compact?: boolean }) {
  const auth = useChat((s) => s.auth);
  const writeStatus = useChat((s) => s.write?.status);
  const theme = useChat((s) => THEMES[s.settings.skin]);
  const tabComplete = useChat((s) => isFeatureOn(s.settings, channel, "tabComplete"));
  const emotePicker = useChat((s) => isFeatureOn(s.settings, channel, "emotePicker"));
  const insert = useUi((s) => s.insert);
  const sendAckChannel = useUi((s) => s.sendAckChannel);
  const { emotes, index } = useEmoteIndex(channel);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const prevChannel = useRef(channel);
  const listId = useId();

  useEffect(() => {
    if (!insert || insert.channel !== channel) return;
    setText((current) => {
      const spacer = current && !current.endsWith(" ") ? " " : "";
      return `${current}${spacer}${insert.text}`;
    });
    inputRef.current?.focus();
  }, [insert, channel]);

  useEffect(() => {
    if (prevChannel.current !== channel) {
      prevChannel.current = channel;
      // Focused view: switching the single composer to another channel clears ack.
      if (useUi.getState().sendAckChannel !== channel) {
        useUi.setState({ sendAckChannel: null });
      }
    }
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
  /** Shared ack — grid panes lock when another pane (or focused channel) was confirmed. */
  const locked = sendAckChannel !== channel;
  const length = Array.from(text).length;

  const submit = () => {
    if (locked || !text.trim()) return;
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
    const next = `${text.slice(0, base.start)}${inserted}${after}`;
    const end = base.start + inserted.length;
    if (next === text) {
      // Same name again (one match, or re-picking the active one): no render, so place the caret now.
      inputRef.current?.setSelectionRange(end, end);
    } else {
      setText(next);
      pendingCaret.current = end;
    }
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
    if (completion) {
      const count = completion.matches.length;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") {
        event.preventDefault();
        applyMatch(completion, (completion.index + 1) % count);
        return;
      }
      if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
        event.preventDefault();
        applyMatch(completion, (completion.index + count - 1) % count);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCompletion(null);
        return;
      }
      // Typing / Enter / etc. closes the list; Shift alone does not.
      if (event.key !== "Shift") setCompletion(null);
    }
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
      {locked ? (
        <div
          className={cn("flex flex-col gap-1.5", compact ? "gap-1" : "")}
          data-testid="channel-switch-ack"
        >
          <p className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
            You switched channels. Confirm before sending.
          </p>
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            className={cn("w-full", compact ? "h-8 text-[13px]" : "h-9")}
            data-testid="channel-switch-unlock"
            onClick={() => {
              ackSendChannel(channel);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            Send to #{channel}
          </Button>
        </div>
      ) : (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="relative min-w-0 flex-1">
            {completion && completion.matches.length > 0 ? (
              <CompletionBar
                id={listId}
                completion={completion}
                compact={compact}
                anchorRef={inputRef}
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
              aria-autocomplete={tabComplete ? "list" : undefined}
              aria-controls={completion ? listId : undefined}
              aria-expanded={tabComplete ? !!completion : undefined}
              aria-activedescendant={completion ? `${listId}-${completion.index}` : undefined}
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
          {emotePicker ? (
            <EmotePicker channel={channel} emotes={emotes} index={index} onPick={insertEmote} returnFocus={inputRef} compact={compact} />
          ) : null}
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
      )}
      {compact ? null : <RoomChips channel={channel} />}
      {!compact && !connected && !locked ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Connecting your account to Twitch chat…</p>
      ) : null}
    </div>
  );
}
