import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { GeckoMascot } from "@/components/gecko/GeckoMascot";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { chat } from "@/lib/chat/controller";
import { config } from "@/lib/config";
import { openExternal } from "@/lib/platform";
import { AuthError, pollDeviceFlow, startDeviceFlow, type DeviceCode } from "@/lib/twitch/auth";
import { useChat } from "@/store/chat";
import { useUi } from "@/store/ui";

type Phase = "idle" | "starting" | "waiting" | "finishing" | "error";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function ClientIdSetup() {
  const [draft, setDraft] = useState("");
  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-3 text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Twitch login needs a Client ID first.</p>
        <ol className="list-decimal space-y-1 pl-4 text-[13px]">
          <li>
            Open the{" "}
            <button
              type="button"
              className="text-primary underline underline-offset-2"
              onClick={() => void openExternal("https://dev.twitch.tv/console/apps/create")}
            >
              Twitch Developer Console
            </button>{" "}
            and register an application.
          </li>
          <li>
            Set <b>Client Type</b> to <b>Public</b>. For <b>OAuth Redirect URLs</b> enter{" "}
            <code className="rounded bg-muted px-1">http://localhost</code> (ZooChattr doesn't use it, but the form
            requires one).
          </li>
          <li>Copy the Client ID and paste it below. It isn't a secret.</li>
        </ol>
      </div>
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) chat.updateSettings({ clientId: draft.trim() });
        }}
      >
        <Label htmlFor="client-id">Twitch Client ID</Label>
        <div className="flex gap-2">
          <Input
            id="client-id"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="e.g. abcd1234efgh5678ijkl9012mnop34"
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={!draft.trim()}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}

export function LoginDialog() {
  const open = useUi((s) => s.loginOpen);
  const clientId = useChat((s) => s.settings.clientId) || config.builtInClientId;
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState<DeviceCode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  const generation = useRef(0);

  useEffect(() => {
    if (open) return;
    generation.current++;
    setPhase("idle");
    setCode(null);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const close = () => useUi.setState({ loginOpen: false });

  const poll = async (device: DeviceCode, gen: number) => {
    let interval = device.intervalMs;
    while (generation.current === gen && Date.now() < device.expiresAt) {
      await sleep(interval);
      if (generation.current !== gen) return;
      try {
        const result = await pollDeviceFlow(clientId, device.deviceCode);
        if (generation.current !== gen) return;
        switch (result.status) {
          case "pending":
            continue;
          case "slow_down":
            interval += 5_000;
            continue;
          case "denied":
            setPhase("error");
            setError("The login was declined on Twitch. Nothing changed.");
            return;
          case "expired":
            setPhase("error");
            setError("That code expired. Get a fresh one to try again.");
            return;
          case "success":
            setPhase("finishing");
            await chat.completeLogin(result.session);
            close();
            return;
        }
      } catch (err) {
        if (err instanceof AuthError) {
          setPhase("error");
          setError(err.message);
          return;
        }
        // Network hiccup: keep polling until the code expires.
      }
    }
    if (generation.current === gen) {
      setPhase("error");
      setError("That code expired. Get a fresh one to try again.");
    }
  };

  const start = async () => {
    const gen = ++generation.current;
    setPhase("starting");
    setError(null);
    try {
      const device = await startDeviceFlow(clientId);
      if (generation.current !== gen) return;
      setCode(device);
      setPhase("waiting");
      void openExternal(device.verificationUri);
      void poll(device, gen);
    } catch (err) {
      if (generation.current !== gen) return;
      setPhase("error");
      setError(
        err instanceof AuthError
          ? err.message
          : "Couldn't reach Twitch to start the login. Check your connection and try again.",
      );
    }
  };

  const remaining = code ? Math.max(0, Math.floor((code.expiresAt - now) / 1000)) : 0;

  return (
    <Dialog open={open} onOpenChange={(next) => useUi.setState({ loginOpen: next })}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-4.5 text-primary" /> Log in with Twitch
          </DialogTitle>
          <DialogDescription>
            ZooChattr uses Twitch's device login: you approve it on twitch.tv, and your password never touches this
            app.
          </DialogDescription>
        </DialogHeader>

        {!clientId ? (
          <ClientIdSetup />
        ) : phase === "waiting" || phase === "finishing" ? (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <GeckoMascot anim="scurry" className="size-14" />
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Approve this code on Twitch:</p>
              <div className="gecko-glow flex items-center gap-2 rounded-xl bg-background px-4 py-2.5">
                <span className="font-mono text-2xl font-bold tracking-[0.25em] text-primary sm:text-3xl">
                  {code?.userCode}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy code"
                  onClick={() => {
                    if (!code) return;
                    void navigator.clipboard?.writeText(code.userCode).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                >
                  {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>
            <Button className="gap-1.5" onClick={() => code && void openExternal(code.verificationUri)}>
              <ExternalLink className="size-4" /> Open twitch.tv/activate
            </Button>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <LoaderCircle className="size-3.5 animate-spin" />
              {phase === "finishing"
                ? "Approved! Sticking your login in place…"
                : `Waiting for you on Twitch · code expires in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4.5 shrink-0 text-primary" />
              <div className="text-muted-foreground">
                ZooChattr only asks for <code className="rounded bg-muted px-1 text-foreground">chat:read</code> and{" "}
                <code className="rounded bg-muted px-1 text-foreground">chat:edit</code>: enough to read and send chat,
                nothing else. Your login is stored in your system's credential store.
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button className="w-full gap-2" onClick={() => void start()} disabled={phase === "starting"}>
              {phase === "starting" ? <LoaderCircle className="size-4 animate-spin" /> : <GeckoMascot className="size-5" />}
              {phase === "error" ? "Get a fresh code" : "Get a login code"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
