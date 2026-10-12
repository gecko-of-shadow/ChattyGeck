import { useEffect, useRef, useState } from "react";
import {
  AppWindow,
  Check,
  ClipboardCopy,
  Download,
  FolderOpen,
  Hash,
  KeyRound,
  Palette,
  PanelLeftClose,
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
import { config } from "@/lib/config";
import { problemLog, type EmoteProblem } from "@/lib/emotes/problems";
import { emoteRegistry } from "@/lib/emotes/registry";
import { PROVIDER_LABELS, THIRD_PARTY_PROVIDERS } from "@/lib/emotes/types";
import { isTauri, openExternal } from "@/lib/platform";
import { applyUpdate, fetchLatestRelease, isNewerVersion, type UpdateInfo } from "@/lib/updates";
import { normalizeChannelName } from "@/lib/twitch/messages";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { SKIN_ORDER, THEMES } from "@/lib/themes";
import {
  CHANNEL_FEATURES,
  DEFAULT_SETTINGS,
  TEXT_SIZE_MAX,
  TEXT_SIZE_MIN,
  TEXT_SIZE_PRESETS,
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

function Section({ icon: Icon, title, children }: { icon: typeof Palette; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </section>
  );
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

function TextSizeRow() {
  const textSize = useChat((s) => s.settings.textSize);
  const [draft, setDraft] = useState(String(textSize));
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
        <ToggleRow id="pref-overlays" label="Overlay emotes" hint="Zero-width emotes stack on top of the one before them" setting="overlayEmotes" />
        <ToggleRow id="pref-preview" label="Preview on hover" hint="Point at an emote to see it big with its name and source" setting="emotePreview" />
        <ToggleRow id="pref-tab" label="Tab finishes emote names" hint="Type the first letters, press Tab; Tab again cycles the matches" setting="tabComplete" />
        <ToggleRow id="pref-picker" label="Emote menu" hint="The animal button next to the message box" setting="emotePicker" />
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
        <WordListField
          id="pref-blocked"
          label="Blocked emotes"
          hint="Names that should stay plain text. One per line (spaces and commas work too)."
          placeholder={"KEKW\nmonkaS"}
          setting="blockedEmotes"
        />
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
    </Section>
  );
}

function ProblemsSection() {
  const [problems, setProblems] = useState<EmoteProblem[]>(() => problemLog.list());
  useEffect(() => problemLog.subscribe(() => setProblems(problemLog.list())), []);

  return (
    <Section icon={TriangleAlert} title="Problems">
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
    </Section>
  );
}

function UpdateRow() {
  const version = useChat((s) => s.appInfo?.version ?? "");
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [latest, setLatest] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<string>("");

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
      await applyUpdate(latest.downloadUrl);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Couldn't install the update.");
      setBusy(null);
    }
  };

  const newer = latest && version && version !== "dev" && isNewerVersion(latest.version, version);

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void check()} data-testid="check-updates">
          <RefreshCw className={cn("size-3.5", busy === "check" && "animate-spin")} />
          Check for updates
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
        Updates replace only ZooChattr.exe next to this copy. Your <code className="font-mono">ZooChattr-data</code> folder (channels, settings) is never overwritten.
      </p>
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(backupText());
      toast("Settings copied", { description: "Paste them somewhere safe, or straight into another ZooChattr." });
    } catch {
      toast.error("Couldn't reach the clipboard");
    }
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

  const pasteRestore = async () => {
    try {
      restoreText(await navigator.clipboard.readText(), "clipboard text");
    } catch {
      toast.error("Couldn't read the clipboard", { description: "Use Restore from file instead." });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <Button variant="outline" size="sm" onClick={download}>
          <Download /> Back up
        </Button>
        <Button variant="outline" size="sm" onClick={() => void copy()}>
          <ClipboardCopy /> Copy
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
          <Upload /> Restore from file
        </Button>
        <Button variant="outline" size="sm" onClick={() => void pasteRestore()}>
          Restore from clipboard
        </Button>
        <Button
          variant={confirmReset ? "destructive" : "outline"}
          size="sm"
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
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const skin = useChat((s) => s.settings.skin);
  const appInfo = useChat((s) => s.appInfo);
  const auth = useChat((s) => s.auth);

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.setState({ settingsOpen: next })}>
      <DialogContent className="zoo-scroll max-h-[min(88vh,760px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Settings</DialogTitle>
          <DialogDescription>Saved automatically to this ZooChattr folder.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Section icon={Palette} title="Animal theme">
            <div className="grid grid-cols-2 gap-2">
              {SKIN_ORDER.map((id) => THEMES[id]).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-skin={option.id}
                  onClick={() => chat.updateSettings({ skin: option.id })}
                  aria-pressed={skin === option.id}
                  className={cn(
                    "zoo-texture relative flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                    skin === option.id ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50",
                  )}
                >
                  <Mascot skin={option.id} className="size-9" anim={skin === option.id ? "idle" : "none"} />
                  <span className="text-[13px] font-semibold text-foreground">{option.name}</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">{option.blurb}</span>
                  {skin === option.id ? (
                    <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={Type} title="Chat display">
            <div className="space-y-3">
              <TextSizeRow />
              <ToggleRow id="pref-ts" label="Timestamps" setting="showTimestamps" />
              <ToggleRow id="pref-24h" label="24-hour clock" setting="use24h" />
              <ToggleRow id="pref-badges" label="Badges" hint="Mod, VIP, sub and other chat badges" setting="showBadges" />
              <ToggleRow id="pref-zebra" label="Striped rows" hint="Shade every other line" setting="zebra" />
              <ToggleRow
                id="pref-deleted"
                label="Show deleted messages"
                hint="Keep what a mod removed readable, faded and crossed out, instead of hiding it"
                setting="showDeleted"
              />
              <WordListField
                id="pref-highlight"
                label="Highlight words"
                hint="Besides your own name, messages with these words light up and count as mentions."
                placeholder={"giveaway\nmy_nickname"}
                setting="highlightWords"
              />
            </div>
          </Section>

          <EmotesSection />

          <ChannelOverridesSection />

          <Section icon={AppWindow} title="Window">
            <ToggleRow
              id="pref-tray"
              label="Close to tray"
              hint="Closing the window keeps ZooChattr running in the system tray, so your chats stay connected. Right-click the tray icon and choose Quit to exit — you'll get a confirmation first."
              setting="closeToTray"
            />
            <ToggleRow
              id="pref-startup"
              label="Start with Windows"
              hint="Open ZooChattr when you sign in to Windows. Uses a shortcut in your Startup folder."
              setting="startOnLogin"
            />
            <ToggleRow
              id="pref-chrome"
              label="Hide sidebar & top bar"
              hint="Gives the chat grid more room. Use the floating button (or Settings) to bring the chrome back."
              setting="chromeHidden"
            />
            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <PanelLeftClose className="mt-0.5 size-3.5 shrink-0" />
              <p>In Grid view you can also hide chrome with the button in the top bar — same as this switch.</p>
            </div>
          </Section>

          <Section icon={KeyRound} title="Twitch account">
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
            <ClientIdField />
            {auth.status === "logged_in" ? (
              <Button variant="outline" size="sm" onClick={() => void chat.logout()}>
                Log out
              </Button>
            ) : (
              <Button size="sm" onClick={() => useUi.setState({ settingsOpen: false, loginOpen: true })}>
                Log in with Twitch
              </Button>
            )}
          </Section>

          <Section icon={FolderOpen} title="Storage">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Mode</dt>
              <dd>{appInfo?.portable ? "Portable (data lives next to ZooChattr)" : appInfo?.platform === "browser" ? "Browser dev mode" : "Per-user app data folder"}</dd>
              <dt className="text-muted-foreground">Settings</dt>
              <dd className="font-mono break-all">{appInfo?.dataDir ?? "…"}</dd>
              <dt className="text-muted-foreground">Login</dt>
              <dd>{appInfo?.tokenStore ?? "…"}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>ZooChattr {appInfo?.version ?? ""}</dd>
            </dl>
            <UpdateRow />
            <BackupRow />
          </Section>

          <ProblemsSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
