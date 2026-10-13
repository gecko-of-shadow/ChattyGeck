import type { ChatMessage, MessageKind, NoticeTone } from "@/lib/twitch/types";

/** Keep messages from the last two days. */
export const HISTORY_TTL_MS = 48 * 60 * 60_000;

/**
 * Hard ceiling per channel so a hyper-active chat can't fill the disk.
 * ~48h of a busy Twitch chat is usually well under this.
 */
export const HISTORY_HARD_CAP = 25_000;

const KINDS: MessageKind[] = ["chat", "action", "event", "notice", "system"];
const TONES: NoticeTone[] = ["info", "warn", "error", "success"];

/** Marker row inserted between restored history and new live chat (never written to disk). */
export const HISTORY_BOUNDARY_PREFIX = "hist-boundary:";

export function isHistoryBoundary(message: ChatMessage): boolean {
  return message.id.startsWith(HISTORY_BOUNDARY_PREFIX);
}

export function historyBoundary(channel: string): ChatMessage {
  return {
    id: `${HISTORY_BOUNDARY_PREFIX}${channel}`,
    channel,
    kind: "system",
    ts: Date.now(),
    badges: [],
    text: "Earlier session — new messages appear below",
    twitchEmotes: [],
    tone: "info",
  };
}

function cleanString(value: unknown, max = 2_000): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

function trimByAgeAndCap(messages: ChatMessage[], now = Date.now()): ChatMessage[] {
  const cutoff = now - HISTORY_TTL_MS;
  const fresh = messages.filter((m) => m.ts >= cutoff);
  return fresh.length > HISTORY_HARD_CAP ? fresh.slice(-HISTORY_HARD_CAP) : fresh;
}

/** Accepts whatever was on disk and returns a safe message list (newest last, within 48h). */
export function sanitizeHistory(raw: unknown, now = Date.now()): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const cutoff = now - HISTORY_TTL_MS;
  const out: ChatMessage[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const m = entry as Record<string, unknown>;
    const id = cleanString(m.id, 128);
    const channel = cleanString(m.channel, 64);
    const text = cleanString(m.text, 2_000);
    const kind = KINDS.includes(m.kind as MessageKind) ? (m.kind as MessageKind) : null;
    const ts = typeof m.ts === "number" && Number.isFinite(m.ts) ? m.ts : null;
    if (!id || !channel || text === undefined || !kind || ts === null) continue;
    if (id.startsWith(HISTORY_BOUNDARY_PREFIX)) continue;
    if (m.pending) continue;
    if (ts < cutoff) continue;

    const message: ChatMessage = {
      id,
      channel,
      kind,
      ts,
      badges: Array.isArray(m.badges)
        ? m.badges
            .filter((b): b is { setId: string; version: string; info?: string } => !!b && typeof b === "object")
            .map((b) => ({
              setId: String((b as { setId?: unknown }).setId ?? "").slice(0, 64),
              version: String((b as { version?: unknown }).version ?? "").slice(0, 64),
              info: cleanString((b as { info?: unknown }).info, 64),
            }))
            .filter((b) => b.setId && b.version)
        : [],
      text,
      twitchEmotes: Array.isArray(m.twitchEmotes)
        ? m.twitchEmotes
            .filter((e): e is { id: string; start: number; end: number } => !!e && typeof e === "object")
            .map((e) => ({
              id: String((e as { id?: unknown }).id ?? "").slice(0, 64),
              start: Number((e as { start?: unknown }).start) || 0,
              end: Number((e as { end?: unknown }).end) || 0,
            }))
            .filter((e) => e.id && e.end >= e.start)
        : [],
      login: cleanString(m.login, 64),
      userId: cleanString(m.userId, 64),
      displayName: cleanString(m.displayName, 64),
      color: cleanString(m.color, 32),
      firstMsg: m.firstMsg === true ? true : undefined,
      highlighted: m.highlighted === true ? true : undefined,
      systemText: cleanString(m.systemText, 500),
      tone: TONES.includes(m.tone as NoticeTone) ? (m.tone as NoticeTone) : undefined,
      mention: m.mention === true ? true : undefined,
      self: m.self === true ? true : undefined,
      deleted: m.deleted === true ? true : undefined,
    };

    if (m.reply && typeof m.reply === "object") {
      const r = m.reply as Record<string, unknown>;
      const login = cleanString(r.login, 64);
      const displayName = cleanString(r.displayName, 64) ?? login;
      const replyText = cleanString(r.text, 500);
      if (login && displayName && replyText !== undefined) {
        message.reply = { login, displayName, text: replyText };
      }
    }

    out.push(message);
    if (out.length >= HISTORY_HARD_CAP) break;
  }
  return trimByAgeAndCap(out, now);
}

/** Strip UI-only rows, drop anything older than 48h, then hard-cap. */
export function messagesForDisk(messages: ChatMessage[], now = Date.now()): ChatMessage[] {
  return trimByAgeAndCap(
    messages.filter((m) => !isHistoryBoundary(m) && !m.pending),
    now,
  );
}

/**
 * Drop a leading run of expired rows, then the hard cap.
 * Messages are newest-last. Returns the same array when nothing has to go,
 * so a busy channel does not copy tens of thousands of rows on every flush.
 */
export function trimLiveBuffer(messages: ChatMessage[], now = Date.now()): ChatMessage[] {
  const cutoff = now - HISTORY_TTL_MS;
  let start = 0;
  const count = messages.length;
  while (start < count && messages[start].ts < cutoff) start++;
  const over = count - start - HISTORY_HARD_CAP;
  if (over > 0) start += over;
  return start === 0 ? messages : messages.slice(start);
}
