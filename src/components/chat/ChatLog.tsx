import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { PawPrint } from "lucide-react";
import { GeckoFootIcon } from "@/components/mascots/icons";
import { PROVIDER_LABELS, type EmoteProvider } from "@/lib/emotes/types";
import { THEMES } from "@/lib/themes";
import type { ChatMessage } from "@/lib/twitch/types";
import { useChat } from "@/store/chat";
import { isFeatureOn } from "@/store/settings";
import { MessageRow, type RowPrefs } from "./MessageRow";

interface HoverEmote {
  name: string;
  provider: EmoteProvider;
  scope: string;
  src: string;
  rect: DOMRect;
}

/** Rows kept in the DOM while following live chat; scrolling up reveals the whole buffer. */
const DEFAULT_LIVE_ROWS = 150;

function countNewer(snapshot: ChatMessage[], live: ChatMessage[]): number {
  const lastId = snapshot[snapshot.length - 1]?.id;
  if (!lastId) return live.length;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].id === lastId) return live.length - 1 - i;
  return live.length;
}

interface ChatLogProps {
  messages: ChatMessage[];
  /** Channel these messages belong to (used for per-channel feature overrides). */
  channel: string;
  /** Changing this resets scroll position (switching channel or view). */
  viewKey: string;
  empty?: ReactNode;
  /** Draws a "new since you left" divider after this message id. */
  readMarker?: string;
  /** How many recent rows stay rendered while following live chat. */
  liveRows?: number;
  /** Accessible name of the scrolling log. */
  label?: string;
  onNameClick?: (login: string) => void;
}

