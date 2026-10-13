import type { Animal } from "@/lib/themes";

/** Rising or falling pair, one short sine chime per animal. */
const CHIME: Record<Animal, number[]> = {
  gecko: [784, 1046],
  penguin: [523, 392],
  turtle: [349, 262],
  elephant: [220, 277],
};

let chimesPlayed = 0;
let audio: AudioContext | null = null;

/** How many chimes were started this session (preview and live mentions). */
export function mentionChimesPlayed(): number {
  return chimesPlayed;
}

/**
 * True when a live mention may chime. `lastAt` of 0 means none has played yet.
 * The preview button does not call this, so hearing the sound does not start the wait.
 */
export function mentionDue(now: number, lastAt: number, cooldownMs: number): boolean {
  return lastAt <= 0 || now - lastAt >= cooldownMs;
}

/** Play the mention chime. Missing audio (tests, autoplay, no device) is ignored. */
export function playMentionChime(animal: Animal): void {
  chimesPlayed += 1;
  if (typeof window === "undefined") return;
  try {
    const Ctx = window.AudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume();
    const now = ctx.currentTime;
    const notes = CHIME[animal] ?? CHIME.gecko;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    master.connect(ctx.destination);
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      const gain = ctx.createGain();
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.9, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      osc.connect(gain);
      gain.connect(master);
      osc.start(start);
      osc.stop(start + 0.18);
    });
  } catch {
    // A blocked autoplay policy or a missing device should not break chat.
  }
}
