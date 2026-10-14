import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  Check,
  Download,
  FolderOpen,
  Hash,
  KeyRound,
  Palette,
  RefreshCw,
  RotateCcw,
  Smile,
  TriangleAlert,
  Type,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Mascot } from "@/components/mascots/Mascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { chat } from "@/lib/chat/controller";
import { playMentionChime } from "@/lib/notify";
import { config } from "@/lib/config";
import { problemLog, type EmoteProblem } from "@/lib/emotes/problems";
import { emoteRegistry } from "@/lib/emotes/registry";
import { PROVIDER_LABELS, THIRD_PARTY_PROVIDERS } from "@/lib/emotes/types";
import { isTauri, openExternal } from "@/lib/platform";
import { settingsSearchHelpers, type SettingsSearchHelpers } from "@/lib/settingsSearch";
import { applyUpdate, fetchLatestRelease, isNewerVersion, type UpdateInfo } from "@/lib/updates";
import { normalizeChannelName } from "@/lib/twitch/messages";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { SKIN_ORDER, THEMES } from "@/lib/themes";
import {
  CHANNEL_FEATURES,
  TAB_COMPLETE_HINT,
  TAB_COMPLETE_LABEL,
  DEFAULT_SETTINGS,
  MENTION_COOLDOWN_MAX,
  MENTION_COOLDOWN_MIN,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_PRESETS,
  clampMentionCooldown,
  clampTextSize,
  makeBackup,
  parseWordList,
  readBackup,
  type ChannelFeature,
  type EmoteAnimation,
  type EmoteSize,
  type Settings,
} from "@/store/settings";
import { useUi } from "@/store/ui";

const SettingsSearchContext = createContext<SettingsSearchHelpers>(settingsSearchHelpers(""));

function useSettingsSearch(): SettingsSearchHelpers {
  return useContext(SettingsSearchContext);
}

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  const { sectionVisible } = useSettingsSearch();
  if (!sectionVisible(title)) return null;
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
}

/** Hide a settings control when search does not match; never changes its value. */
function Searchable({ section, id, children }: { section: string; id: string; children: React.ReactNode }) {
  const { rowVisible } = useSettingsSearch();
  if (!rowVisible(section, id)) return null;
  return <>{children}</>;
}

