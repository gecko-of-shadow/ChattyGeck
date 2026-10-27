import { useEffect, useMemo, useRef, useState, useEffectEvent, startTransition } from "react";
import { Search, Star } from "lucide-react";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { findEmotes, type NameIndex } from "@/lib/emotes/search";
import {
  PROVIDER_SHORT,
  emoteKey,
  emoteUrls,
  type Emote,
  type EmoteProvider,
  type EmoteScope,
} from "@/lib/emotes/types";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import type { PickerTab } from "@/store/settings";

const TABS: { id: PickerTab; label: string }[] = [
  { id: "fav", label: "★" },
  { id: "channel", label: "Channel" },
  { id: "all", label: "All" },
];

/** How many rows to paint at first / each scroll page. Keeps "All" from freezing on big packs. */
const PAGE = 60;

const PROVIDERS: EmoteProvider[] = ["twitch", "7tv", "bttv", "ffz"];
const SCOPE_LABEL: Record<EmoteScope, string> = { channel: "Channel", global: "Global" };

interface Row {
  kind: "header" | "emote";
  key: string;
  title?: string;
  count?: number;
  emote?: Emote;
}

function buildRows(emotes: Emote[], tab: PickerTab, typed: string, favourites: string[]): Row[] {
  if (tab === "fav" || typed) {
    const list =
      tab === "fav"
        ? emotes.slice().sort((a, b) => favourites.indexOf(emoteKey(a)) - favourites.indexOf(emoteKey(b)))
        : emotes;
    return list.map((emote) => ({ kind: "emote", key: emoteKey(emote), emote }));
  }

  const buckets = new Map<string, Emote[]>();
  for (const scope of ["channel", "global"] as EmoteScope[]) {
    for (const provider of PROVIDERS) buckets.set(`${scope}:${provider}`, []);
  }
  for (const emote of emotes) {
    buckets.get(`${emote.scope}:${emote.provider}`)?.push(emote);
  }

  const rows: Row[] = [];
  for (const scope of ["channel", "global"] as EmoteScope[]) {
    for (const provider of PROVIDERS) {
      const list = buckets.get(`${scope}:${provider}`) ?? [];
      if (!list.length) continue;
      rows.push({
        kind: "header",
        key: `h:${scope}:${provider}`,
        title: `${SCOPE_LABEL[scope]} · ${PROVIDER_SHORT[provider]}`,
        count: list.length,
      });
      for (const emote of list) rows.push({ kind: "emote", key: emoteKey(emote), emote });
    }
  }
  return rows;
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function EmoteRow({ emote, favourite, still, onPick }: { emote: Emote; favourite: boolean; still: boolean; onPick: (emote: Emote) => void }) {
  const [failed, setFailed] = useState(false);
  const urls = emoteUrls(emote, still);
  return (
    <button
      type="button"
      title={`Right-click to ${favourite ? "unfavourite" : "favourite"}`}
      aria-label={emote.name}
      data-emote-tile={emote.name}
      onClick={() => onPick(emote)}
      onContextMenu={(event) => {
        event.preventDefault();
        chat.updateSettings((s) => ({ favoriteEmotes: toggleInList(s.favoriteEmotes, emoteKey(emote)) }));
      }}
      className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1 text-left transition hover:bg-accent hover:**:text-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 36px" }}
    >
      <span className="grid size-9 shrink-0 place-items-center">
        {failed ? (
          <span className="text-[10px] text-muted-foreground">?</span>
        ) : (
          <img
            src={urls.url1x}
            srcSet={urls.url2x ? `${urls.url1x} 1x, ${urls.url2x} 2x` : undefined}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setFailed(true)}
            className="max-h-9 max-w-12 object-contain"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{emote.name}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{PROVIDER_SHORT[emote.provider]}</span>
      {favourite ? <Star className="size-3 shrink-0 fill-mention text-mention" /> : null}
    </button>
  );
}

export interface EmotePickerProps {
  channel: string;
  emotes: Emote[];
  index: NameIndex;
  onPick: (emote: Emote) => void;
  /** Where focus goes when the menu closes (the message box). */
  returnFocus?: React.RefObject<HTMLElement | null>;
  compact?: boolean;
}

/** Compact emote menu: search, three tabs, a windowed vertical list (so "All" stays snappy). */
export function EmotePicker({ channel, emotes, index, onPick, returnFocus, compact = false }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const tab = useChat((s) => s.settings.pickerTab);
  const favourites = useChat((s) => s.settings.favoriteEmotes);
  const still = useChat((s) => s.settings.emoteAnimation === "never");
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    setLimit(PAGE);
    listRef.current?.scrollTo(0, 0);
  }, [tab, query, channel, open]);

  const favouriteSet = useMemo(() => new Set(favourites), [favourites]);
  const typed = query.trim();

  const shown = useMemo(() => {
    const base = typed ? findEmotes(index, typed, 500) : emotes;
    if (tab === "fav") return base.filter((e) => favouriteSet.has(emoteKey(e)));
    if (tab === "channel") return base.filter((e) => e.scope === "channel");
    return base;
  }, [emotes, index, typed, tab, favouriteSet]);

  const rows = useMemo(() => buildRows(shown, tab, typed, favourites), [shown, tab, typed, favourites]);
  const visible = rows.slice(0, limit);
  const hasMore = limit < rows.length;

  const grow = useEffectEvent(() => {
    startTransition(() => setLimit((n) => Math.min(n + PAGE, rows.length)));
  });

  useEffect(() => {
    if (!open || !hasMore) return;
    const node = sentinelRef.current;
    const root = listRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) grow();
      },
      { root, rootMargin: "120px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [open, hasMore, limit, rows.length]);

  const pick = (emote: Emote) => {
    onPick(emote);
    setOpen(false);
  };

  const emptyText =
    emotes.length === 0
      ? `No emotes loaded for #${channel} yet.`
      : typed
        ? `Nothing called "${typed}".`
        : tab === "fav"
          ? "No favourites yet. Right-click to pin one."
          : tab === "channel"
            ? `#${channel} has no channel emotes.`
            : "Nothing to show.";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size={compact ? "icon-sm" : "icon-lg"}
            className="shrink-0"
            aria-label="Emote menu"
            title="Emotes (right-click one to favourite it)"
            data-testid="emote-picker-button"
          />
        }
      >
        <Mascot className={compact ? "size-5" : "size-6"} anim="none" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={6}
        finalFocus={returnFocus}
        className="w-[min(92vw,16.5rem)] gap-1.5 p-1.5"
        data-testid="emote-picker"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              const first = rows.find((row) => row.emote);
              if (event.key === "Enter" && first?.emote) {
                event.preventDefault();
                pick(first.emote);
              }
            }}
            placeholder="Search…"
            aria-label="Search emotes"
            className="h-7 pl-7 text-xs"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex gap-0.5" role="tablist" aria-label="Emote groups">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              onClick={() => chat.updateSettings({ pickerTab: option.id })}
              className={cn(
                "h-6 flex-1 rounded-md text-xs font-medium",
                tab === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div ref={listRef} className="zoo-scroll max-h-80 min-h-16 overflow-y-auto overscroll-contain">
          {rows.length === 0 ? (
            <p className="px-1 py-5 text-center text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            <>
              {visible.map((row) =>
                row.kind === "header" ? (
                  <div
                    key={row.key}
                    className="sticky top-0 z-10 bg-popover px-1.5 py-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
                  >
                    {row.title}
                    <span className="ml-1 font-normal normal-case">{row.count}</span>
                  </div>
                ) : (
                  <EmoteRow
                    key={row.key}
                    emote={row.emote!}
                    favourite={favouriteSet.has(emoteKey(row.emote!))}
                    still={still}
                    onPick={pick}
                  />
                ),
              )}
              {hasMore ? (
                <div ref={sentinelRef} className="px-1 py-2 text-center text-[10px] text-muted-foreground">
                  Loading more…
                </div>
              ) : null}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