export function ChatLog({
  messages,
  channel,
  viewKey,
  empty,
  readMarker,
  liveRows = DEFAULT_LIVE_ROWS,
  label = "Chat messages",
  onNameClick,
}: ChatLogProps) {
  const prefs: RowPrefs & { textSize: number; emoteSize: number; emotePreview: boolean; zebra: boolean } = useChat(
    useShallow((s) => ({
      showTimestamps: s.settings.showTimestamps,
      use24h: s.settings.use24h,
      showBadges: s.settings.showBadges,
      emoteAnimation: s.settings.emoteAnimation,
      showDeleted: isFeatureOn(s.settings, channel, "showDeleted"),
      textSize: s.settings.textSize,
      emoteSize: s.settings.emoteSize,
      emotePreview: isFeatureOn(s.settings, channel, "emotePreview"),
      zebra: s.settings.zebra,
    })),
  );
  const emoteVersions = useChat((s) => s.emoteVersions);
  const globalEmoteVersion = useChat((s) => s.globalEmoteVersion);
  const badgeVersion = useChat((s) => s.badgeVersion);
  const selfLogin = useChat((s) => (s.auth.status === "logged_in" ? s.auth.login : undefined));
  const isGecko = useChat((s) => THEMES[s.settings.skin].animal === "gecko");

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastInteraction = useRef(0);
  const [frozen, setFrozen] = useState<ChatMessage[] | null>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const liveRef = useRef(messages);
  liveRef.current = messages;
  const [hover, setHover] = useState<HoverEmote | null>(null);
  const anchorFromBottom = useRef<number | null>(null);

  const visible = useMemo(() => {
    if (frozen) return frozen;
    let keep = liveRows;
    if (readMarker) {
      // Keep the "new since you left" divider reachable even in a fast channel.
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].id === readMarker) {
          keep = Math.max(keep, messages.length - i + 3);
          break;
        }
      }
    }
    return messages.length > keep ? messages.slice(-keep) : messages;
  }, [frozen, messages, readMarker, liveRows]);
  const newer = frozen ? countNewer(frozen, messages) : 0;

  useEffect(() => {
    setFrozen(null);
  }, [viewKey]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!frozen) {
      el.scrollTop = el.scrollHeight;
    } else if (anchorFromBottom.current !== null) {
      // Older history was just rendered above the viewport; keep the same lines in view.
      el.scrollTop = el.scrollHeight - anchorFromBottom.current;
      anchorFromBottom.current = null;
    }
  }, [visible, frozen, prefs.textSize, prefs.emoteSize]);

  // Emotes load after the row renders and grow it; keep pinned to the bottom while live.
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const observer = new ResizeObserver(() => {
      if (!frozenRef.current) scrollToBottom();
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, [scrollToBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distance < 40) {
      if (frozenRef.current) setFrozen(null);
      return;
    }
    // Only a person scrolling up pauses the feed; layout shifts from images don't.
    if (!frozenRef.current && Date.now() - lastInteraction.current < 600) {
      anchorFromBottom.current = el.scrollHeight - el.scrollTop;
      setFrozen(liveRef.current);
    }
  };

  const markInteraction = () => {
    lastInteraction.current = Date.now();
  };

  const onMouseOver = (event: React.MouseEvent) => {
    if (!prefs.emotePreview) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLImageElement && target.dataset.emoteName) {
      setHover({
        name: target.dataset.emoteName,
        provider: target.dataset.emoteProvider as EmoteProvider,
        scope: target.dataset.emoteScope ?? "global",
        src: target.dataset.emoteSrc ?? target.src,
        rect: target.getBoundingClientRect(),
      });
    }
  };

  const onMouseOut = (event: React.MouseEvent) => {
    if ((event.target as HTMLElement).dataset?.emoteName) setHover(null);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        onWheel={markInteraction}
        onTouchMove={markInteraction}
        onPointerDown={markInteraction}
        onKeyDown={markInteraction}
        onMouseOver={onMouseOver}
        onMouseOut={onMouseOut}
        tabIndex={0}
        aria-label={label}
        className="zoo-scroll absolute inset-0 overflow-y-auto overscroll-contain outline-none"
      >
        <div
          ref={contentRef}
          className="chat-log flex min-h-full flex-col justify-end py-2"
          style={{ "--chat-font": `${prefs.textSize}px`, "--emote-scale": prefs.emoteSize } as React.CSSProperties}
          data-zebra={prefs.zebra}
          role="log"
          aria-live="off"
        >
          {visible.length === 0 && empty ? (
            <div className="flex flex-1 items-center justify-center p-6">{empty}</div>
          ) : null}
          {visible.map((message, index) => (
            <Fragment key={message.id}>
              <MessageRow
                message={message}
                revision={`${emoteVersions[message.channel] ?? 0}.${globalEmoteVersion}.${badgeVersion}`}
                prefs={prefs}
                selfLogin={selfLogin}
                onNameClick={onNameClick}
              />
              {message.id === readMarker && index < visible.length - 1 ? (
                <div className="flex items-center gap-2 px-3 py-1 text-[11px] font-semibold tracking-wide text-mention uppercase" role="separator">
                  <span className="h-px flex-1 bg-[rgb(var(--mention-rgb)/0.45)]" />
                  New since you left
                  <span className="h-px flex-1 bg-[rgb(var(--mention-rgb)/0.45)]" />
                </div>
              ) : null}
            </Fragment>
          ))}
        </div>
      </div>

      {frozen ? (
        <button
          type="button"
          onClick={() => setFrozen(null)}
          className="zoo-glow absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg transition hover:brightness-110"
        >
          {isGecko ? <GeckoFootIcon className="size-4" /> : <PawPrint className="size-4" />}
          {newer > 0 ? `${newer > 999 ? "999+" : newer} new · ` : "Paused · "}
          {isGecko ? "Stick to live chat" : "Back to live chat"}
        </button>
      ) : null}

      {hover
        ? createPortal(
            <div
              className="pointer-events-none fixed z-50 flex w-max max-w-56 flex-col items-center gap-1.5 rounded-xl border bg-popover/95 p-2.5 text-center shadow-xl backdrop-blur"
              style={{
                left: Math.min(Math.max(hover.rect.left + hover.rect.width / 2, 120), window.innerWidth - 120),
                top: hover.rect.top - 8,
                transform: "translate(-50%, -100%)",
              }}
            >
              <img src={hover.src} alt="" className="max-h-24 max-w-48 object-contain" />
              <div className="text-sm font-semibold break-all">{hover.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {PROVIDER_LABELS[hover.provider]} · {hover.provider === "twitch" ? "Twitch emote" : `${hover.scope} emote`}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
