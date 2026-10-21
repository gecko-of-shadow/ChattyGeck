import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, Clock, CornerDownRight, Lock, SendHorizontal, Smile, Users, X } from "lucide-react";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { completionInsert, tabMatches, type TabMatch } from "@/lib/chat/activeUsers";
import { reduceComposerKey } from "@/lib/chat/composerKeys";
import { chat } from "@/lib/chat/controller";
import { findEmotes, wordAt } from "@/lib/emotes/search";
import { chatWords } from "@/lib/spell/chatWords";
import { loadSpellEngine, suggestFixes, type SpellLanguageId } from "@/lib/spell/engine";
import {
  findMisspellings,
  indexAtWidth,
  replaceSpellWord,
  spellCandidates,
  spellTarget,
  undoSpellFix,
  type SpellFix,
  type SpellSpan,
  type VocabularyContext,
} from "@/lib/spell/misspellings";
import { ignoreSpellWord, ignoredSpellWords, subscribeSpellIgnore } from "@/lib/spell/session";
import { channelNames, chatterNames, loadedEmoteNames } from "@/lib/spell/vocabulary";
import { emoteKey, emoteUrls, type Emote } from "@/lib/emotes/types";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { isFeatureOn } from "@/store/settings";
import { ackSendChannel, clearReplyTarget, useUi } from "@/store/ui";
import { EmotePicker } from "./EmotePicker";
import { SpellBar, SpellMenu, SpellMirror } from "./SpellOverlay";
import { useAnchorAbove } from "./useAnchorAbove";
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
  matches: TabMatch[];
  index: number;
  /** Where the typed word started. */
  start: number;
  /** Where the inserted name (plus its trailing space) ends. */
  end: number;
}

function matchKey(match: TabMatch): string {
  return match.kind === "emote" ? emoteKey(match.emote) : `user:${match.login}`;
}

