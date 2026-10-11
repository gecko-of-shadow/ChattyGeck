import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, Star } from "lucide-react";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { chat } from "@/lib/chat/controller";
import { findEmotes, type NameIndex } from "@/lib/emotes/search";
import {
  PROVIDER_SHORT,
  THIRD_PARTY_PROVIDERS,
  emoteKey,
  emoteUrls,
  type Emote,
  type EmoteScope,
  type ThirdPartyProvider,
} from "@/lib/emotes/types";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import type { PickerTab } from "@/store/settings";

const TABS: { id: PickerTab; label: string }[] = [
  { id: "fav", label: "★ Favourites" },
  { id: "channel", label: "This channel" },
  { id: "all", label: "All" },
];

interface Section {
  key: string;
  title: string;
  emotes: Emote[];
}

const SCOPE_LABEL: Record<EmoteScope, string> = { channel: "This channel", global: "Global" };

/** Groups emotes into "scope × provider" sections, channel emotes first. */
function groupEmotes(emotes: Emote[]): Section[] {
  const buckets = new Map<string, Section>();
  for (const scope of ["channel", "global"] as EmoteScope[]) {
    for (const provider of THIRD_PARTY_PROVIDERS) {
      buckets.set(`${scope}:${provider}`, { key: `${scope}:${provider}`, title: `${SCOPE_LABEL[scope]} · ${PROVIDER_SHORT[provider]}`, emotes: [] });
    }
  }
  for (const emote of emotes) {
    const section = buckets.get(`${emote.scope}:${emote.provider as ThirdPartyProvider}`);
    if (section) section.emotes.push(emote);
  }
  return Array.from(buckets.values()).filter((s) => s.emotes.length > 0);
}

function toggleInList(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function EmoteTile({ emote, favourite, still, onPick }: { emote: Emote; favourite: boolean; still: boolean; onPick: (emote: Emote) => void }) {
  const [failed, setFailed] = useState(false);
  const urls = emoteUrls(emote, still);
  return (
    <button
      type="button"
      title={`${emote.name} · ${PROVIDER_SHORT[emote.provider]}${favourite ? " · favourite" : ""}\nRight-click to ${favourite ? "unfavourite" : "favourite"}`}
      aria-label={emote.name}
      data-emote-tile={emote.name}
      onClick={() => onPick(emote)}
      onContextMenu={(event) => {
        event.preventDefault();
        chat.updateSettings((s) => ({ favoriteEmotes: toggleInList(s.favoriteEmotes, emoteKey(emote)) }));
      }}
      className="relative grid size-9 place-items-center rounded-md transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60 outline-none"
    >
      {failed ? (
        <span className="max-w-8 truncate text-[9px] leading-none text-muted-foreground">{emote.name}</span>
      ) : (
        <img
          src={urls.url1x}
          srcSet={urls.url2x ? `${urls.url1x} 1x, ${urls.url2x} 2x` : undefined}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className="max-h-7 max-w-8 object-contain"
        />
      )}
      {favourite ? <Star className="absolute top-0.5 right-0.5 size-2.5 fill-mention text-mention" /> : null}
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

/** FFZ-style emote menu: foldable sections per source, search, and right-click favourites. */
export function EmotePicker({ channel, emotes, index, onPick, returnFocus, compact = false }: EmotePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const tab = useChat((s) => s.settings.pickerTab);
  const folded = useChat((s) => s.settings.pickerFolded);
  const favourites = useChat((s) => s.settings.favoriteEmotes);
  const still = useChat((s) => s.settings.emoteAnimation === "never");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const favouriteSet = useMemo(() => new Set(favourites), [favourites]);
  const typed = query.trim();

  const shown = useMemo(() => {
    const base = typed ? findEmotes(index, typed, 500) : emotes;
    if (tab === "fav") return base.filter((e) => favouriteSet.has(emoteKey(e)));
    if (tab === "channel") return base.filter((e) => e.scope === "channel");
    return base;
  }, [emotes, index, typed, tab, favouriteSet]);

  const sections = useMemo(() => {
    if (tab === "fav") {
      const sorted = shown.slice().sort((a, b) => favourites.indexOf(emoteKey(a)) - favourites.indexOf(emoteKey(b)));
      return sorted.length ? [{ key: "fav", title: "Favourites", emotes: sorted }] : [];
    }
    return groupEmotes(shown);
  }, [shown, tab, favourites]);

  const pick = (emote: Emote) => {
    onPick(emote);
    setOpen(false);
  };

  const emptyText =
    emotes.length === 0
      ? `No third-party emotes loaded for #${channel} yet.`
      : typed
        ? `Nothing called "${typed}".`
        : tab === "fav"
          ? "No favourites yet. Right-click any emote to pin it here."
          : tab === "channel"
            ? `#${channel} has no 7TV, BTTV or FFZ emotes of its own.`
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
        sideOffset={8}
        finalFocus={returnFocus}
        className="w-[min(92vw,22rem)] gap-2 p-2"
        data-testid="emote-picker"
      >
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && shown.length) {
                event.preventDefault();
                pick(shown[0]);
              }
            }}
            placeholder="Search emotes…"
            aria-label="Search emotes"
            className="h-8 pl-7 text-sm"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="flex rounded-lg border bg-muted/60 p-0.5" role="tablist" aria-label="Emote groups">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={tab === option.id}
              onClick={() => chat.updateSettings({ pickerTab: option.id })}
              className={cn(
                "h-6.5 flex-1 rounded-md px-2 text-xs font-medium whitespace-nowrap",
                tab === option.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="zoo-scroll max-h-72 min-h-24 overflow-y-auto overscroll-contain pr-0.5">
          {sections.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
          ) : (
            sections.map((section) => {
              const isFolded = !typed && tab !== "fav" && folded.includes(section.key);
              return (
                <div key={section.key} className="mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (tab === "fav") return;
                      chat.updateSettings((s) => ({ pickerFolded: toggleInList(s.pickerFolded, section.key) }));
                    }}
                    aria-expanded={!isFolded}
                    className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
                  >
                    {tab === "fav" ? <Star className="size-3" /> : isFolded ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                    {section.title}
                    <span className="ml-auto font-normal normal-case">{section.emotes.length}</span>
                  </button>
                  {isFolded ? null : (
                    <div className="flex flex-wrap gap-0.5 px-0.5">
                      {section.emotes.map((emote) => (
                        <EmoteTile key={emoteKey(emote)} emote={emote} favourite={favouriteSet.has(emoteKey(emote))} still={still} onPick={pick} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
