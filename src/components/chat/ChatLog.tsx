import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useShallow } from "zustand/react/shallow";
import { GeckoFootIcon } from "@/components/gecko/icons";
import { PROVIDER_LABELS, type EmoteProvider } from "@/lib/emotes/types";
import type { ChatMessage } from "@/lib/twitch/types";
import { useChat } from "@/store/chat";
import { MessageRow, type RowPrefs } from "./MessageRow";

interface HoverEmote {
  name: string;
  provider: EmoteProvider;
  scope: string;
  src: string;
  rect: DOMRect;
}

function countNewer(snapshot: ChatMessage[], live: ChatMessage[]): number {
  const lastId = snapshot[snapshot.length - 1]?.id;
  if (!lastId) return live.length;
  for (let i = live.length - 1; i >= 0; i--) if (live[i].id === lastId) return live.length - 1 - i;
  return live.length;
}

interface ChatLogProps {
  messages: ChatMessage[];
  /** Changing this resets scroll position (switching channel or view). */
  viewKey: string;
  showChannel: boolean;
  empty?: ReactNode;
  onChannelClick?: (channel: string) => void;
  onNameClick?: (login: string) => void;
}

export function ChatLog({ messages, viewKey, showChannel, empty, onChannelClick, onNameClick }: ChatLogProps) {
  const prefs: RowPrefs & { fontSize: string; zebra: boolean } = useChat(
    useShallow((s) => ({
      showTimestamps: s.settings.showTimestamps,
      use24h: s.settings.use24h,
      showBadges: s.settings.showBadges,
      fontSize: s.settings.fontSize,
      zebra: s.settings.zebra,
    })),
  );
  const emoteVersions = useChat((s) => s.emoteVersions);
  const globalEmoteVersion = useChat((s) => s.globalEmoteVersion);
  const badgeVersion = useChat((s) => s.badgeVersion);
  const selfLogin = useChat((s) => (s.auth.status === "logged_in" ? s.auth.login : undefined));

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastInteraction = useRef(0);
  const [frozen, setFrozen] = useState<ChatMessage[] | null>(null);
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const liveRef = useRef(messages);
  liveRef.current = messages;
  const [hover, setHover] = useState<HoverEmote | null>(null);

  const visible = frozen ?? messages;
  const newer = frozen ? countNewer(frozen, messages) : 0;

  useEffect(() => {
    setFrozen(null);
  }, [viewKey]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    if (!frozen) scrollToBottom();
  }, [visible, frozen, scrollToBottom, prefs.fontSize]);

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
    if (!frozenRef.current && Date.now() - lastInteraction.current < 600) setFrozen(liveRef.current);
  };

  const markInteraction = () => {
    lastInteraction.current = Date.now();
  };

  const onMouseOver = (event: React.MouseEvent) => {
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
        aria-label="Chat messages"
        className="gecko-scroll absolute inset-0 overflow-y-auto overscroll-contain outline-none"
      >
        <div
          ref={contentRef}
          className="chat-log flex min-h-full flex-col justify-end py-2"
          data-font={prefs.fontSize}
          data-zebra={prefs.zebra}
          role="log"
          aria-live="off"
        >
          {visible.length === 0 && empty ? (
            <div className="flex flex-1 items-center justify-center p-6">{empty}</div>
          ) : null}
          {visible.map((message) => (
            <MessageRow
              key={message.id}
              message={message}
              revision={`${emoteVersions[message.channel] ?? 0}.${globalEmoteVersion}.${badgeVersion}`}
              showChannel={showChannel}
              prefs={prefs}
              selfLogin={selfLogin}
              onChannelClick={onChannelClick}
              onNameClick={onNameClick}
            />
          ))}
        </div>
      </div>

      {frozen ? (
        <button
          type="button"
          onClick={() => setFrozen(null)}
          className="gecko-glow absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-lg transition hover:brightness-110"
        >
          <GeckoFootIcon className="size-4" />
          {newer > 0 ? `${newer > 999 ? "999+" : newer} new · Stick to live chat` : "Paused · Stick to live chat"}
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