type BooleanKey = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function ToggleRow({ id, label, hint, setting }: { id: string; label: string; hint?: string; setting: BooleanKey }) {
  const value = useChat((s) => s.settings[setting]);
  return (
    <div className="flex items-center justify-between gap-4">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        <span className="text-sm">{label}</span>
        {hint ? <span className="text-xs font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      <Switch id={id} checked={value} onCheckedChange={(checked) => chat.updateSettings({ [setting]: checked })} />
    </div>
  );
}

/** A row of pill buttons where exactly one is chosen. */
function Choice<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm">{label}</span>
      <div className="flex rounded-lg border bg-muted/60 p-0.5" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-6.5 rounded-md px-2.5 text-xs font-medium",
              value === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function MentionSoundRow() {
  const enabled = useChat((s) => s.settings.mentionSound);
  const cooldown = useChat((s) => s.settings.mentionSoundCooldown);
  const animal = useChat((s) => THEMES[s.settings.skin].animal);
  const [draft, setDraft] = useState(String(cooldown));
  useEffect(() => setDraft(String(cooldown)), [cooldown]);
  const commit = () => {
    const next = clampMentionCooldown(draft);
    setDraft(String(next));
    if (next !== cooldown) chat.updateSettings({ mentionSoundCooldown: next });
  };
  return (
    <div className="space-y-2">
      <ToggleRow
        id="pref-mention-sound"
        label="Mention sound"
        hint="A short chime when your name, a reply to you, or a highlight word shows up in any open chat."
        setting="mentionSound"
      />
      {enabled ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label htmlFor="pref-mention-cooldown" className="text-sm font-normal">
            Cooldown
          </Label>
          <div className="flex items-center gap-1.5">
            <Input
              id="pref-mention-cooldown"
              type="number"
              inputMode="numeric"
              min={MENTION_COOLDOWN_MIN}
              max={MENTION_COOLDOWN_MAX}
              step={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commit();
                }
              }}
              aria-label="Mention sound cooldown in seconds"
              className="h-7 w-16 text-xs tabular-nums"
            />
            <span className="text-xs text-muted-foreground">sec</span>
            <Button type="button" variant="outline" size="sm" aria-label="Play mention sound" onClick={() => playMentionChime(animal)}>
              Play
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextSizeRow() {
  const textSize = useChat((s) => s.settings.textSize);
  const [draft, setDraft] = useState(String(textSize));
  // Keep the box in sync when Settings resets/restores text size from elsewhere.
  useEffect(() => setDraft(String(textSize)), [textSize]);
  const commit = () => {
    if (!draft.trim()) {
      setDraft(String(textSize));
      return;
    }
    const next = clampTextSize(draft);
    setDraft(String(next));
    if (next !== textSize) chat.updateSettings({ textSize: next });
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">Text size</span>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border bg-muted/60 p-0.5" role="radiogroup" aria-label="Text size presets">
            {TEXT_SIZE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                role="radio"
                aria-checked={textSize === preset.px}
                onClick={() => chat.updateSettings({ textSize: preset.px })}
                className={cn(
                  "h-6.5 rounded-md px-2 text-xs font-medium",
                  textSize === preset.px ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <Input
            type="number"
            inputMode="decimal"
            min={TEXT_SIZE_MIN}
            max={TEXT_SIZE_MAX}
            step={0.5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
            aria-label="Text size in pixels"
            className="h-7 w-[4.5rem] text-xs tabular-nums"
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Any size from {TEXT_SIZE_MIN} to {TEXT_SIZE_MAX}px. Emotes grow and shrink with the text.
      </p>
    </div>
  );
}

/** A list setting edited as free text; saved when you click away or press Ctrl+Enter. */
function WordListField({
  id,
  label,
  hint,
  placeholder,
  setting,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  setting: "highlightWords" | "blockedEmotes";
}) {
  const saved = useChat((s) => s.settings[setting]);
  const [draft, setDraft] = useState(saved.join("\n"));
  useEffect(() => setDraft(saved.join("\n")), [saved]);
  const commit = () => {
    const next = parseWordList(draft);
    if (next.join("\n") !== saved.join("\n")) chat.updateSettings({ [setting]: next });
    else setDraft(next.join("\n"));
  };
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        <span className="text-sm">{label}</span>
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </Label>
      <textarea
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            commit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        spellCheck={false}
        className="zoo-scroll w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-1.5 font-mono text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
      />
    </div>
  );
}

function ClientIdField() {
  const saved = useChat((s) => s.settings.clientId);
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const dirty = draft.trim() !== saved;
  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        chat.updateSettings({ clientId: draft.trim() });
      }}
    >
      <Label htmlFor="settings-client-id" className="text-sm">
        Twitch Client ID
      </Label>
      <div className="flex gap-2">
        <Input
          id="settings-client-id"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={config.builtInClientId ? "Using the Client ID built into this copy" : "Paste a Client ID to enable login"}
          className="font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="outline" disabled={!dirty}>
          Save
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {saved
          ? "Custom Client ID in use. Clear the field and save to go back to the built-in one."
          : config.builtInClientId
            ? "This copy of ZooChattr ships with a Client ID, so login works out of the box."
            : "No Client ID is built in. Reading chat works anyway; login needs one."}
      </p>
    </form>
  );
}

function EmotesSection() {
  const providers = useChat((s) => s.settings.emoteProviders);
  const emoteSize = useChat((s) => s.settings.emoteSize);
  const animation = useChat((s) => s.settings.emoteAnimation);
  const remember = useChat((s) => s.settings.rememberEmotes);
  const [cacheSize, setCacheSize] = useState(() => emoteRegistry.cacheSize);
  useEffect(() => {
    setCacheSize(emoteRegistry.cacheSize);
    // Lists get remembered as downloads land; the registry announces each one.
    return emoteRegistry.subscribe(() => setCacheSize(emoteRegistry.cacheSize));
  }, [remember]);

  return (
    <Section icon={Smile} title="Emotes">
      <div className="space-y-3">
        <Searchable section="Emotes" id="sources">
          <div className="space-y-2">
            <span className="text-sm">Emote sources</span>
            <div className="grid grid-cols-3 gap-2">
              {THIRD_PARTY_PROVIDERS.map((provider) => (
                <Label
                  key={provider}
                  htmlFor={`pref-provider-${provider}`}
                  className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs"
                >
                  {PROVIDER_LABELS[provider]}
                  <Switch
                    id={`pref-provider-${provider}`}
                    checked={providers[provider]}
                    onCheckedChange={(checked) =>
                      chat.updateSettings((s) => ({ emoteProviders: { ...s.emoteProviders, [provider]: checked } }))
                    }
                  />
                </Label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Twitch's own emotes always show. Switch a source off and its emotes turn back into plain words.</p>
          </div>
        </Searchable>
        <Searchable section="Emotes" id="size">
          <Choice<EmoteSize>
            label="Emote size"
            value={emoteSize}
            options={[
              { value: 1, label: "1×" },
              { value: 1.5, label: "1.5×" },
              { value: 2, label: "2×" },
            ]}
            onChange={(value) => chat.updateSettings({ emoteSize: value })}
          />
        </Searchable>
        <Searchable section="Emotes" id="anim">
          <Choice<EmoteAnimation>
            label="Moving emotes"
            value={animation}
            options={[
              { value: "always", label: "Always" },
              { value: "hover", label: "On hover" },
              { value: "never", label: "Never" },
            ]}
            onChange={(value) => chat.updateSettings({ emoteAnimation: value })}
          />
        </Searchable>
        <Searchable section="Emotes" id="overlays">
          <ToggleRow id="pref-overlays" label="Overlay emotes" hint="Zero-width emotes stack on top of the one before them" setting="overlayEmotes" />
        </Searchable>
        <Searchable section="Emotes" id="preview">
          <ToggleRow id="pref-preview" label="Preview on hover" hint="Point at an emote to see it big with its name and source" setting="emotePreview" />
        </Searchable>
        <Searchable section="Emotes" id="tab">
          <ToggleRow id="pref-tab" label={TAB_COMPLETE_LABEL} hint={TAB_COMPLETE_HINT} setting="tabComplete" />
        </Searchable>
        <Searchable section="Emotes" id="picker">
          <ToggleRow id="pref-picker" label="Emote menu" hint="The animal button next to the message box" setting="emotePicker" />
        </Searchable>
        <Searchable section="Emotes" id="remember">
          <div className="space-y-1.5">
            <ToggleRow
              id="pref-remember"
              label="Remember emotes"
              hint="Keep emote lists on this device so pictures show the moment a channel opens"
              setting="rememberEmotes"
            />
            {remember ? (
              <div className="flex items-center justify-between gap-3 pl-0.5 text-xs text-muted-foreground">
                <span>{cacheSize === 0 ? "Nothing remembered yet." : `${cacheSize} emote ${cacheSize === 1 ? "list" : "lists"} remembered.`}</span>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={cacheSize === 0}
                  onClick={() => {
                    chat.forgetEmotes();
                    setCacheSize(emoteRegistry.cacheSize);
                    toast("Forgot the remembered emotes", { description: "Fetching fresh lists now." });
                  }}
                >
                  Forget them
                </Button>
              </div>
            ) : null}
          </div>
        </Searchable>
        <Searchable section="Emotes" id="blocked">
          <WordListField
            id="pref-blocked"
            label="Blocked emotes"
            hint="Names that should stay plain text. One per line (spaces and commas work too)."
            placeholder={"KEKW\nmonkaS"}
            setting="blockedEmotes"
          />
        </Searchable>
      </div>
    </Section>
  );
}

function setChannelFeature(channel: string, feature: ChannelFeature, on: boolean): void {
  chat.updateSettings((s) => {
    const current = s.channelOverrides[channel] ?? [];
    const next = on ? current.filter((f) => f !== feature) : current.includes(feature) ? current : [...current, feature];
    return { channelOverrides: { ...s.channelOverrides, [channel]: next } };
  });
}

function ChannelOverridesSection() {
  const overrides = useChat((s) => s.settings.channelOverrides);
  const joined = useChat((s) => s.settings.channels);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const names = Object.keys(overrides).sort();

  const add = (raw: string) => {
    const name = normalizeChannelName(raw);
    if (!name) {
      setError("That doesn't look like a Twitch channel. Use letters, numbers and underscores.");
      return;
    }
    if (!(name in overrides)) {
      chat.updateSettings((s) => ({ channelOverrides: { ...s.channelOverrides, [name]: [] } }));
    }
    setDraft("");
    setError(null);
  };

  return (
    <Section icon={Hash} title="Per channel">
      <Searchable section="Per channel" id="overrides">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Switch features off on one channel only: add the channel, then untick what you don't want there. Everything else keeps your global switches.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              placeholder="Channel name, for example xqc"
              aria-label="Channel for feature overrides"
              className="text-sm"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" variant="outline" size="sm">
              Add
            </Button>
          </form>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {joined.length && names.length === 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {joined.map((channel) => (
                <Button key={channel} type="button" variant="outline" size="xs" onClick={() => add(channel)}>
                  #{channel}
                </Button>
              ))}
            </div>
          ) : null}
          {names.length === 0 ? (
            <p className="text-xs text-muted-foreground">No per-channel overrides yet.</p>
          ) : (
            <div className="space-y-3">
              {names.map((channel) => {
                const off = new Set(overrides[channel] ?? []);
                return (
                  <div key={channel} className="space-y-2 rounded-xl border px-3 py-2.5" data-testid={`channel-override-${channel}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">#{channel}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="text-muted-foreground"
                        onClick={() =>
                          chat.updateSettings((s) => {
                            const channelOverrides = { ...s.channelOverrides };
                            delete channelOverrides[channel];
                            return { channelOverrides };
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {CHANNEL_FEATURES.map((feature) => (
                        <Label
                          key={feature.id}
                          htmlFor={`override-${channel}-${feature.id}`}
                          className="flex items-center justify-between gap-2 rounded-lg border px-2 py-1 text-xs"
                        >
                          {feature.label}
                          <Switch
                            id={`override-${channel}-${feature.id}`}
                            checked={!off.has(feature.id)}
                            onCheckedChange={(checked) => setChannelFeature(channel, feature.id, checked)}
                          />
                        </Label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Searchable>
    </Section>
  );
}

function ProblemsSection() {
  const [problems, setProblems] = useState<EmoteProblem[]>(() => problemLog.list());
  useEffect(() => problemLog.subscribe(() => setProblems(problemLog.list())), []);

  return (
    <Section icon={TriangleAlert} title="Problems">
      <Searchable section="Problems" id="problems">
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            When a 7TV, BetterTTV or FrankerFaceZ download fails, the last 20 times are listed here so you can see why emotes went quiet.
          </p>
          {problems.length === 0 ? (
            <p className="text-xs text-muted-foreground">No problems so far.</p>
          ) : (
            <div className="space-y-2">
              <ul className="zoo-scroll max-h-48 space-y-1.5 overflow-y-auto text-xs" data-testid="problems-list">
                {[...problems].reverse().map((problem) => (
                  <li key={problem.id} className="rounded-lg border px-2.5 py-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="font-semibold">
                        {PROVIDER_LABELS[problem.provider]}
                        {problem.scope === "channel" && problem.channel ? ` · #${problem.channel}` : " · global"}
                      </span>
                      <time className="text-[11px] text-muted-foreground tabular-nums" dateTime={new Date(problem.at).toISOString()}>
                        {new Date(problem.at).toLocaleString()}
                      </time>
                    </div>
                    <p className="mt-0.5 text-muted-foreground">{problem.message}</p>
                  </li>
                ))}
              </ul>
              <Button type="button" variant="outline" size="xs" onClick={() => problemLog.clear()}>
                Clear the list
              </Button>
            </div>
          )}
        </div>
      </Searchable>
    </Section>
  );
}

function UpdateRow() {
  const { rowVisible } = useSettingsSearch();
  const version = useChat((s) => s.appInfo?.version ?? "");
  const autoCheck = useChat((s) => s.settings.autoCheckUpdates);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [latest, setLatest] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<string>("");
  const showAuto = rowVisible("Storage", "auto-updates");
  const showCheck = rowVisible("Storage", "check-now");
  const showClear = rowVisible("Storage", "clear-history");
  if (!showAuto && !showCheck && !showClear) return null;

  const check = async () => {
    setBusy("check");
    setStatus("");
    try {
      const info = await fetchLatestRelease();
      setLatest(info);
      if (!info) setStatus("No portable release found on GitHub yet.");
      else if (!version || version === "dev" || !isNewerVersion(info.version, version)) {
        setStatus(`You're on the latest (${info.tag}).`);
      } else {
        setStatus(`Update available: ${info.tag}`);
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't reach GitHub.");
      setLatest(null);
    } finally {
      setBusy(null);
    }
  };

  const install = async () => {
    if (!latest) return;
    setBusy("install");
    setStatus("Downloading update… ZooChattr will restart. Your channels stay in ZooChattr-data.");
    try {
      // Settings webview cannot call apply_update — ask main to install.
      if (isTauri) {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        if (getCurrentWindow().label === "settings") {
          const { emit } = await import("@tauri-apps/api/event");
          await emit("install-update-requested", { downloadUrl: latest.downloadUrl });
          setStatus("Handing install to the main window… ZooChattr will restart.");
          return;
        }
      }
      await applyUpdate(latest.downloadUrl);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't install the update.");
      setBusy(null);
    }
  };

  const newer = latest && version && version !== "dev" && isNewerVersion(latest.version, version);

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
      <Searchable section="Storage" id="auto-updates">
        <ToggleRow
          id="pref-auto-updates"
          label="Check for updates automatically"
          hint="Looks on GitHub when ZooChattr starts and every few hours. You'll get a toast if a newer portable build is out."
          setting="autoCheckUpdates"
        />
      </Searchable>
      <Searchable section="Storage" id="check-now">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void check()} data-testid="check-updates">
              <RefreshCw className={cn("size-3.5", busy === "check" && "animate-spin")} />
              Check now
            </Button>
            {newer ? (
              <Button type="button" size="sm" disabled={busy !== null || !isTauri} onClick={() => void install()} data-testid="install-update">
                <Download className="size-3.5" />
                Install {latest.tag}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void openExternal("https://github.com/gecko-of-shadow/ZooChattr/releases")}
            >
              Releases
            </Button>
          </div>
          {status ? <p className="text-xs text-muted-foreground">{status}</p> : null}
          <p className="text-[11px] text-muted-foreground">
            {autoCheck ? "Auto-check is on. " : "Auto-check is off — use Check now anytime. "}
            Updates replace only ZooChattr.exe. Your <code className="font-mono">ZooChattr-data</code> folder (channels, chat history, settings) stays put.
          </p>
        </div>
      </Searchable>
      <Searchable section="Storage" id="clear-history">
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="clear-chat-history"
          onClick={() => void chat.clearSavedHistory()}
        >
          Clear saved chat history
        </Button>
      </Searchable>
    </div>
  );
}

function BackupRow() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const timer = setTimeout(() => setConfirmReset(false), 4_000);
    return () => clearTimeout(timer);
  }, [confirmReset]);

  const backupText = () => JSON.stringify(makeBackup(useChat.getState().settings), null, 2);

  const download = () => {
    const blob = new Blob([backupText()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `zoochattr-settings-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast("Backup saved", { description: "Check your Downloads folder. Includes your channel list, not your login." });
  };

  const restoreText = (text: string, source: string) => {
    const settings = readBackup(text);
    if (!settings) {
      toast.error(`That ${source} isn't a ZooChattr settings backup.`);
      return;
    }
    chat.replacePreferences(settings);
    const before = new Set(useChat.getState().settings.channels);
    const added = settings.channels.filter((c) => !before.has(c));
    for (const channel of added) chat.addChannel(channel);
    toast.success("Settings restored", {
      description: added.length
        ? `Joined ${added.length} channel${added.length === 1 ? "" : "s"} from the backup too. Your login was left alone.`
        : "Your channels and login were left as they were.",
    });
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    restoreText(await file.text(), "file");
  };

  return (
    <Searchable section="Storage" id="backup">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={download}>
            <Download /> Back up
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload /> Restore from file
          </Button>
          <Button
            variant={confirmReset ? "destructive" : "outline"}
            size="sm"
            data-testid="settings-reset"
            onClick={() => {
              if (!confirmReset) {
                setConfirmReset(true);
                return;
              }
              chat.replacePreferences(DEFAULT_SETTINGS);
              setConfirmReset(false);
              toast("Settings reset", { description: "Everything but your channels and login is back to the defaults." });
            }}
          >
            <RotateCcw /> {confirmReset ? "Really reset?" : "Reset"}
          </Button>
          <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void onFile(event)} aria-hidden />
        </div>
        <p className="text-xs text-muted-foreground">
          Backups hold your preferences, favourites and channel list as plain JSON. Your Twitch login is never included.
        </p>
      </div>
    </Searchable>
  );
}

/** Shared settings sections (dialog in the browser, full window on desktop). */
export function SettingsBody({
  onRequestLogin,
  searchQuery = "",
}: {
  onRequestLogin: () => void;
  searchQuery?: string;
}) {
  const skin = useChat((s) => s.settings.skin);
  const appInfo = useChat((s) => s.appInfo);
  const auth = useChat((s) => s.auth);
  const search = useMemo(() => settingsSearchHelpers(searchQuery), [searchQuery]);

  return (
    <SettingsSearchContext.Provider value={search}>
      <div className="space-y-6">
        {!search.hasMatches ? (
          <p className="text-sm text-muted-foreground" data-testid="settings-search-empty">
            No settings match
          </p>
        ) : null}

        <Section icon={Palette} title="Theme">
          <div className="grid grid-cols-2 gap-2">
            {SKIN_ORDER.map((id) => THEMES[id]).map((option) => (
              <Searchable key={option.id} section="Theme" id={option.id}>
                <button
                  type="button"
                  data-skin={option.id}
                  onClick={() => chat.updateSettings({ skin: option.id })}
                  aria-pressed={skin === option.id}
                  className={cn(
                    "zoo-texture relative flex w-full flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    skin === option.id ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50",
                  )}
                >
                  {option.kind === "animal" ? (
                    <Mascot skin={option.id} className="size-9" anim={skin === option.id ? "idle" : "none"} />
                  ) : (
                    <span
                      className="grid size-9 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg border border-border/70"
                      aria-hidden
                    >
                      <span className="bg-background" />
                      <span className="bg-primary" />
                      <span className="bg-mention" />
                      <span className="bg-card" />
                    </span>
                  )}
                  <span className="text-[13px] font-semibold text-foreground">{option.name}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{option.blurb}</span>
                  {skin === option.id ? (
                    <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </button>
              </Searchable>
            ))}
          </div>
        </Section>

        <Section icon={Type} title="Chat display">
          <div className="space-y-3">
            <Searchable section="Chat display" id="text-size">
              <TextSizeRow />
            </Searchable>
            <Searchable section="Chat display" id="timestamps">
              <ToggleRow id="pref-ts" label="Timestamps" setting="showTimestamps" />
            </Searchable>
            <Searchable section="Chat display" id="24h">
              <ToggleRow id="pref-24h" label="24-hour clock" setting="use24h" />
            </Searchable>
            <Searchable section="Chat display" id="badges">
              <ToggleRow id="pref-badges" label="Badges" hint="Mod, VIP, sub and other chat badges" setting="showBadges" />
            </Searchable>
            <Searchable section="Chat display" id="zebra">
              <ToggleRow id="pref-zebra" label="Striped rows" hint="Shade every other line" setting="zebra" />
            </Searchable>
            <Searchable section="Chat display" id="deleted">
              <ToggleRow
                id="pref-deleted"
                label="Show deleted messages"
                hint="Keep what a mod removed readable, faded and crossed out, instead of hiding it"
                setting="showDeleted"
              />
            </Searchable>
            <Searchable section="Chat display" id="highlight">
              <WordListField
                id="pref-highlight"
                label="Highlight words"
                hint="Besides your own name, messages with these words light up and count as mentions."
                placeholder={"giveaway\nmy_nickname"}
                setting="highlightWords"
              />
            </Searchable>
            <Searchable section="Chat display" id="mention-sound">
              <MentionSoundRow />
            </Searchable>
          </div>
        </Section>

        <EmotesSection />

        <ChannelOverridesSection />

        <Section icon={AppWindow} title="Window">
          <div className="space-y-3">
            <Searchable section="Window" id="tray">
              <ToggleRow
                id="pref-tray"
                label="Close to tray"
                hint="Closing the window keeps ZooChattr running in the system tray, so your chats stay connected. Right-click the tray icon and choose Quit to exit — you'll get a confirmation first."
                setting="closeToTray"
              />
            </Searchable>
            <Searchable section="Window" id="startup">
              <ToggleRow
                id="pref-startup"
                label="Start with Windows"
                hint="Open ZooChattr when you sign in to Windows. Uses a shortcut in your Startup folder."
                setting="startOnLogin"
              />
            </Searchable>
            <Searchable section="Window" id="confirm-channel">
              <ToggleRow
                id="pref-confirm-channel"
                label="Confirm channel before typing"
                hint="Each message box stays locked until you confirm the channel, so you don’t send in the wrong room when several chats are open."
                setting="confirmChannelSwitch"
              />
            </Searchable>
            <Searchable section="Window" id="read-only">
              <ToggleRow
                id="pref-read-only"
                label="Read only"
                hint="Hide the message box on every pane so you can watch without accidentally chatting. Toggle from the top bar too."
                setting="readOnly"
              />
            </Searchable>
            <Searchable section="Window" id="history">
              <ToggleRow
                id="pref-chat-history"
                label="Remember chat history"
                hint="Keeps about 48 hours of messages per channel in ZooChattr-data so logs come back after you quit. Turn off to stop saving (and wipe what's stored)."
                setting="rememberChatHistory"
              />
            </Searchable>
          </div>
        </Section>

        <Section icon={KeyRound} title="Twitch account">
          <div className="space-y-3">
            <Searchable section="Twitch account" id="login">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {auth.status === "logged_in" ? (
                    <>
                      Logged in as <b className="text-foreground">{auth.login}</b>
                      {auth.remembered ? "" : " (this login won't be remembered after you quit)"}.
                    </>
                  ) : (
                    "Not logged in. You can read any channel anonymously."
                  )}
                </p>
                {auth.status === "logged_in" ? (
                  <Button variant="outline" size="sm" onClick={() => void chat.logout()}>
                    Log out
                  </Button>
                ) : (
                  <Button size="sm" onClick={onRequestLogin}>
                    Log in with Twitch
                  </Button>
                )}
              </div>
            </Searchable>
            <Searchable section="Twitch account" id="client-id">
              <ClientIdField />
            </Searchable>
          </div>
        </Section>

        <Section icon={FolderOpen} title="Storage">
          <div className="space-y-3">
            <Searchable section="Storage" id="paths">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">Mode</dt>
                <dd>
                  {appInfo?.portable
                    ? "Portable (data lives next to ZooChattr)"
                    : appInfo?.platform === "browser"
                      ? "Browser dev mode"
                      : "Per-user app data folder"}
                </dd>
                <dt className="text-muted-foreground">Settings</dt>
                <dd className="font-mono break-all">{appInfo?.dataDir ?? "…"}</dd>
                <dt className="text-muted-foreground">Login</dt>
                <dd>{appInfo?.tokenStore ?? "…"}</dd>
                <dt className="text-muted-foreground">Version</dt>
                <dd>ZooChattr {appInfo?.version ?? ""}</dd>
              </dl>
            </Searchable>
            <UpdateRow />
            <BackupRow />
          </div>
        </Section>

        <ProblemsSection />
      </div>
    </SettingsSearchContext.Provider>
  );
}

/** Browser / e2e: modal dialog. Desktop uses the Settings popout window instead. */
export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!open) setSearchQuery("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.setState({ settingsOpen: next })}>
      <DialogContent className="flex h-[min(88vh,760px)] max-h-[min(88vh,760px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sticky top-0 z-20 shrink-0 space-y-3 border-b border-border/70 bg-background/95 px-4 pt-4 pr-12 pb-3 backdrop-blur">
          <div className="space-y-1">
            <DialogTitle className="text-lg">Settings</DialogTitle>
            <DialogDescription>Saved automatically to this ZooChattr folder.</DialogDescription>
          </div>
          <Input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings"
            data-testid="settings-search"
            className="h-8"
          />
        </DialogHeader>

        <div className="zoo-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <SettingsBody
            searchQuery={searchQuery}
            onRequestLogin={() => useUi.setState({ settingsOpen: false, loginOpen: true })}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