function matchLabel(match: TabMatch): string {
  if (match.kind === "emote") return match.emote.name;
  if (match.displayName.toLowerCase() === match.login) return `@${match.login}`;
  return `@${match.login} (${match.displayName})`;
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
  const box = useAnchorAbove(anchorRef, [completion.matches.length, completion.index]);

  useEffect(() => {
    const active = activeRef.current;
    const list = active?.parentElement;
    if (!active || !list) return;
    // Scroll only this list. scrollIntoView also scrolls the page and blurs the message box.
    const top = active.offsetTop;
    const bottom = top + active.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [completion.index]);

  if (!box || typeof document === "undefined") return null;

  return createPortal(
    <div
      id={id}
      data-testid="tab-complete"
      role="listbox"
      aria-label="Suggestions"
      className="zoo-scroll fixed z-50 flex max-h-56 flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-xl border bg-popover/95 p-1 shadow-lg backdrop-blur"
      style={{ left: box.left, width: box.width, bottom: box.bottom }}
    >
      {completion.matches.map((match, i) => {
        const active = i === completion.index;
        return (
          <button
            key={matchKey(match)}
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
              {match.kind === "emote" ? (
                <CompletionEmoteThumb emote={match.emote} still={still} />
              ) : (
                <span className="text-sm font-semibold">@</span>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">{matchLabel(match)}</span>
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
  const confirmSwitch = useChat((s) => s.settings.confirmChannelSwitch);
  const insert = useUi((s) => s.insert);
  const sendAckChannel = useUi((s) => s.sendAckChannel);
  const replyTo = useUi((s) => (channel && s.replyTo?.channel === channel ? s.replyTo : null));
  const { emotes, index } = useEmoteIndex(channel);
  const spellCheck = useChat((s) => s.settings.spellCheck);
  const spellDictionary = useChat((s) => s.settings.spellDictionary);
  const spellLanguage = useChat((s) => s.settings.spellLanguage);
  const textSize = useChat((s) => s.settings.textSize);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const [misspellings, setMisspellings] = useState<SpellSpan[]>([]);
  const [spellMenu, setSpellMenu] = useState<{ x: number; y: number; span: SpellSpan; suggestions: string[] } | null>(null);
  const [ignoreVersion, setIgnoreVersion] = useState(0);
  const history = useRef<string[]>([]);
  const historyIndex = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaret = useRef<number | null>(null);
  const prevChannel = useRef(channel);
  const textRef = useRef("");
  const appliedInsert = useRef<number | null>(null);
  const drafts = useRef(new Map<string, string>());
  const histories = useRef(new Map<string, string[]>());
  const listId = useId();
  textRef.current = text;
  const [spellArmed, setSpellArmed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [caretAt, setCaretAt] = useState(0);
  const [spellBar, setSpellBar] = useState<{ span: SpellSpan; fixes: string[] } | null>(null);
  /** The fix you picked last, so the very next Backspace can undo it. */
  const lastFix = useRef<SpellFix | null>(null);
  const spellLanguageId: SpellLanguageId = spellLanguage === "en-US" ? "en-US" : "en-US";

  useEffect(() => subscribeSpellIgnore(() => setIgnoreVersion((version) => version + 1)), []);

  useEffect(() => {
    if (!spellCheck || !spellArmed || !channel) {
      setMisspellings([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadSpellEngine(spellLanguageId)
        .then(async (engine) => {
          if (cancelled) return;
          // Chat vocabulary from every joined channel, not just this one.
          const views = useChat.getState().channels;
          const joined = Object.keys(views);
          const emoteNames = loadedEmoteNames(joined);
          const vocabulary: VocabularyContext = {
            isEmote: (word) => emoteNames.has(word.toLowerCase()) || chatWords.isTwitchEmote(word),
            chatters: chatterNames(joined.map((name) => chat.activeChatters(name))),
            channelNames: channelNames(Object.values(views)),
            communityWord: (word) => chatWords.isCommunityWord(word),
            dictionary: new Set(spellDictionary.map((word) => word.toLowerCase())),
            ignored: ignoredSpellWords(),
            allCapsForms: engine.judgesAllCaps,
          };
          // One round trip to the dictionary for every word on the line.
          const line = textRef.current;
          const forms = spellCandidates(line, vocabulary);
          const verdicts = await engine.check(forms);
          if (cancelled) return;
          const correct = new Map(forms.map((form, i) => [form, verdicts[i]]));
          setMisspellings(findMisspellings(line, { ...vocabulary, correct: (word) => correct.get(word) !== false }));
        })
        .catch(() => {
          if (!cancelled) setMisspellings([]);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [text, spellCheck, spellArmed, spellDictionary, spellLanguageId, emotes, channel, ignoreVersion]);

  // Fixes for the word you just typed. They are only offered: nothing changes until you pick one.
  const barTarget = spellCheck && focused && !completion && !spellMenu ? spellTarget(text, misspellings, caretAt) : null;
  useEffect(() => {
    if (!barTarget) {
      setSpellBar(null);
      return;
    }
    let cancelled = false;
    void loadSpellEngine(spellLanguageId)
      .then((engine) => suggestFixes(engine, barTarget.word, 3))
      .catch(() => [] as string[])
      .then((fixes) => {
        if (!cancelled) setSpellBar(fixes.length ? { span: barTarget, fixes } : null);
      });
    return () => {
      cancelled = true;
    };
    // The span's position and word are what matter, not the object.
  }, [barTarget?.start, barTarget?.end, barTarget?.word, spellLanguageId]);
  const showSpellBar =
    spellBar && barTarget && spellBar.span.start === barTarget.start && spellBar.span.word === barTarget.word ? spellBar : null;

  useEffect(() => {
    if (!insert || !channel || insert.channel !== channel) return;
    if (appliedInsert.current === insert.nonce) return;
    appliedInsert.current = insert.nonce;
    setText((current) => {
      const spacer = current && !current.endsWith(" ") ? " " : "";
      const next = `${current}${spacer}${insert.text}`;
      pendingCaret.current = next.length;
      return next;
    });
    // Clicking a name chooses this channel, same as confirming the switch.
    ackSendChannel(channel);
    inputRef.current?.focus();
  }, [insert, channel]);

  useEffect(() => {
    if (!replyTo) return;
    inputRef.current?.focus();
  }, [replyTo?.nonce]);

  useEffect(() => {
    const previous = prevChannel.current;
    if (previous !== channel) {
      if (previous) {
        drafts.current.set(previous, textRef.current);
        histories.current.set(previous, history.current.slice());
      }
      prevChannel.current = channel;
      history.current = channel ? (histories.current.get(channel) ?? []).slice() : [];
      historyIndex.current = -1;
      setText(channel ? (drafts.current.get(channel) ?? "") : "");
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
    setCaretAt(caret);
  }, [text]);

  if (!channel) return null;
  if (auth.status !== "logged_in") return compact ? null : <LoginPrompt />;

  const connected = writeStatus === "connected";
  const locked = confirmSwitch && sendAckChannel !== channel;
  const length = Array.from(text).length;

  const submit = () => {
    if (locked || !text.trim()) return;
    const result = chat.send(
      channel,
      text,
      replyTo
        ? { id: replyTo.id, login: replyTo.login, displayName: replyTo.displayName, text: replyTo.text }
        : undefined,
    );
    if (result.ok) {
      history.current = [text, ...history.current.filter((h) => h !== text)].slice(0, 50);
      historyIndex.current = -1;
      setText("");
      setError(null);
      setCompletion(null);
      if (replyTo) clearReplyTarget(channel);
    } else if (result.error) {
      setError(result.error);
    }
  };

  /** Your pick from the bar or the right-click menu. The next Backspace puts the old word back. */
  const applySpelling = (span: SpellSpan, next: string) => {
    const caretBefore = inputRef.current?.selectionStart ?? text.length;
    const replaced = replaceSpellWord(text, span, next, caretBefore);
    lastFix.current = { before: text, caretBefore, after: replaced.text, caretAfter: replaced.caret };
    setText(replaced.text);
    pendingCaret.current = replaced.caret;
    historyIndex.current = -1;
    setSpellMenu(null);
    setSpellBar(null);
    // The old underlines no longer line up; the next check redraws them.
    setMisspellings([]);
    inputRef.current?.focus();
  };

  const onSpellContextMenu = (event: React.MouseEvent<HTMLInputElement>) => {
    if (!spellCheck) return;
    const input = inputRef.current;
    if (!input) return;
    const style = getComputedStyle(input);
    const rect = input.getBoundingClientRect();
    const pad = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.borderLeftWidth);
    const x = event.clientX - rect.left - pad + input.scrollLeft;
    const canvas = document.createElement("canvas").getContext("2d");
    if (!canvas) return;
    canvas.font = style.font;
    const at = indexAtWidth(text, x, (end) => canvas.measureText(text.slice(0, end)).width);
    const span = misspellings.find((item) => at >= item.start && at < item.end);
    if (!span) return;
    event.preventDefault();
    const { clientX, clientY } = event;
    void loadSpellEngine(spellLanguageId)
      .then((engine) => suggestFixes(engine, span.word))
      .catch(() => [] as string[])
      .then((suggestions) => setSpellMenu({ x: clientX, y: clientY, span, suggestions }));
  };

  /** Replaces text[start..end] with the match's name and a space. `close` accepts it and drops the list. */
  const applyMatch = (base: Completion, nextIndex: number, close = false) => {
    const name = completionInsert(base.matches[nextIndex]);
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
    if (close) {
      setCompletion(null);
      inputRef.current?.focus();
    } else {
      setCompletion({ ...base, index: nextIndex, end });
    }
  };

  const startCompletion = (backwards: boolean): boolean => {
    const caret = inputRef.current?.selectionStart ?? text.length;
    const word = wordAt(text, caret);
    if (!word) return false;
    const emoteHits = word.word.startsWith("@") || word.word.length < MIN_TYPED ? [] : findEmotes(index, word.word);
    const matches = tabMatches(word.word, emoteHits, chat.activeChatters(channel));
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
    if (spellMenu && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setSpellMenu(null);
      return;
    }
    if (showSpellBar && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      const slot = /^(?:Digit|Numpad)([1-3])$/.exec(event.code)?.[1] ?? (/^[1-3]$/.test(event.key) ? event.key : null);
      const fix = slot ? showSpellBar.fixes[Number(slot) - 1] : undefined;
      if (fix) {
        event.preventDefault();
        applySpelling(showSpellBar.span, fix);
        return;
      }
    }
    if (event.key === "Backspace" && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const el = inputRef.current;
      const undo = undoSpellFix(lastFix.current, text, el?.selectionStart ?? null, el?.selectionEnd ?? null);
      if (undo) {
        event.preventDefault();
        lastFix.current = null;
        setText(undo.text);
        pendingCaret.current = undo.caret;
        setMisspellings([]);
        return;
      }
    }
    const decision = reduceComposerKey({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
      composing: event.nativeEvent.isComposing,
      tabComplete,
      completion: completion ? { index: completion.index, count: completion.matches.length } : null,
      text,
      history: history.current,
      historyIndex: historyIndex.current,
    });
    switch (decision.kind) {
      case "cycle":
        event.preventDefault();
        if (completion) applyMatch(completion, decision.index);
        return;
      case "start":
        if (startCompletion(decision.backwards)) event.preventDefault();
        return;
      case "accept":
        // The match (and its trailing space) is already in the box. Close the list; the next Enter sends.
        event.preventDefault();
        if (completion) {
          const end = completion.end;
          setCompletion(null);
          const el = inputRef.current;
          el?.focus();
          el?.setSelectionRange(end, end);
        }
        return;
      case "close":
        event.preventDefault();
        event.stopPropagation();
        setCompletion(null);
        return;
      case "dismiss":
        setCompletion(null);
        return;
      case "submit":
        event.preventDefault();
        submit();
        return;
      case "history":
        event.preventDefault();
        historyIndex.current = decision.historyIndex;
        setText(decision.text);
        return;
      case "escape":
        if (replyTo) clearReplyTarget(channel);
        setError(null);
        return;
      default:
        return;
    }
  };

  return (
    <div className={cn("border-t border-border/80 bg-card", compact ? "px-2 py-1.5" : "px-3 pt-2.5 pb-3")}>
      {error ? (
        <div role="alert" className={cn("flex items-start gap-1.5 text-destructive", compact ? "mb-1 text-[11px]" : "mb-2 text-xs")}>
          <CircleAlert className="mt-px size-3.5 shrink-0" />
          {error}
        </div>
      ) : null}
      {locked ? (
        <div
          className={cn("flex flex-col", compact ? "gap-0" : "gap-1.5")}
          data-testid="channel-switch-ack"
        >
          {compact ? null : (
            <p className="text-xs text-muted-foreground">You switched channels. Confirm before sending.</p>
          )}
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            className={cn("w-full shrink-0", compact ? "h-8 text-[13px]" : "h-9")}
            data-testid="channel-switch-unlock"
            title={compact ? "You switched channels. Confirm before sending." : undefined}
            onClick={() => {
              ackSendChannel(channel);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          >
            chat in #{channel}
          </Button>
        </div>
      ) : (
        <div>
          {replyTo ? (
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-muted-foreground",
                compact ? "mb-1 text-[11px]" : "mb-1.5 text-xs",
              )}
              data-testid="reply-banner"
            >
              <CornerDownRight className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
                Replying to <span className="font-medium text-foreground">@{replyTo.displayName}</span>
                {replyTo.text ? `: ${replyTo.text}` : ""}
              </span>
              <button
                type="button"
                className="rounded-md p-0.5 hover:bg-background hover:text-foreground"
                aria-label="Cancel reply"
                onClick={() => clearReplyTarget(channel)}
              >
                <X className="size-3.5" />
              </button>
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
            {completion && completion.matches.length > 0 ? (
              <CompletionBar
                id={listId}
                completion={completion}
                compact={compact}
                anchorRef={inputRef}
                onChoose={(i) => {
                  applyMatch(completion, i, true);
                }}
              />
            ) : null}
            {showSpellBar ? (
              <SpellBar
                word={showSpellBar.span.word}
                fixes={showSpellBar.fixes}
                compact={compact}
                anchorRef={inputRef}
                onPick={(fix) => applySpelling(showSpellBar.span, fix)}
              />
            ) : null}
            {spellCheck ? <SpellMirror text={text} spans={misspellings} inputRef={inputRef} /> : null}
            {spellMenu
              ? createPortal(
                  <SpellMenu
                    x={spellMenu.x}
                    y={spellMenu.y}
                    suggestions={spellMenu.suggestions}
                    onPick={(word) => applySpelling(spellMenu.span, word)}
                    onAdd={() => {
                      const word = spellMenu.span.word;
                      const exists = spellDictionary.some((entry) => entry.toLowerCase() === word.toLowerCase());
                      if (!exists) chat.updateSettings({ spellDictionary: [...spellDictionary, word] });
                      setSpellMenu(null);
                    }}
                    onIgnore={() => {
                      ignoreSpellWord(spellMenu.span.word);
                      setSpellMenu(null);
                    }}
                  />,
                  document.body,
                )
              : null}
            <Input
              ref={inputRef}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setCaretAt(event.target.selectionStart ?? event.target.value.length);
                // Typing anything after a fix keeps it; only an immediate Backspace undoes it.
                lastFix.current = null;
                historyIndex.current = -1;
                setCompletion(null);
                setSpellMenu(null);
                if (error) setError(null);
              }}
              onSelect={(event) => setCaretAt(event.currentTarget.selectionStart ?? 0)}
              onKeyDown={onKeyDown}
              onContextMenu={onSpellContextMenu}
              style={{ fontSize: textSize }}
              onBlur={(event) => {
                setFocused(false);
                const next = event.relatedTarget;
                if (next instanceof Element && next.closest("[data-testid='tab-complete']")) return;
                window.setTimeout(() => {
                  const active = document.activeElement;
                  if (active === inputRef.current) return;
                  if (active instanceof Element && active.closest("[data-testid='tab-complete']")) return;
                  setCompletion(null);
                }, 0);
              }}
              onFocus={() => {
                setSpellArmed(true);
                setFocused(true);
              }}
              placeholder={`${theme.sendVerb} to #${channel} as ${auth.login}…`}
              aria-label={`Message #${channel}`}
              data-composer={channel}
              aria-autocomplete={tabComplete ? "list" : undefined}
              aria-controls={completion ? listId : undefined}
              aria-expanded={tabComplete ? !!completion : undefined}
              aria-activedescendant={completion ? `${listId}-${completion.index}` : undefined}
              className={cn("bg-card pr-12 transition-none", compact ? "h-8 text-[13px]" : "h-9 text-sm")}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              // Edge spellcheck rechecks the word under the caret on every arrow press.
              spellCheck={false}
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
        </div>
      )}
      {compact ? null : <RoomChips channel={channel} />}
      {!compact && !connected && !locked ? (
        <p className="mt-1.5 text-[11px] text-muted-foreground">Connecting your account to Twitch chat…</p>
      ) : null}
    </div>
  );
}
