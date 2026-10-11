import { useEffect, useState } from "react";
import { Check, FolderOpen, KeyRound, Palette, Type } from "lucide-react";
import { GeckoMascot } from "@/components/gecko/GeckoMascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { chat } from "@/lib/chat/controller";
import { config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useChat } from "@/store/chat";
import { SKINS, type FontSize, type Settings } from "@/store/settings";
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

function ToggleRow({ id, label, hint, setting }: { id: string; label: string; hint?: string; setting: keyof Settings }) {
  const value = useChat((s) => s.settings[setting]) as boolean;
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
            ? "This copy of ChatDeck ships with a Client ID, so login works out of the box."
            : "No Client ID is built in. Reading chat works anyway; login needs one."}
      </p>
    </form>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const skin = useChat((s) => s.settings.skin);
  const fontSize = useChat((s) => s.settings.fontSize);
  const appInfo = useChat((s) => s.appInfo);
  const auth = useChat((s) => s.auth);

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.setState({ settingsOpen: next })}>
      <DialogContent className="gecko-scroll max-h-[min(88vh,760px)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Settings</DialogTitle>
          <DialogDescription>Saved automatically to this ChatDeck folder.</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Section icon={Palette} title="Gecko skin">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {SKINS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-skin={option.id}
                  onClick={() => chat.updateSettings({ skin: option.id })}
                  aria-pressed={skin === option.id}
                  className={cn(
                    "gecko-scales relative flex flex-col items-start gap-1.5 rounded-xl border p-2.5 text-left transition",
                    skin === option.id ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50",
                  )}
                >
                  <GeckoMascot className="size-9" anim={skin === option.id ? "idle" : "none"} />
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
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm">Text size</span>
                <div className="flex rounded-lg border bg-muted/60 p-0.5" role="radiogroup" aria-label="Text size">
                  {(["sm", "md", "lg"] as FontSize[]).map((size) => (
                    <button
                      key={size}
                      type="button"
                      role="radio"
                      aria-checked={fontSize === size}
                      onClick={() => chat.updateSettings({ fontSize: size })}
                      className={cn(
                        "h-6.5 rounded-md px-2.5 text-xs font-medium",
                        fontSize === size ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {size === "sm" ? "Small" : size === "md" ? "Medium" : "Large"}
                    </button>
                  ))}
                </div>
              </div>
              <ToggleRow id="pref-ts" label="Timestamps" setting="showTimestamps" />
              <ToggleRow id="pref-24h" label="24-hour clock" setting="use24h" />
              <ToggleRow id="pref-badges" label="Badges" hint="Mod, VIP, sub and other chat badges" setting="showBadges" />
              <ToggleRow id="pref-zebra" label="Scale stripes" hint="Shade every other line" setting="zebra" />
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
              <dd>{appInfo?.portable ? "Portable (data lives next to ChatDeck)" : appInfo?.platform === "browser" ? "Browser dev mode" : "Per-user app data folder"}</dd>
              <dt className="text-muted-foreground">Settings</dt>
              <dd className="font-mono break-all">{appInfo?.dataDir ?? "…"}</dd>
              <dt className="text-muted-foreground">Login</dt>
              <dd>{appInfo?.tokenStore ?? "…"}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>ChatDeck {appInfo?.version ?? ""}</dd>
            </dl>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
